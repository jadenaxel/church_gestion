import { describe, expect, it } from 'vitest';
import { renderNotification } from '../../packages/notification-domain/src/index.js';
import { assertReportTimezone, formatReportDate, reportStatus, reportText } from '../../services/reports-service/src/localization.js';
import { budgetCurrencyTotals, departmentReportStatus, departmentReportText } from '../../services/department-operations-service/src/report-localization.js';

describe('backend system labels and honest currency presentation', () => {
  it.each(['es', 'en', 'fr'] as const)('preserves authored names while translating notification system text in %s', (locale) => {
    const message = renderNotification('activity.approved', { title: 'Encuentro Jóvenes Éxito' }, locale);
    expect(message.body).toContain('Encuentro Jóvenes Éxito');
    expect(message.title).toBe(({ es: 'Actividad aprobada', en: 'Activity approved', fr: 'Activité approuvée' })[locale]);
    expect(renderNotification('department_operations.mention', { body: 'Comentario escrito sin traducción' }, locale).body).toBe('Comentario escrito sin traducción');
  });
  it('localizes system codes and dates from the tenant rather than the server timezone', () => {
    expect(renderNotification('review.decided', { title: 'Original title', decision: 'APPROVE' }, 'fr').body).toBe('Original title : approuvé.');
    const instant = '2030-01-01T02:00:00Z';
    const message = renderNotification('review.session_invited', { title: 'Original meeting', when: instant }, 'en', 'Pacific/Honolulu');
    expect(message.body).toContain('Monday, December 31, 2029');
    expect(formatReportDate(new Date(instant), 'en', 'Pacific/Honolulu', true)).toBe('12/31/29');
    expect(() => assertReportTimezone('Not/A_Timezone')).toThrow('zona horaria');
  });
  it('translates report labels and states without translating interpolated user content', () => {
    expect(reportText('fr', '{name} lidera el período con {rate}% de cumplimiento.', { name: 'Jóvenes Oz Fiction', rate: 50 })).toBe('Jóvenes Oz Fiction mène la période avec 50% de réalisation.');
    expect(reportStatus('en', 'DRAFT')).toBe('Draft');
    expect(reportText('en', 'Cumplimiento estable')).toBe('Stable completion');
    expect(departmentReportStatus('fr', 'AT_RISK')).toBe('À risque');
    expect(departmentReportText('en', 'Moneda')).toBe('Currency');
  });
  it('never adds unlike currencies or invents an exchange rate', () => {
    expect(budgetCurrencyTotals([{ currency: 'DOP', plannedBudget: 100, spentBudget: 25 }, { currency: 'USD', plannedBudget: 10, spentBudget: 3 }, { currency: 'dop', plannedBudget: 50, spentBudget: 10 }])).toEqual([
      { currency: 'DOP', plannedBudget: 150, spentBudget: 35, availableBudget: 115 }, { currency: 'USD', plannedBudget: 10, spentBudget: 3, availableBudget: 7 },
    ]);
  });
});
