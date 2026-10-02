import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const requireNominations = createRequire('X:/CODE/NOMBRAMIENTOS/apps/web/package.json');
// This helper uses the Nombramientos compiler (5.9), not GestionChurch's native
// TypeScript 7 package, whose public API no longer exports transpileModule.
type NominationsCompiler = {
  ScriptTarget: { ES2022: number };
  ModuleKind: { CommonJS: number };
  transpileModule(source: string, options: { compilerOptions: { target: number; module: number } }): { outputText: string };
};
const compiler = requireNominations('typescript') as NominationsCompiler;
const source = readFileSync('X:/CODE/NOMBRAMIENTOS/apps/web/lib/device-session-proof.ts', 'utf8');
const compiled = compiler.transpileModule(source, { compilerOptions: { target: compiler.ScriptTarget.ES2022, module: compiler.ModuleKind.CommonJS } }).outputText;

// Execute the actual pure client helper in two real browser tabs. No login,
// church database, existing key, permission or application session is involved.
test('real IndexedDB signer creation is immutable across tabs, scopes and reloads', async ({ browser }) => {
  const context = await browser.newContext();
  await context.route('http://localhost:3000/__synthetic-device-storage', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Synthetic device storage</title></head><body>Isolated browser storage validation</body></html>' }));
  const scope = { tenantId: crypto.randomUUID(), identityId: crypto.randomUUID(), deviceId: crypto.randomUUID() };
  try {
    const tabA = await context.newPage(), tabB = await context.newPage();
    for (const tab of [tabA, tabB]) {
      await tab.goto('http://localhost:3000/__synthetic-device-storage');
      await tab.addScriptTag({ content: `(() => { const exports = {}; ${compiled}\n window.__deviceSignerTest = exports; })();` });
    }
    const register = async (tab: typeof tabA) => tab.evaluate(async (input) => {
      const helpers = (window as unknown as { __deviceSignerTest: {
        createLocalDeviceSigner(input: object): Promise<{ fingerprint: string; privateKey: CryptoKey }>;
        saveLocalDeviceSigner(signer: object): Promise<{ fingerprint: string; privateKey: CryptoKey }>;
      } }).__deviceSignerTest;
      const generated = await helpers.createLocalDeviceSigner(input);
      const saved = await helpers.saveLocalDeviceSigner(generated);
      return { generatedFingerprint: generated.fingerprint, selectedFingerprint: saved.fingerprint, extractable: saved.privateKey.extractable };
    }, scope);
    const [first, second] = await Promise.all([register(tabA), register(tabB)]);
    expect(first.generatedFingerprint).not.toBe(second.generatedFingerprint);
    expect(first.selectedFingerprint).toBe(second.selectedFingerprint);
    expect(first.extractable || second.extractable).toBe(false);
    const stable = await tabA.evaluate(async (input) => {
      const helpers = (window as unknown as { __deviceSignerTest: {
        readLocalDeviceSigner(input: object): Promise<{ fingerprint: string; privateKey: CryptoKey; publicKey: CryptoKey }>;
        createLocalDeviceSigner(input: object): Promise<object>;
        saveLocalDeviceSigner(signer: object): Promise<{ fingerprint: string }>;
        signDeviceClaims(signer: object, claims: object): Promise<string>;
      } }).__deviceSignerTest;
      const original = await helpers.readLocalDeviceSigner(input);
      const replacement = await helpers.saveLocalDeviceSigner(await helpers.createLocalDeviceSigner(input));
      const proof = await helpers.signDeviceClaims(original, { purpose: 'synthetic-only' });
      const [header, payload, encodedSignature] = proof.split('.');
      const decoded = atob(encodedSignature!.replaceAll('-', '+').replaceAll('_', '/'));
      const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, original.publicKey,
        Uint8Array.from(decoded, (character) => character.charCodeAt(0)), new TextEncoder().encode(`${header}.${payload}`));
      let exportRejected = false;
      try { await crypto.subtle.exportKey('pkcs8', original.privateKey); } catch { exportRejected = true; }
      const otherTenant = await helpers.saveLocalDeviceSigner(await helpers.createLocalDeviceSigner({ ...input, tenantId: crypto.randomUUID() }));
      const otherIdentity = await helpers.saveLocalDeviceSigner(await helpers.createLocalDeviceSigner({ ...input, identityId: crypto.randomUUID() }));
      return { fingerprint: original.fingerprint, replacementFingerprint: replacement.fingerprint, valid, exportRejected,
        tenantSeparated: otherTenant.fingerprint !== original.fingerprint, identitySeparated: otherIdentity.fingerprint !== original.fingerprint };
    }, scope);
    expect(stable).toEqual({ fingerprint: first.selectedFingerprint, replacementFingerprint: first.selectedFingerprint,
      valid: true, exportRejected: true, tenantSeparated: true, identitySeparated: true });
    await tabA.reload();
    await tabA.addScriptTag({ content: `(() => { const exports = {}; ${compiled}\n window.__deviceSignerTest = exports; })();` });
    expect(await tabA.evaluate(async (input) => (await (window as unknown as { __deviceSignerTest: { readLocalDeviceSigner(input: object): Promise<{ fingerprint: string }> } }).__deviceSignerTest.readLocalDeviceSigner(input)).fingerprint, scope)).toBe(first.selectedFingerprint);
  } finally { await context.close(); }
});
