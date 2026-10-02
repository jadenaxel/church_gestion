import { describe, expect, it, vi } from 'vitest';
import { createSessionRecoveryCoordinator, isPublicAuthenticationPath, recoveryIdentity } from '../../apps/web/lib/session-recovery.js';
const identity = {sub:'fixture-user',scope:'tenant' as const,tenantId:'fixture-tenant'};
describe('memory-only session recovery identity boundary', () => {
  it('opens once on expired authenticated sessions, not initial anonymous failures', () => {
    const recovery = createSessionRecoveryCoordinator(), observe = vi.fn(); recovery.subscribe(observe);
    expect(recovery.expire()).toBe(false); recovery.observe(identity); expect(recovery.expire()).toBe(true);
    expect(recovery.expire()).toBe(false); expect(observe).toHaveBeenCalledTimes(2);
  });
  it('keeps the identity until explicit same-account verification, without any replay callback', () => {
    const recovery = createSessionRecoveryCoordinator(); recovery.observe(identity); recovery.expire(); recovery.observe({...identity});
    expect(recovery.state().phase).toBe('expired'); expect(recovery.resume({...identity})).toBe(true); expect(recovery.state().phase).toBe('ready');
    expect(Object.keys(recovery.state())).toEqual(['phase','identity']);
  });
  it.each([{...identity,sub:'another'}, {...identity,tenantId:'another'}, {sub:identity.sub,scope:'global' as const,tenantId:null}])('purges identity metadata on a different user, tenant or scope', (next) => {
    const recovery = createSessionRecoveryCoordinator(); recovery.observe(identity); recovery.expire(); recovery.observe(next);
    expect(recovery.state()).toEqual({phase:'changed',identity:null}); expect(recovery.resume(identity)).toBe(false);
  });
  it('recognizes credentials failures as public authentication, not session expiration', () => {
    for (const path of ['/auth/login','/auth/global/login','/auth/password/forgot','/auth/password/reset']) expect(isPublicAuthenticationPath(path)).toBe(true);
    expect(isPublicAuthenticationPath('/me')).toBe(false);
    expect(recoveryIdentity({sub:'fixture',scope:'tenant'})).toBeNull(); expect(recoveryIdentity(identity)).toEqual(identity);
  });
});
