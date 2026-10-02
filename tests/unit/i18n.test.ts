import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { translateText } from '../../apps/web/lib/i18n.js';

const spanishSignal = /\b(?:de|del|la|las|el|los|para|por|con|sin|una|un|que|en|al|crear|guardar|actividad|usuario|departamento|calendario|revisi[oó]n|contrase[nñ]a|correo|iglesia|fecha|nombre|buscar|nuevo|nueva|volver|cerrar|abrir|agregar|seleccionar|pendiente|aprobaci[oó]n|configuraci[oó]n|reporte|documento|junta|anciano|ministerio|programa)\b|[áéíóúñ¿¡]/i;
const intentionalContent = new Set([
  'destinatario@correo.com', 'notificaciones@iglesia.org', 'familia, misión, jóvenes', 'ES · EN · FR',
  'useExperience debe utilizarse dentro de ExperienceProvider.'
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(fullPath) : /\.(tsx|ts)$/.test(entry.name) && entry.name !== 'i18n.ts' ? [fullPath] : [];
  });
}

function visibleSpanishLiterals(): string[] {
  const candidates = new Set<string>();
  const patterns = [
    />\s*([^<{][^<{]*?)\s*</g,
    /(?:title|text|placeholder|aria-label|eyebrow)=['"]([^'"]+)['"]/g,
    /['"]([^'"\n]{3,140})['"]/g
  ];
  for (const file of sourceFiles(join(process.cwd(), 'apps', 'web'))) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const value = match[1]!.trim().replace(/\s+/g, ' ');
        if (spanishSignal.test(value) && !intentionalContent.has(value) && !/[${}=<>\\/]/.test(value) && !value.includes('SELECT ') && !value.includes('CREATE ')) candidates.add(value);
      }
    }
  }
  return [...candidates];
}

describe('catálogo trilingüe', () => {
  it('cubre en inglés y francés cada literal visible en español', () => {
    const missing = visibleSpanishLiterals().filter((value) => translateText('en', value) === value || translateText('fr', value) === value);
    expect(missing).toEqual([]);
  });

  it('localiza fechas y mensajes operativos dinámicos sin modificar nombres propios', () => {
    expect(translateText('en', 'martes, 29 de septiembre de 2026 · 6:00 p. m.')).toContain('Tuesday');
    expect(translateText('fr', 'martes, 29 de septiembre de 2026 · 6:00 p. m.')).toContain('mardi');
    expect(translateText('en', 'Culto joven fue enviada para aprobación.')).toBe('Culto joven was submitted for approval.');
    expect(translateText('fr', 'Culto joven fue enviada para aprobación.')).toBe('Culto joven a été soumise pour approbation.');
  });

  it('localizes photo alt prefixes while keeping matching user-written names raw', () => {
    for (const locale of ['en','fr'] as const) {
      const name = 'Inicio Calendario · María';
      for (const prefix of ['Foto de ','Predicador ','Artista ']) {
        const alt = [translateText(locale,prefix),name].join('');
        expect(alt.endsWith(name)).toBe(true); expect(alt).not.toBe(`${prefix}${name}`);
      }
    }
    const women = readFileSync(join(process.cwd(),'apps/web/app/womens-ministry/page.tsx'),'utf8');
    const elders = readFileSync(join(process.cwd(),'apps/web/app/elders/page.tsx'),'utf8');
    expect(women).toContain("alt={[tr('Foto de '), woman.name].join('')}");
    expect(elders).toContain("alt={[tr('Predicador '), program.preacherName].join('')}");
    expect(elders).toContain("alt={[tr('Artista '), program.singerName].join('')}");
  });
});
