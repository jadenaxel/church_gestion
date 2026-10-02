import { afterEach, describe, expect, it } from 'vitest';
import { currentLocale, setActiveLocale } from '../../apps/web/lib/i18n.js';
import { currentTimeZone, formatCalendarDate, localizedDateFormat, localizedNumberFormat, setActiveTimeZone } from '../../apps/web/lib/locale-format.js';

afterEach(() => { setActiveLocale('es'); setActiveTimeZone(null); });
describe('locale and tenant time zone formatting', () => {
  it('updates formatting immediately without reading another account’s stored settings', () => {
    setActiveLocale('fr');
    expect(currentLocale()).toBe('fr');
    expect(localizedNumberFormat().format(1234.5)).toContain(',5');
    setActiveLocale('en');
    expect(localizedNumberFormat().format(1234.5)).toBe('1,234.5');
  });
  it('keeps the church zone independent from language', () => {
    setActiveTimeZone('America/Santo_Domingo'); setActiveLocale('fr');
    const value = new Date('2027-01-01T01:00:00Z');
    expect(localizedDateFormat({ hour: 'numeric', hourCycle: 'h23' }).format(value)).toContain('21');
    setActiveLocale('en');
    expect(currentTimeZone()).toBe('America/Santo_Domingo');
  });
  it('preserves civil dates across zone and language changes', () => {
    setActiveTimeZone('America/Los_Angeles');
    expect(formatCalendarDate('2027-01-01', { day: 'numeric' }, 'en')).toBe('1');
    setActiveTimeZone('Pacific/Auckland');
    expect(formatCalendarDate('2027-01-01', { day: 'numeric' }, 'fr')).toBe('1');
  });
  it('does not crash when a configured zone is missing or invalid', () => {
    setActiveTimeZone('invalid/timezone'); expect(currentTimeZone()).toBeNull();
    expect(() => localizedDateFormat({ dateStyle: 'medium' }).format(new Date('2027-01-01T12:00:00Z'))).not.toThrow();
  });
});
