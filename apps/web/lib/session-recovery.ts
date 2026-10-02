export type RecoveryIdentity = { sub: string; scope: 'tenant' | 'global'; tenantId: string | null };
export type RecoveryState = { phase: 'ready' | 'expired' | 'changed'; identity: RecoveryIdentity | null };

export function recoveryIdentity(value: unknown): RecoveryIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  if (typeof user.sub !== 'string' || !user.sub || !['tenant','global'].includes(String(user.scope))) return null;
  const tenantId = typeof user.tenantId === 'string' ? user.tenantId : null;
  if (user.scope === 'tenant' && !tenantId) return null;
  return { sub: user.sub, scope: user.scope as RecoveryIdentity['scope'], tenantId };
}

export function sameRecoveryIdentity(left: RecoveryIdentity | null, right: RecoveryIdentity | null): boolean {
  return Boolean(left && right && left.sub === right.sub && left.scope === right.scope && left.tenantId === right.tenantId);
}

/** Only minimal identity metadata is held in memory. Drafts and File objects remain with their mounted owners. */
export function createSessionRecoveryCoordinator() {
  let state: RecoveryState = { phase: 'ready', identity: null };
  const listeners = new Set<(state: RecoveryState) => void>();
  const update = (next: RecoveryState) => { state = next; for (const listener of listeners) listener(state); };
  return {
    state: () => state,
    subscribe(listener: (state: RecoveryState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    observe(identity: RecoveryIdentity) {
      if (state.phase === 'changed') return;
      if (state.identity && !sameRecoveryIdentity(state.identity, identity)) { update({phase:'changed',identity:null}); return; }
      if (!state.identity) update({phase:'ready',identity});
    },
    expire() {
      if (state.phase !== 'ready' || !state.identity) return false;
      update({...state,phase:'expired'}); return true;
    },
    resume(identity: RecoveryIdentity) {
      if (state.phase !== 'expired' || !sameRecoveryIdentity(state.identity, identity)) return false;
      update({phase:'ready',identity}); return true;
    },
    reset() { update({phase:'ready',identity:null}); }
  };
}

export const sessionRecovery = createSessionRecoveryCoordinator();
export const sessionRecoveredEvent = 'gc-session-recovered';
export const isSessionRecoveryActive = () => sessionRecovery.state().phase !== 'ready';

export function isPublicAuthenticationPath(path: string): boolean {
  return /^\/auth\/(?:login|global\/login|password\/(?:forgot|reset))(?:\?|$)/.test(path);
}
