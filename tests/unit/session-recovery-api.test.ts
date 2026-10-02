import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../apps/web/lib/api.js';
import { sessionRecovery } from '../../apps/web/lib/session-recovery.js';

const user = {sub:'fixture-user',scope:'tenant' as const,tenantId:'fixture-tenant',permissions:['calendar.create']};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

describe('session expiration API boundary without real network or storage', () => {
  beforeEach(() => { vi.stubGlobal('window',{location:{hostname:'fixture.invalid'}}); sessionRecovery.reset(); });
  afterEach(() => { sessionRecovery.reset(); vi.unstubAllGlobals(); });
  it('holds mutations after 401 and resumes only after explicit verification of the same identity', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({user})).mockResolvedValueOnce(json({code:'UNAUTHENTICATED'},401)).mockResolvedValueOnce(json({user:{...user,permissions:[]}}));
    vi.stubGlobal('fetch',fetch);
    await api('/me'); await expect(api('/activities',{method:'POST',body:'fixture'})).rejects.toMatchObject({status:401});
    expect(sessionRecovery.state().phase).toBe('expired');
    await expect(api('/activities',{method:'POST',body:'fixture'})).rejects.toMatchObject({code:'SESSION_REAUTH_REQUIRED'});
    expect(fetch).toHaveBeenCalledTimes(2);
    const verified = await api<{user:typeof user}>('/me'); expect(verified.user.permissions).toEqual([]);
    expect(sessionRecovery.state().phase).toBe('expired'); expect(sessionRecovery.resume(verified.user)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3); // No automatic replay of the rejected POST.
  });
  it('does not treat forbidden, public credential failures or caller cancellation as expiry', async () => {
    sessionRecovery.observe(user);
    const fetch = vi.fn().mockResolvedValueOnce(json({},403)).mockResolvedValueOnce(json({},401)).mockResolvedValueOnce(json({},401)); vi.stubGlobal('fetch',fetch);
    await expect(api('/activities')).rejects.toMatchObject({status:403});
    await expect(api('/auth/global/login',{method:'POST'})).rejects.toMatchObject({status:401});
    await expect(api('/auth/password/forgot',{method:'POST'})).rejects.toMatchObject({status:401});
    const controller = new AbortController(); controller.abort(new Error('Canceled by test'));
    await expect(api('/me',{signal:controller.signal})).rejects.toThrow('Canceled by test');
    expect(sessionRecovery.state().phase).toBe('ready'); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('rejects a different tenant before its response can replace the held identity', async () => {
    sessionRecovery.observe(user); sessionRecovery.expire();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({user:{...user,tenantId:'other-fixture'}})));
    await expect(api('/me')).rejects.toMatchObject({code:'SESSION_IDENTITY_CHANGED'});
    expect(sessionRecovery.state()).toEqual({phase:'changed',identity:null});
  });
  it('never resumes merely because a background me request succeeded and repeated me401 opens no loop', async () => {
    sessionRecovery.observe(user); sessionRecovery.expire();
    const fetch = vi.fn().mockResolvedValueOnce(json({},401)).mockResolvedValueOnce(json({user})); vi.stubGlobal('fetch',fetch);
    await expect(api('/me')).rejects.toMatchObject({status:401}); await api('/me');
    expect(sessionRecovery.state().phase).toBe('expired'); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
