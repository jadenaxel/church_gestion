import { currentLocale, localeTag, type Locale } from './i18n.js';

let activeTimeZone: string | null = null;
export function setActiveTimeZone(value: string | null | undefined) {
  try { if (value) new Intl.DateTimeFormat('en', { timeZone: value }); activeTimeZone = value || null; }
  catch { activeTimeZone = null; }
}
export function currentTimeZone() { return activeTimeZone; }
export function localizedDateFormat(options: Intl.DateTimeFormatOptions, locale: Locale = currentLocale()) {
  return new Intl.DateTimeFormat(localeTag(locale), { ...(activeTimeZone ? { timeZone: activeTimeZone } : {}), ...options });
}
export function localizedNumberFormat(options: Intl.NumberFormatOptions = {}, locale: Locale = currentLocale()) {
  return new Intl.NumberFormat(localeTag(locale), options);
}
/** Civil dates are not instants: translating them must not move their calendar day. */
export function formatCalendarDate(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }, locale: Locale = currentLocale()) {
  const date = value.slice(0, 10);
  return new Intl.DateTimeFormat(localeTag(locale), { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
