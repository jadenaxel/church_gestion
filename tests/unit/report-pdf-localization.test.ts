import { describe, expect, it } from 'vitest';
import { formatReportMonth, formatReportNumber, reportText } from '../../services/reports-service/src/localization.js';
import { reportLabelFontSize, reportTrendBars } from '../../services/reports-service/src/pdf-trend.js';

describe('executive PDF local number, plural and month labels', () => {
  it.each(['es', 'en', 'fr'] as const)('formats decimal days without changing the observed value in %s', (locale) => {
    const expected = { es: '6,8 días', en: '6.8 days', fr: '6,8 jours' };
    expect(reportText(locale, '{days} días', { days: 6.8 })).toBe(expected[locale]);
    expect(formatReportNumber(locale, 6.8)).toBe(locale === 'en' ? '6.8' : '6,8');
  });
  it.each(['es', 'en', 'fr'] as const)('agrees singular and plural conflict clauses and department counts in %s', (locale) => {
    const single = { es: '1 conflicto / 1 vencida', en: '1 conflict / 1 overdue', fr: '1 conflit / 1 en retard' };
    const plural = { es: '2 conflictos / 2 vencidas', en: '2 conflicts / 2 overdue', fr: '2 conflits / 2 en retard' };
    expect(reportText(locale, '{conflicts} conflictos / {overdue} vencidas', { conflicts: 1, overdue: 1 })).toBe(single[locale]);
    expect(reportText(locale, '{conflicts} conflictos / {overdue} vencidas', { conflicts: 2, overdue: 2 })).toBe(plural[locale]);
    expect(reportText(locale, '{count} abiertos', { count: 1 })).toBe({ es: '1 abierto', en: '1 open', fr: '1 ouvert' }[locale]);
    expect(reportText(locale, '{count} abiertos', { count: 2 })).toBe({ es: '2 abiertos', en: '2 open', fr: '2 ouverts' }[locale]);
  });
  it.each(['es', 'en', 'fr'] as const)('uses grammatical verbs for one open conflict and overdue activity in %s', (locale) => {
    expect(reportText(locale, '{count} conflictos todavía requieren resolución de la junta.', { count: 1 })).toBe({ es: '1 conflicto todavía requiere resolución de la junta.', en: '1 conflict still requires a board decision.', fr: '1 conflit nécessite encore une décision du conseil.' }[locale]);
    expect(reportText(locale, '{count} actividades ya finalizaron y continúan abiertas.', { count: 1 })).toBe({ es: '1 actividad ya finalizó y continúa abierta.', en: '1 activity has ended but remains open.', fr: '1 activité est terminée mais reste ouverte.' }[locale]);
    expect(reportText(locale, '{count} actividades', { count: 1 })).toBe({ es: '1 actividad', en: '1 activity', fr: '1 activité' }[locale]);
    expect(reportText(locale, '{count} asistentes', { count: 1 })).toBe({ es: '1 asistente', en: '1 attendee', fr: '1 participant' }[locale]);
  });
  it('formats signed point changes and preserves zero as stable, without translating authored content', () => {
    expect(reportText('fr', 'La tasa de cierre cambió {change} puntos frente al período anterior.', { change: 1 })).toContain('+1 point ');
    expect(reportText('fr', 'La tasa de cierre cambió {change} puntos frente al período anterior.', { change: -1.2 })).toContain('-1,2 point ');
    expect(reportText('en', 'La tasa de cierre cambió {change} puntos frente al período anterior.', { change: 0 })).toContain('0 points ');
    expect(reportText('fr', '{name} lidera el período con {rate}% de cumplimiento.', { name: 'Original 6.8 días', rate: 6.8 })).toBe('Original 6.8 días mène la période avec 6,8% de réalisation.');
    expect(formatReportNumber('fr', 1000)).toBe('1\u00a0000');
  });
  it.each(['es', 'en', 'fr'] as const)('uses a concise localized month plus year, without changing the tenant month key in %s', (locale) => {
    const label = formatReportMonth(locale, '2030-10');
    expect(label).toContain('2030'); expect(label.toLowerCase()).toContain('oct');
    expect(formatReportMonth(locale, '2029-12')).toContain('2029');
    expect(formatReportMonth(locale, '2030-01')).toContain('2030');
  });
  it('agrees observed timing and missing schedule summaries when the count is one', () => {
    expect(reportText('fr', 'Puntualidad observada: {rate} · {count} cierres con evidencia temporal; {unknown} sin evidencia.', { rate: '—', count: 1, unknown: 2 })).toBe('Ponctualité observée : — · 1 clôture avec preuves temporelles ; 2 sans preuve.');
    expect(reportText('es', '{count} actividades sin horario; no se cuentan como planificadas.', { count: 1 })).toBe('1 actividad sin horario; no se cuenta como planificada.');
    expect(reportText('en', 'Las actividades se registran con {days} días de anticipación en promedio.', { days: 1 })).toBe('Activities are registered an average of 1 day in advance.');
  });
  it('retains each bar height and gives positive counts non-overlapping label cells above the bar', () => {
    const bars = reportTrendBars({ planned: 5, completed: 2, conflicts: 0 }, 100, 14, 120, 150, 5);
    expect(bars.map((bar) => bar.height)).toEqual([126, 50.400000000000006, 0]);
    for (const bar of bars.filter((item) => item.height > 0)) {
      expect(bar.labelY).toBeGreaterThanOrEqual(120); expect(bar.labelY + 6).toBeLessThan(bar.y);
    }
    expect(bars[0]!.x + 14).toBeLessThan(bars[1]!.x); expect(bars[1]!.x + 14).toBeLessThan(bars[2]!.x);
    expect(reportLabelFontSize(6, 14, 28)).toBe(3); expect(reportLabelFontSize(6, 14, 7)).toBe(6);
  });
});
