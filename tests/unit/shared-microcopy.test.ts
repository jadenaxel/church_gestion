import { describe, expect, it } from 'vitest';
import { auditFilterNames } from '../../apps/web/components/audit-filters.js';
import { badgeStatusLabel, translateText, type Locale } from '../../apps/web/lib/i18n.js';

describe('shared badge microcopy', () => {
  it.each([
    ['ELDER_ASSIGNMENT', 'Turno de ancianos', 'Elder rotation', 'Tour de service des anciens'],
    ['ELDER_PROGRAM', 'Programa de culto', 'Worship program', 'Programme du culte'],
    ['SCHEDULED', 'Programado', 'Scheduled', 'Programmé'],
    ['LOW', 'Bajo', 'Low', 'Faible']
  ])('labels observed status %s without changing the stored code', (code, spanish, english, french) => {
    const label = badgeStatusLabel(code);
    expect(label).toBe(spanish);
    expect(translateText('en', label)).toBe(english);
    expect(translateText('fr', label)).toBe(french);
    // Codes are translated by Badge only, not globally in user-provided text.
    expect(translateText('en', code)).toBe(code);
    expect(translateText('fr', code)).toBe(code);
  });

  it('retains existing labels and passes unknown values through unchanged', () => {
    expect(badgeStatusLabel('DRAFT')).toBe('Borrador');
    expect(badgeStatusLabel('APPROVED')).toBe('Aprobada');
    expect(badgeStatusLabel('HIGH')).toBe('Alto');
    for (const value of ['custom-status', 'Name LOW', 'ELDER_PROGRAM-42', 'constructor', '', '23e4c9c8-650e-4672-a88b-45bff15ab80c']) {
      expect(badgeStatusLabel(value)).toBe(value);
    }
  });
});

describe('audit filter accessible names', () => {
  it.each([
    ['es', ['Ámbito', 'Resultado', 'Desde', 'Hasta', 'Acción', 'Recurso']],
    ['en', ['Scope', 'Outcome', 'From', 'Until', 'Action', 'Resource']],
    ['fr', ['Périmètre', 'Résultat', 'Du', 'Jusqu’au', 'Action', 'Ressource']]
  ] as const)('gives each filter a stable translated name in %s, independent of its options', (locale, expected) => {
    const names = auditFilterNames((label) => translateText(locale, label));
    expect(Object.keys(names)).toEqual(['tenantId', 'outcome', 'from', 'to', 'action', 'resourceType']);
    expect(Object.values(names)).toEqual(expected);
    expect(new Set(Object.values(names)).size).toBe(6);
  });
});

describe('observed board and personal ministry microcopy', () => {
  it.each([
    ['Invitaciones', 'Invitations', 'Invitations'],
    ['Cerradas', 'Closed', 'Clôturées'],
    ['Ver recorrido misionero', 'View missionary journey', 'Voir le parcours missionnaire'],
    ['Abrir plan estratégico', 'Open strategic plan', 'Ouvrir le plan stratégique'],
    ['Estudios programados', 'Scheduled studies', 'Études programmées'],
    ['Grupos activos', 'Active groups', 'Groupes actifs'],
    ['Bautizados', 'Baptized', 'Baptisés'],
    ['Interesados y estudios', 'Interested people and studies', 'Personnes intéressées et études'],
    ['Minutos misioneros', 'Missionary minutes', 'Minutes missionnaires'],
    ['Evangelismo', 'Evangelism', 'Évangélisation']
  ])('localizes observed label %s in English and French', (spanish, english, french) => {
    expect(translateText('en', spanish)).toBe(english);
    expect(translateText('fr', spanish)).toBe(french);
    expect(translateText('es', spanish)).toBe(spanish);
  });

  it.each([
    ['125 de 125 sesiones', '125 of 125 sessions', '125 sessions sur 125'],
    ['0 de 1 sesiones', '0 of 1 session', '0 sessions sur 1'],
    ['1 de 1 sesiones', '1 of 1 session', '1 session sur 1'],
    ['1/1 confirmados · 0 caso(s)', '1/1 confirmed · 0 cases', '1/1 confirmé · 0 dossiers'],
    ['2/3 confirmados · 1 caso(s)', '2/3 confirmed · 1 case', '2/3 confirmés · 1 dossier'],
    ['0/0 confirmados · 12 caso(s)', '0/0 confirmed · 12 cases', '0/0 confirmés · 12 dossiers'],
    ['RD$60,000.00 aprobado', 'RD$60,000.00 approved', 'RD$60,000.00 approuvé'],
    ['US$0.00 aprobado', 'US$0.00 approved', 'US$0.00 approuvé']
  ])('preserves all numbers and currencies while localizing %s', (spanish, english, french) => {
    expect(translateText('en', spanish)).toBe(english);
    expect(translateText('fr', spanish)).toBe(french);
    expect(translateText('es', spanish)).toBe(spanish);
  });

  it('does not treat names or free-text identifiers as numeric session or budget summaries', () => {
    for (const locale of ['es', 'en', 'fr'] as Locale[]) {
      for (const value of ['Sesiones Familia', 'Ana aprobado', 'Persona 125 de 125 sesiones', 'draft-RD$60,000.00 aprobado', '1/1 confirmados']) {
        expect(translateText(locale, value)).toBe(value);
      }
    }
  });
});
