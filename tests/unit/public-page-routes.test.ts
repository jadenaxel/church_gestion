import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPublicPagePath } from '../../apps/web/lib/public-page-routes.js';
import { isPublicAuthenticationPath } from '../../apps/web/lib/session-recovery.js';

describe('public page boundary', () => {
  it.each(['/', '/login', '/global/login', '/forgot-password', '/reset-password'])('allows the public UI page %s', (pathname) => {
    expect(isPublicPagePath(pathname)).toBe(true);
  });

  it.each([
    '/dashboard', '/global', '/calendar', '/activities/new', '/notifications', '/settings/channels',
    '/login/admin', '/global/login/admin', '/reset-password/private', '/forgot-password/private',
    '/me', '/auth/login', '/api/v1/me', '', '/Login', '//', '/login/', '/login?reauth=1', '/#main-content'
  ])('does not widen the allowlist to %s', (pathname) => {
    expect(isPublicPagePath(pathname)).toBe(false);
  });

  it('keeps public UI pages distinct from public authentication API endpoints', () => {
    expect(isPublicAuthenticationPath('/')).toBe(false);
    expect(isPublicAuthenticationPath('/login')).toBe(false);
    expect(isPublicAuthenticationPath('/me')).toBe(false);
    expect(isPublicAuthenticationPath('/auth/login')).toBe(true);
  });
});

describe('public page provider guards', () => {
  it('stops remote profile loading on public pages before the session request', () => {
    const source = readFileSync('apps/web/components/experience-provider.tsx', 'utf8');
    const branch = source.match(/if\s*\(isPublicPagePath\(pathname\)\)\s*\{([^}]+)\}/);
    expect(branch).not.toBeNull();
    expect(branch?.[1]).toMatch(/session\.select\(null\)/);
    expect(branch?.[1]).toMatch(/return\s*;/);
    expect(branch?.index).toBeLessThan(source.indexOf("('/me',"));
    expect(source).toContain('setRemoteAvailable(false)');
    expect(source).not.toContain('sessionRecovery.reset(');
  });

  it('renders public children before recovery can hide them or open a modal', () => {
    const source = readFileSync('apps/web/components/session-recovery-provider.tsx', 'utf8');
    const branch = source.match(/if\s*\(isPublicPagePath\(pathname\)\)\s*return\s*<>\{children\}<\/>;/);
    expect(branch).not.toBeNull();
    expect(branch?.index).toBeLessThan(source.indexOf("state.phase !== 'changed'"));
    expect(branch?.index).toBeLessThan(source.indexOf('<Modal'));
    expect(source).not.toContain('sessionRecovery.reset(');
  });
});
