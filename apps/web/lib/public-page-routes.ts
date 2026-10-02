const publicPagePaths = new Set([
  '/',
  '/login',
  '/global/login',
  '/forgot-password',
  '/reset-password'
]);

/** Public UI pages do not load authenticated profile data or show session recovery. */
export function isPublicPagePath(pathname: string): boolean {
  return publicPagePaths.has(pathname);
}
