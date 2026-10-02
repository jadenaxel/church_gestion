'use client';

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useExperience } from './experience-provider';
import { createUnsavedChangesRegistry, isLeavingPage } from './unsaved-changes';
import { historyEntryIndex, historyRestoreDelta, markHistoryEntry } from './history-guard';

type Registry = ReturnType<typeof createUnsavedChangesRegistry>;
const UnsavedChangesContext = createContext<Registry | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const registry = useRef(createUnsavedChangesRegistry()).current;
  const { tr } = useExperience();
  const translate = useRef(tr); translate.current = tr;
  useEffect(() => {
    const history = window.history;
    let index = historyEntryIndex(history.state) ?? 0;
    let href = window.location.href;
    let restoring = false;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    originalReplace.call(history, markHistoryEntry(history.state, index), '', href);
    const push: History['pushState'] = function(state, unused, url) {
      originalPush.call(history, markHistoryEntry(state, index + 1), unused, url);
      index += 1; href = window.location.href;
    };
    const replace: History['replaceState'] = function(state, unused, url) {
      originalReplace.call(history, markHistoryEntry(state, index), unused, url);
      href = window.location.href;
    };
    history.pushState = push; history.replaceState = replace;
    const traverse = (event: PopStateEvent) => {
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      const delta = historyRestoreDelta(index, event.state);
      if (delta !== null && registry.hasChanges() && isLeavingPage(window.location.href, href)
        && !window.confirm(translate.current('Tienes cambios sin guardar. ¿Salir y descartarlos?'))) {
        // Capture runs before Next's bubble listener: the current form has not unmounted.
        event.stopImmediatePropagation(); restoring = true; history.go(delta); return;
      }
      index = historyEntryIndex(event.state) ?? index; href = window.location.href;
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!registry.hasChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !registry.hasChanges() || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.hasAttribute('download') || link.target === '_blank' || !isLeavingPage(link.href, window.location.href)) return;
      if (!window.confirm(translate.current('Tienes cambios sin guardar. ¿Salir y descartarlos?'))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', traverse, true);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('popstate', traverse, true); document.removeEventListener('click', navigate, true);
      if (history.pushState === push) history.pushState = originalPush;
      if (history.replaceState === replace) history.replaceState = originalReplace;
    };
  }, [registry]);
  return <UnsavedChangesContext.Provider value={registry}>{children}</UnsavedChangesContext.Provider>;
}

export function useUnsavedChanges(dirty: boolean) {
  const registry = useContext(UnsavedChangesContext);
  const owner = useRef(Symbol('draft')).current;
  const { tr } = useExperience();
  useEffect(() => { registry?.mark(owner, dirty); return () => registry?.clear(owner); }, [dirty, owner, registry]);
  const clear = useCallback(() => registry?.clear(owner), [owner, registry]);
  const confirmDiscard = useCallback(() => !dirty || window.confirm(tr('Tienes cambios sin guardar. ¿Salir y descartarlos?')), [dirty, tr]);
  return { clear, confirmDiscard };
}

/** Explicit commands such as logout must honor all mounted draft owners. */
export function useConfirmDiscardChanges() {
  const registry = useContext(UnsavedChangesContext);
  const {tr} = useExperience();
  return useCallback(() => !registry?.hasChanges() || window.confirm(tr('Tienes cambios sin guardar. ¿Salir y descartarlos?')), [registry,tr]);
}
