import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

// Supplemental source-pattern scan, not a substitute for a reviewed entropy/
// history scanner or an independent security assessment. Never emit matches.
const ignored = new Set(['node_modules', '.git', '.next', '.local', 'dist', 'coverage', 'test-results', 'playwright-report']);
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.ps1', '.cmd', '.html']);
const patterns: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'private-key-material', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----(?:[\r\n]|\\[rn])+[A-Za-z0-9+/=]{40,}/ },
  { kind: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { kind: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { kind: 'provider-api-token', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/ },
  { kind: 'meta-access-token', pattern: /\bEAA[A-Za-z0-9]{70,}\b/ },
  { kind: 'credential-bearing-database-url', pattern: /postgres(?:ql)?:\/\/[^\s:@/'"]+:[^\s@/'"]{8,}@/ },
];
let inspected = 0;
const findings: Array<{ project: string; file: string; kind: string }> = [];
async function inspect(root: string, folder: string): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('.local') || entry.isSymbolicLink()) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) { await inspect(root, path); continue; }
    // Runtime credentials/distribution documents are deliberately not read or
    // reported here. They require separate restricted secret-store review.
    if (!extensions.has(extname(entry.name)) || entry.name.startsWith('.env')) continue;
    const source = await readFile(path, 'utf8');
    inspected += 1;
    for (const { kind, pattern } of patterns) if (pattern.test(source)) findings.push({ project: root, file: relative(root, path).replaceAll('\\', '/'), kind });
  }
}
const roots = process.argv.slice(2).map((root) => resolve(root));
if (!roots.length) roots.push(resolve('.'));
for (const root of roots) await inspect(root, root);
console.log(JSON.stringify({ tool: 'supplemental-source-pattern-scan', version: 1, inspectedFiles: inspected, patterns: patterns.length, excludes: [...ignored, 'runtime .env', 'non-code credential distribution files'], findings }, null, 2));
if (findings.length) process.exitCode = 1;
