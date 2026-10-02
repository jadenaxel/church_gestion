import { createHash, timingSafeEqual } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

/** Validate deployment secrets before accepting production traffic. */
export function validateProductionSecurity(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const secrets = new Set<string>();
  for (const name of ['JWT_SECRET', 'INTERNAL_SERVICE_SECRET', 'CONFIG_ENCRYPTION_KEY', 'NOMINATIONS_INTEGRATION_SECRET']) {
    const value = env[name];
    if (value === undefined && ['CONFIG_ENCRYPTION_KEY', 'NOMINATIONS_INTEGRATION_SECRET'].includes(name)) continue;
    if (!value || value.length < 32 || /development|change[-_ ]?(me|this)|local-only|replace[-_ ]with|placeholder|ci-only/i.test(value)) {
      throw new Error(`${name} must be a unique production secret of at least 32 characters.`);
    }
    if (secrets.has(value)) throw new Error(`${name} must not reuse another production secret.`);
    secrets.add(value);
  }
  const origin = new URL(env.WEB_ORIGIN ?? 'http://localhost:3000');
  if (origin.protocol !== 'https:' || origin.origin !== env.WEB_ORIGIN) {
    throw new Error('WEB_ORIGIN must be an exact HTTPS origin in production.');
  }
}

/** Publicly documented demo credentials must never authenticate on a production deployment. */
export function isProductionDemoPassword(password: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' && ['GestionChurch!2026', 'Revision!2026', 'Actividad!2026'].includes(password);
}

export function matchesSecret(candidate: unknown, expected: string | undefined): boolean {
  if (typeof candidate !== 'string' || !candidate || !expected) return false;
  return timingSafeEqual(createHash('sha256').update(candidate).digest(), createHash('sha256').update(expected).digest());
}

/** Bounded local rate limiter; also used when Redis fails, never fail open. */
export class LocalRateCounter {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();
  constructor(private readonly capacity = 10_000) {}

  increment(key: string, expiresAt: number, now = Date.now()): number {
    const previous = this.entries.get(key);
    if (previous && previous.expiresAt > now) {
      previous.count++;
      return previous.count;
    }
    if (this.entries.size >= this.capacity) {
      for (const [entryKey, value] of this.entries) if (value.expiresAt <= now) this.entries.delete(entryKey);
      // Saturation must not let an attacker evict another client's active bucket.
      if (this.entries.size >= this.capacity) return Number.MAX_SAFE_INTEGER;
    }
    this.entries.set(key, { count: 1, expiresAt });
    return 1;
  }
}

/** Check ZIP metadata before any Office parser inflates attacker-controlled data. */
export function assertSafeOfficeArchive(buffer: Buffer, extension?: string): void {
  const reject = (): never => { throw Object.assign(new Error('El documento comprimido no es válido o supera los límites de seguridad.'), { status: 422, code: 'UNSAFE_OFFICE_ARCHIVE' }); };
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0) reject();
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  const offset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || count !== buffer.readUInt16LE(end + 8)
    || !count || count > 10_000 || offset + size !== end) reject();
  const names = new Set<string>();
  let cursor = offset;
  let expanded = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) reject();
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || compressed === 0xffffffff
      || uncompressed > 32 * 1024 * 1024 || uncompressed > Math.max(1024 * 1024, compressed * 200)
      || localOffset + 30 > offset || buffer.readUInt32LE(localOffset) !== 0x04034b50) reject();
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || names.has(name)) reject();
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (buffer.readUInt16LE(localOffset + 6) !== flags || buffer.readUInt16LE(localOffset + 8) !== method
      || !buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).equals(nameBytes)
      || dataStart + compressed > offset) reject();
    if (!(flags & 8) && (buffer.readUInt32LE(localOffset + 18) !== compressed || buffer.readUInt32LE(localOffset + 22) !== uncompressed)) reject();
    // Do not trust ZIP sizes alone: a forged directory can disguise a ZIP bomb.
    const contents = buffer.subarray(dataStart, dataStart + compressed);
    let actualSize: number;
    try { actualSize = method === 0 ? contents.length : inflateRawSync(contents, { maxOutputLength: Math.max(1, uncompressed + 1) }).length; }
    catch { reject(); }
    if (actualSize! !== uncompressed) reject();
    names.add(name);
    expanded += uncompressed;
    if (expanded > 64 * 1024 * 1024) reject();
    cursor = next;
  }
  if (cursor !== end) reject();
  const required = extension === '.docx' ? 'word/document.xml' : extension === '.xlsx' ? 'xl/workbook.xml' : extension === '.pptx' ? 'ppt/presentation.xml' : undefined;
  if (required && (!names.has('[Content_Types].xml') || !names.has(required))) reject();
  if (extension && ['.odt', '.ods', '.odp'].includes(extension) && (!names.has('mimetype') || !names.has('content.xml'))) reject();
}

export function officeMediaType(extension: string): string | null {
  const types: Record<string, string> = {
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.odp': 'application/vnd.oasis.opendocument.presentation'
  };
  return types[extension] ?? null;
}

/** CSV quoting alone does not stop Excel/LibreOffice formula execution. */
export function safeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: attackers can prefix spreadsheet formulas with control characters.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function safeCalendarText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r\n|\r|\n/g, '\\n');
}
