import { normalizeLocale, type Locale } from '../lib/i18n.js';

export type FontScale = 'normal' | 'large' | 'xlarge';
export type AccessibilityPreferences = {
  fontScale: FontScale;
  highContrast: boolean;
  reduceMotion: boolean;
  enhancedFocus: boolean;
  readableFont: boolean;
  comfortableSpacing: boolean;
};
export type ExperiencePreferences = { locale: Locale; accessibility: AccessibilityPreferences };
export type PreferenceIdentity = { sub: string; scope: string; tenantId?: string; tenantSlug?: string };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export type PreferenceTicket = { key: string; generation: number; revision: number };

export const defaultAccessibility: AccessibilityPreferences = {
  fontScale: 'normal', highContrast: false, reduceMotion: false,
  enhancedFocus: true, readableFont: false, comfortableSpacing: false
};
export const defaultPreferences: ExperiencePreferences = { locale: 'es', accessibility: defaultAccessibility };

export function safePreferences(value: unknown): ExperiencePreferences {
  if (!value || typeof value !== 'object') return defaultPreferences;
  const candidate = value as { locale?: string; accessibility?: Partial<AccessibilityPreferences> };
  const fontScale = ['normal', 'large', 'xlarge'].includes(candidate.accessibility?.fontScale ?? '')
    ? candidate.accessibility!.fontScale as FontScale : 'normal';
  return {
    locale: normalizeLocale(candidate.locale),
    accessibility: {
      fontScale, highContrast: candidate.accessibility?.highContrast === true,
      reduceMotion: candidate.accessibility?.reduceMotion === true,
      enhancedFocus: candidate.accessibility?.enhancedFocus !== false,
      readableFont: candidate.accessibility?.readableFont === true,
      comfortableSpacing: candidate.accessibility?.comfortableSpacing === true
    }
  };
}

export function experienceStorageKey(identity: PreferenceIdentity | null): string {
  if (!identity) return 'gestionchurch:experience:v2:anonymous';
  const tenant = identity.scope === 'global' ? 'global' : identity.tenantId ?? identity.tenantSlug;
  if (!identity.sub || !tenant) throw new Error('Preference identity is incomplete.');
  return `gestionchurch:experience:v2:${[identity.scope, tenant, identity.sub].map(encodeURIComponent).join(':')}`;
}

/** Scoped non-sensitive settings only. Never stores form content or credentials. */
export function createPreferenceSession(onChange: (preferences: ExperiencePreferences) => void, storage?: Storage) {
  let key = '';
  let generation = 0;
  let revision = 0;
  let preferences = defaultPreferences;
  const persist = () => {
    try { storage?.setItem(key, JSON.stringify(preferences)); }
    catch { /* Memory preferences remain usable with browser storage disabled. */ }
  };
  const ticket = (): PreferenceTicket => ({ key, generation, revision });
  const isCurrent = (candidate: PreferenceTicket) => candidate.key === key && candidate.generation === generation;
  return {
    select(identity: PreferenceIdentity | null) {
      const nextKey = experienceStorageKey(identity);
      if (nextKey === key) return ticket();
      key = nextKey; generation += 1; revision = 0;
      try { preferences = safePreferences(JSON.parse(storage?.getItem(key) ?? '{}')); }
      catch { preferences = defaultPreferences; }
      onChange(preferences);
      return ticket();
    },
    ticket,
    isCurrent,
    update(next: ExperiencePreferences) {
      preferences = safePreferences(next); revision += 1;
      persist(); onChange(preferences);
      return ticket();
    },
    applyRemote(candidate: PreferenceTicket, remote: { uiLocale?: string; accessibilitySettings?: Partial<AccessibilityPreferences> }) {
      // An explicit choice in this session wins over a later GET, including route changes.
      if (!isCurrent(candidate) || candidate.revision !== revision || revision !== 0) return false;
      preferences = safePreferences({ locale: remote.uiLocale, accessibility: remote.accessibilitySettings });
      persist(); onChange(preferences);
      return true;
    }
  };
}

/** Serialize writes so a slow earlier PATCH cannot overwrite a newer choice. */
export function createPreferenceWriteQueue(isCurrent: (ticket: PreferenceTicket) => boolean) {
  let pending: Promise<unknown> = Promise.resolve();
  return (candidate: PreferenceTicket, write: () => Promise<unknown>) => {
    const result = pending.catch(() => undefined).then(async () => {
      if (!isCurrent(candidate)) return false;
      await write();
      return true;
    });
    pending = result;
    return result;
  };
}
