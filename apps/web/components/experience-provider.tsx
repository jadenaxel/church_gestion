'use client';

import { Accessibility, Check, Contrast, Languages, LetterText, RotateCcw, Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { localeDetails, setActiveLocale, supportedLocales, translateText, type Locale } from '@/lib/i18n';
import { setActiveTimeZone } from '@/lib/locale-format';
import { isPublicPagePath } from '@/lib/public-page-routes';
import { isSessionRecoveryActive, sessionRecoveredEvent } from '@/lib/session-recovery';
import { Modal } from './modal';
import { createPreferenceSession, createPreferenceWriteQueue, defaultPreferences, type AccessibilityPreferences, type ExperiencePreferences, type FontScale, type PreferenceIdentity } from './experience-preferences';
export type { AccessibilityPreferences } from './experience-preferences';

type RemotePreferences = { uiLocale?: string; accessibilitySettings?: Partial<AccessibilityPreferences> };
type ExperienceContextValue = ExperiencePreferences & {
  tenantTimezone: string | null;
  setLocale: (locale: Locale) => void;
  setAccessibility: (preferences: AccessibilityPreferences) => void;
  tr: (spanish: string) => string;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);
function PreferenceSwitch({ checked, title, description, onChange }: { checked: boolean; title: string; description: string; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} className={`experience-switch ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)}><span><strong>{title}</strong><small>{description}</small></span><i aria-hidden="true"><b /></i></button>;
}

export function ExperienceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [edited, setEdited] = useState(0);
  const [preferenceError, setPreferenceError] = useState('');
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const preferenceSession = useRef<ReturnType<typeof createPreferenceSession> | null>(null);
  const preferenceWrites = useRef<ReturnType<typeof createPreferenceWriteQueue> | null>(null);
  const tr = useCallback((spanish: string) => translateText(preferences.locale, spanish), [preferences.locale]);

  useEffect(() => {
    const recovered = () => setSessionRefresh((current) => current + 1);
    window.addEventListener(sessionRecoveredEvent, recovered);
    return () => window.removeEventListener(sessionRecoveredEvent, recovered);
  }, []);

  useEffect(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage is optional. */ }
    preferenceSession.current = createPreferenceSession((next) => { setActiveLocale(next.locale); setPreferences(next); }, storage);
    preferenceSession.current.select(null);
    preferenceWrites.current = createPreferenceWriteQueue((ticket) => {
      const session = preferenceSession.current;
      return Boolean(session?.isCurrent(ticket) && session.ticket().revision === ticket.revision);
    });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.lang = preferences.locale;
    root.dataset.locale = preferences.locale;
    root.dataset.fontScale = preferences.accessibility.fontScale;
    root.dataset.contrast = preferences.accessibility.highContrast ? 'high' : 'standard';
    root.dataset.reduceMotion = preferences.accessibility.reduceMotion ? 'true' : 'false';
    root.dataset.enhancedFocus = preferences.accessibility.enhancedFocus ? 'true' : 'false';
    root.dataset.readableFont = preferences.accessibility.readableFont ? 'true' : 'false';
    root.dataset.comfortableSpacing = preferences.accessibility.comfortableSpacing ? 'true' : 'false';
  }, [hydrated, preferences]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit same-identity reauthentication must refresh remote preferences and timezone without unmounting the page.
  useEffect(() => {
    setRemoteAvailable(false);
    if (!hydrated || !preferenceSession.current) return;
    const session = preferenceSession.current;
    if (isPublicPagePath(pathname)) {
      setActiveTimeZone(null); setTenantTimezone(null);
      session.select(null); setEdited(0); setPreferenceError(''); return;
    }
    const controller = new AbortController();
    const started = session.ticket();
    void (async () => {
      try {
        const { user } = await api<{ user: PreferenceIdentity & { tenantTimezone?: string | null } }>('/me', { signal: controller.signal });
        if (controller.signal.aborted) return;
        const selected = session.select(user);
        setActiveTimeZone(user.tenantTimezone); setTenantTimezone(user.tenantTimezone ?? null);
        const changedIdentity = started.key !== selected.key;
        if (changedIdentity) { setEdited(0); setPreferenceError(''); }
        const remoteTicket = changedIdentity ? selected : { ...selected, revision: started.revision };
        const remote = await api<RemotePreferences>('/notifications/preferences', { signal: controller.signal });
        if (!controller.signal.aborted && session.isCurrent(selected)) {
          session.applyRemote(remoteTicket, remote);
          setRemoteAvailable(true);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setRemoteAvailable(false);
          if (reason instanceof ApiError && reason.status === 401 && !isSessionRecoveryActive()) {
            setActiveTimeZone(null); setTenantTimezone(null);
            session.select(null); setEdited(0); setPreferenceError('');
          }
        }
      }
    })();
    return () => controller.abort();
  }, [hydrated, pathname, sessionRefresh]);

  useEffect(() => {
    const session = preferenceSession.current;
    if (!hydrated || !remoteAvailable || !edited || !session) return;
    const selected = session.ticket();
    const timeout = window.setTimeout(() => {
      if (!session.isCurrent(selected)) return;
      void preferenceWrites.current?.(selected, () => api('/notifications/preferences', {
        method: 'PATCH', body: JSON.stringify({ uiLocale: preferences.locale, accessibilitySettings: preferences.accessibility })
      })).then((written) => {
        if (written && session.isCurrent(selected) && session.ticket().revision === selected.revision) { setPreferenceError(''); setEdited(0); }
      }).catch(() => {
        if (session.isCurrent(selected) && session.ticket().revision === selected.revision) setPreferenceError('Las preferencias siguen activas en este dispositivo, pero no pudimos sincronizarlas.');
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [edited, hydrated, preferences, remoteAvailable]);

  const closePanel = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'a') { event.preventDefault(); setOpen((current) => !current); }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  function changeLocale(locale: Locale) {
    preferenceSession.current?.update({ ...preferences, locale });
    setEdited((current) => current + 1);
    const language = localeDetails[locale].nativeLabel;
    setAnnouncement(locale === 'es' ? `Idioma cambiado a ${language}` : locale === 'en' ? 'Language changed to English' : 'Langue changée en Français');
  }

  function changeAccessibility(accessibility: AccessibilityPreferences) {
    preferenceSession.current?.update({ ...preferences, accessibility });
    setEdited((current) => current + 1);
    setAnnouncement(translateText(preferences.locale, 'Preferencias aplicadas en este dispositivo'));
  }

  function resetPreferences() {
    preferenceSession.current?.update(defaultPreferences);
    setEdited((current) => current + 1);
    setAnnouncement(translateText(defaultPreferences.locale, 'Preferencias restablecidas'));
  }

  const context: ExperienceContextValue = { ...preferences, tenantTimezone, setLocale: changeLocale, setAccessibility: changeAccessibility, tr };
  const a11y = preferences.accessibility;

  return <ExperienceContext.Provider value={context}>
    <a className="skip-link" href="#main-content">{tr('Saltar al contenido principal')}</a>
    {children}
    <button ref={triggerRef} type="button" className="experience-trigger" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="experience-panel" aria-label={tr('Abrir accesibilidad e idiomas')} title={`${tr('Accesibilidad')} · Alt+Shift+A`}><Accessibility /><span>{preferences.locale.toUpperCase()}</span></button>
    {open && <Modal className="experience-overlay" label={tr('Preferencias de experiencia')} onClose={closePanel} protectChanges={false}>
      <button type="button" className="experience-backdrop" onClick={closePanel} onMouseDown={(event) => event.preventDefault()} tabIndex={-1} aria-hidden="true" />
      <div className="experience-panel" id="experience-panel" data-no-translate>
        <header><span><Sparkles /></span><div><h2 id="experience-title">{tr('Preferencias de experiencia')}</h2><p>{tr('Personaliza la aplicación para verla, leerla y navegarla con mayor comodidad.')}</p></div><button type="button" className="icon-button" onClick={closePanel} aria-label={tr('Cerrar accesibilidad')}><X /></button></header>
        <div className="experience-panel-body">
          {preferenceError && <p role="alert">{tr(preferenceError)}</p>}
          <section aria-labelledby="experience-language-title"><div className="experience-section-title"><Languages /><div><h3 id="experience-language-title">{tr('Idioma de la aplicación')}</h3><p>ES · EN · FR</p></div></div><div className="language-grid" role="radiogroup" aria-label={tr('Idioma de la aplicación')}>{supportedLocales.map((locale) => <label className={`language-option ${preferences.locale === locale ? 'active' : ''}`} key={locale}><input className="language-radio-control" type="radio" name="application-language" checked={preferences.locale === locale} onChange={() => changeLocale(locale)} /><span>{locale.toUpperCase()}</span><strong>{localeDetails[locale].nativeLabel}</strong>{preferences.locale === locale && <Check />}</label>)}</div></section>
          <section aria-labelledby="experience-accessibility-title"><div className="experience-section-title"><Accessibility /><div><h3 id="experience-accessibility-title">{tr('Modo de accesibilidad')}</h3><p>{tr('Preferencias de lectura y navegación')}</p></div></div><div className="font-scale-control"><span><LetterText /> {tr('Texto')}</span><div>{(['normal','large','xlarge'] as FontScale[]).map((scale) => <button type="button" key={scale} className={a11y.fontScale === scale ? 'active' : ''} aria-pressed={a11y.fontScale === scale} onClick={() => changeAccessibility({ ...a11y, fontScale: scale })}>{tr(scale === 'normal' ? 'Normal' : scale === 'large' ? 'Grande' : 'Muy grande')}</button>)}</div></div><div className="experience-switches">
            <PreferenceSwitch checked={a11y.highContrast} title={tr('Alto contraste')} description={tr('Refuerza la separación entre texto, fondos y controles.')} onChange={(checked) => changeAccessibility({ ...a11y, highContrast: checked })} />
            <PreferenceSwitch checked={a11y.reduceMotion} title={tr('Reducir movimiento')} description={tr('Desactiva animaciones y desplazamientos no esenciales.')} onChange={(checked) => changeAccessibility({ ...a11y, reduceMotion: checked })} />
            <PreferenceSwitch checked={a11y.enhancedFocus} title={tr('Enfoque visible')} description={tr('Resalta claramente el elemento seleccionado con teclado.')} onChange={(checked) => changeAccessibility({ ...a11y, enhancedFocus: checked })} />
            <PreferenceSwitch checked={a11y.readableFont} title={tr('Fuente legible')} description={tr('Usa una tipografía optimizada para lectura continua.')} onChange={(checked) => changeAccessibility({ ...a11y, readableFont: checked })} />
            <PreferenceSwitch checked={a11y.comfortableSpacing} title={tr('Espaciado cómodo')} description={tr('Aumenta el espacio entre líneas y caracteres.')} onChange={(checked) => changeAccessibility({ ...a11y, comfortableSpacing: checked })} />
          </div></section>
        </div>
        <footer><span><Contrast /> {preferences.locale.toUpperCase()} · {a11y.fontScale === 'normal' ? '100%' : a11y.fontScale === 'large' ? '115%' : '130%'}</span><button type="button" className="button button-ghost" onClick={resetPreferences}><RotateCcw /> {tr('Restablecer preferencias')}</button></footer>
      </div>
    </Modal>}
    <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
  </ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error('useExperience debe utilizarse dentro de ExperienceProvider.');
  return value;
}
