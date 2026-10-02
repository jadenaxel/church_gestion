import { currentLocale, localeTag, type Locale } from './i18n.js';
import { localizedDateFormat } from './locale-format.js';
import { isPublicAuthenticationPath, recoveryIdentity, sessionRecovery } from './session-recovery.js';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const API_URL = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production'
  ? `http://${window.location.hostname}:4000/api/v1`
  : configuredApiUrl;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: unknown) {
    super(message);
  }
}

const activeRequests = new Set<AbortController>();
export function abortPendingRequests() {
  for (const controller of activeRequests) controller.abort(new ApiError(409, 'SESSION_IDENTITY_CHANGED', 'Cambió la identidad. No se reintentó ninguna operación.'));
}
sessionRecovery.subscribe((state) => { if (state.phase === 'changed') abortPendingRequests(); });

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (typeof window !== 'undefined' && sessionRecovery.state().phase !== 'ready' && path !== '/me' && !isPublicAuthenticationPath(path)) throw new ApiError(401, 'SESSION_REAUTH_REQUIRED', 'La sesión debe verificarse antes de continuar.');
  const callerSignal = options.signal;
  if (callerSignal?.aborted) throw callerSignal.reason;

  const multipart = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!multipart && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!headers.has('accept-language')) headers.set('accept-language', localeTag(currentLocale()));

  const controller = new AbortController();
  activeRequests.add(controller);
  let onRequestAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    onRequestAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onRequestAbort, { once: true });
  });
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new ApiError(
    408,
    'REQUEST_TIMEOUT',
    'La solicitud tardó demasiado. No pudimos confirmar su resultado; comprueba el estado antes de reintentar.'
  )), multipart ? 120_000 : 30_000);

  try {
    const request = async (): Promise<T> => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: 'include',
        headers,
        signal: controller.signal
      });
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!response.ok) {
        if (typeof window !== 'undefined' && response.status === 401 && !isPublicAuthenticationPath(path)) sessionRecovery.expire();
        let problem: Record<string, unknown> = {};
        try {
          const parsed: unknown = await response.json();
          if (parsed !== null && typeof parsed === 'object') problem = parsed as Record<string, unknown>;
        } catch {}
        const code = typeof problem.code === 'string' ? problem.code : 'REQUEST_ERROR';
        const detail = typeof problem.detail === 'string' ? problem.detail : typeof problem.message === 'string' ? problem.message : 'No fue posible completar la solicitud.';
        throw new ApiError(response.status, code, detail, problem);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const result = await response.json();
        if (typeof window !== 'undefined' && path === '/me') { const identity = recoveryIdentity(result?.user); if (identity) sessionRecovery.observe(identity); }
        if (controller.signal.aborted) throw controller.signal.reason;
        if (typeof window !== 'undefined' && path === '/auth/logout') sessionRecovery.reset();
        return result as T;
      }
      if (typeof window !== 'undefined' && path === '/auth/logout') sessionRecovery.reset();
      return await response.text() as T;
    };
    return await Promise.race([request(), cancellation]);
  } finally {
    clearTimeout(timeout);
    activeRequests.delete(controller);
    callerSignal?.removeEventListener('abort', onCallerAbort);
    if (onRequestAbort) controller.signal.removeEventListener('abort', onRequestAbort);
  }
}

export function formatDate(value: string, includeTime = true, locale: Locale = currentLocale()): string {
  return localizedDateFormat({
    weekday: 'short', day: 'numeric', month: 'short',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }, locale).format(new Date(value));
}

export function dateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
