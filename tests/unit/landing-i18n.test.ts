import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translateText } from '../../apps/web/lib/i18n.js';

const landingSource = readFileSync(join(process.cwd(), 'apps/web/components/landing-page.tsx'), 'utf8');
const pageSource = readFileSync(join(process.cwd(), 'apps/web/app/page.tsx'), 'utf8');
const landingText = [...new Set([
  ...Array.from(landingSource.matchAll(/tr\('([^']+)'\)|(?:title|description): '([^']+)'/g), (match) => match[1] ?? match[2] ?? ''),
  ...Array.from(pageSource.matchAll(/(?:absolute|description): '([^']+)'/g), (match) => match[1] ?? ''),
].filter(Boolean))];

describe('public landing translations', () => {
  it.each(['en', 'fr'] as const)('translates every landing label, workflow step, feature, and metadata string into %s', (locale) => {
    expect(landingText.length).toBeGreaterThan(30);
    expect(landingText.filter((text) => translateText(locale, text) === text)).toEqual([]);
  });

  it('preserves Spanish copy and brand names while translating the development credit', () => {
    for (const text of landingText) expect(translateText('es', text)).toBe(text);
    for (const locale of ['es', 'en', 'fr'] as const) {
      expect(translateText(locale, 'GestionChurch')).toBe('GestionChurch');
      expect(translateText(locale, 'Idara Global Technologies')).toBe('Idara Global Technologies');
    }
    expect(translateText('en', 'Desarrollado por')).toBe('Developed by');
    expect(translateText('fr', 'Desarrollado por')).toBe('Développé par');
  });
});
