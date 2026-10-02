import { describe, expect, it, vi } from 'vitest';
import { createPreferenceSession, createPreferenceWriteQueue, defaultPreferences, experienceStorageKey, safePreferences } from '../../apps/web/components/experience-preferences.js';

const member = { sub: 'synthetic-a', scope: 'tenant', tenantId: 'synthetic-church-a' };
const otherMember = { ...member, sub: 'synthetic-b' };
const remoteEnglish = { uiLocale: 'en', accessibilitySettings: { highContrast: true } };

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('identity-scoped experience preferences', () => {
  it('separates anonymous, global, members and churches without delimiter collisions', () => {
    const keys = [null, member, otherMember, { ...member, tenantId: 'synthetic-church-b' }, { sub: member.sub, scope: 'global' }].map(experienceStorageKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(experienceStorageKey({ sub: 'a:b', scope: 'tenant', tenantId: 'c' })).not.toBe(experienceStorageKey({ sub: 'b', scope: 'tenant', tenantId: 'c:a' }));
    expect(() => experienceStorageKey({ sub: 'a', scope: 'tenant' })).toThrow();
  });

  it('does not import legacy shared settings into another identity', () => {
    const store = storage();
    store.values.set('gestionchurch:experience', JSON.stringify({ ...defaultPreferences, locale: 'fr' }));
    const changed = vi.fn();
    const session = createPreferenceSession(changed, store);
    session.select(member);
    expect(changed).toHaveBeenLastCalledWith(defaultPreferences);
    session.update({ ...defaultPreferences, locale: 'en' });
    session.select(otherMember);
    expect(changed).toHaveBeenLastCalledWith(defaultPreferences);
    session.select(member);
    expect(changed).toHaveBeenLastCalledWith({ ...defaultPreferences, locale: 'en' });
  });

  it('rejects a late previous-user response, even when the same user later signs in again', () => {
    const changed = vi.fn();
    const session = createPreferenceSession(changed, storage());
    const old = session.select(member);
    session.select(otherMember);
    expect(session.applyRemote(old, remoteEnglish)).toBe(false);
    session.select(member);
    expect(session.applyRemote(old, remoteEnglish)).toBe(false);
  });

  it('restores remote settings but never replaces a newer explicit local choice', () => {
    const changed = vi.fn();
    const session = createPreferenceSession(changed, storage());
    const selected = session.select(member);
    expect(session.applyRemote(selected, remoteEnglish)).toBe(true);
    session.update({ ...defaultPreferences, locale: 'fr' });
    expect(session.applyRemote(selected, remoteEnglish)).toBe(false);
    expect(session.applyRemote(session.ticket(), remoteEnglish)).toBe(false);
    expect(changed).toHaveBeenLastCalledWith({ ...defaultPreferences, locale: 'fr' });
  });

  it('preserves changes on route selection of the same identity and resets them at logout', () => {
    const changed = vi.fn();
    const session = createPreferenceSession(changed, storage());
    session.select(null);
    session.select(member);
    const edited = session.update({ ...defaultPreferences, locale: 'fr' });
    expect(session.select(member)).toEqual(edited);
    session.select(null);
    expect(changed).toHaveBeenLastCalledWith(defaultPreferences);
  });

  it('works with unavailable or corrupt storage and normalizes only allowed preferences', () => {
    const changed = vi.fn();
    const session = createPreferenceSession(changed, { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    session.select(member);
    expect(() => session.update({ ...defaultPreferences, locale: 'en' })).not.toThrow();
    expect(changed).toHaveBeenLastCalledWith({ ...defaultPreferences, locale: 'en' });
    expect(safePreferences({ locale: 'xx', accessibility: { fontScale: 'bad', highContrast: 'yes', reduceMotion: true }, secret: 'ignored' })).toEqual({ ...defaultPreferences, accessibility: { ...defaultPreferences.accessibility, reduceMotion: true } });
  });
});

describe('preference write ordering', () => {
  it('waits for earlier writes before sending the latest settings', async () => {
    const session = createPreferenceSession(() => undefined);
    session.select(member);
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const queue = createPreferenceWriteQueue((ticket) => session.isCurrent(ticket) && ticket.revision === session.ticket().revision);
    const first = vi.fn(() => hold);
    const second = vi.fn(async () => undefined);
    const initial = queue(session.update({ ...defaultPreferences, locale: 'en' }), first);
    await Promise.resolve();
    await Promise.resolve();
    expect(first).toHaveBeenCalledOnce();
    const latest = queue(session.update({ ...defaultPreferences, locale: 'fr' }), second);
    expect(second).not.toHaveBeenCalled();
    release();
    await expect(initial).resolves.toBe(true);
    await expect(latest).resolves.toBe(true);
    expect(second).toHaveBeenCalledOnce();
  });

  it('skips queued writes for a superseded revision or identity and continues after failure', async () => {
    const session = createPreferenceSession(() => undefined);
    session.select(member);
    const queue = createPreferenceWriteQueue((ticket) => session.isCurrent(ticket) && ticket.revision === session.ticket().revision);
    const stale = vi.fn(async () => undefined);
    const previous = queue(session.update({ ...defaultPreferences, locale: 'en' }), stale);
    session.select(otherMember);
    await expect(previous).resolves.toBe(false);
    expect(stale).not.toHaveBeenCalled();
    const failure = queue(session.ticket(), async () => { throw new Error('offline'); });
    await expect(failure).rejects.toThrow('offline');
    await expect(queue(session.ticket(), async () => undefined)).resolves.toBe(true);
  });
});
