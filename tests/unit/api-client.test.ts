import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, API_URL } from '../../apps/web/lib/api.js';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('browser API request lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    { 'x-csrf-token': 'test-csrf', 'Content-Type': 'custom/type', 'Accept-Language': 'fr-FR' },
    [['x-csrf-token', 'test-csrf'], ['Content-Type', 'custom/type'], ['Accept-Language', 'fr-FR']],
    new Headers({ 'x-csrf-token': 'test-csrf', 'Content-Type': 'custom/type', 'Accept-Language': 'fr-FR' })
  ] as HeadersInit[])('merges supported headers without replacing caller values (%#)', async (headers) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ saved: true }));
    vi.stubGlobal('fetch', fetchMock);
    const options: RequestInit = { method: 'POST', headers, body: JSON.stringify({ title: 'fixture' }), credentials: 'omit' };
    await expect(api('/activities', options)).resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, sent] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/activities`);
    expect(sent.credentials).toBe('include');
    expect(sent.method).toBe('POST');
    expect(sent.body).toBe(options.body);
    expect(Object.fromEntries(new Headers(sent.headers))).toEqual({ 'accept-language': 'fr-FR', 'content-type': 'custom/type', 'x-csrf-token': 'test-csrf' });
    expect(options.headers).toBe(headers);
  });

  it('sets normal JSON and locale headers and returns a text response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('csv-data', { headers: { 'content-type': 'text/csv' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/export')).resolves.toBe('csv-data');
    const sent = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(sent.headers).get('content-type')).toBe('application/json');
    expect(new Headers(sent.headers).get('accept-language')).toBe('es-DO');
    expect(sent.signal).toBeInstanceOf(AbortSignal);
  });

  it('bounds a normal mutation at 30 seconds and does not retry an uncertain result', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const pending = api('/activities', { method: 'POST', body: '{}' });
    const rejected = expect(pending).rejects.toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT', message: expect.stringContaining('No pudimos confirmar su resultado') });
    await vi.advanceTimersByTimeAsync(29_999);
    const sent = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(sent.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(sent.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows FormData 120 seconds and lets fetch supply its multipart boundary', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const body = new FormData();
    body.append('file', new Blob(['fixture']), 'fixture.txt');
    const pending = api('/files', { method: 'POST', body });
    const rejected = expect(pending).rejects.toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(119_999);
    const sent = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(sent.signal?.aborted).toBe(false);
    expect(new Headers(sent.headers).has('content-type')).toBe(false);
    expect(sent.body).toBe(body);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(sent.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the deadline active until the response body finishes', async () => {
    const response = jsonResponse({});
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const pending = api('/slow-body');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(response.json).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an already-cancelled request without fetching or starting timers', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const reason = new Error('caller cancelled');
    caller.abort(reason);
    await expect(api('/members', { signal: caller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates caller cancellation immediately and removes its forwarding listener', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const added = vi.spyOn(caller.signal, 'addEventListener');
    const removed = vi.spyOn(caller.signal, 'removeEventListener');
    const pending = api('/members', { signal: caller.signal });
    const reason = new DOMException('caller cancelled', 'AbortError');
    const rejected = expect(pending).rejects.toBe(reason);
    const sent = fetchMock.mock.calls[0]![1] as RequestInit;
    caller.abort(reason);
    await rejected;
    expect(sent.signal?.aborted).toBe(true);
    expect(sent.signal?.reason).toBe(reason);
    expect(removed).toHaveBeenCalledWith('abort', added.mock.calls[0]![1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up caller and internal listeners after success without aborting their signals', async () => {
    let requestSignal: AbortSignal | null | undefined;
    let removedInternal: ReturnType<typeof vi.spyOn> | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      requestSignal = options.signal;
      removedInternal = vi.spyOn(requestSignal!, 'removeEventListener');
      return Promise.resolve(jsonResponse({ total: 1 }));
    }));
    const caller = new AbortController();
    const removedCaller = vi.spyOn(caller.signal, 'removeEventListener');
    await expect(api('/members', { signal: caller.signal })).resolves.toEqual({ total: 1 });
    expect(removedCaller).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removedInternal).toHaveBeenCalledWith('abort', expect.any(Function));
    caller.abort();
    expect(requestSignal?.aborted).toBe(false);
  });

  it('preserves a structured HTTP error and removes the pending deadline', async () => {
    const problem = { code: 'FORBIDDEN', detail: 'Permission required', requestId: 'synthetic-request' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(problem, 403));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/roles', { method: 'DELETE' })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'Permission required', data: problem });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['not-json', 'null', '{"code":7,"detail":false}', '{"message":"Unavailable"}'])('handles non-problem HTTP bodies without masking the HTTP status (%s)', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 503, headers: { 'content-type': 'application/json' } })));
    await expect(api('/health')).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 503, headers: { 'content-type': 'application/json' } })));
    await expect(api('/health')).rejects.toMatchObject({ status: 503, code: 'REQUEST_ERROR', message: body.includes('Unavailable') ? 'Unavailable' : 'No fue posible completar la solicitud.' });
  });

  it('preserves a network error without retrying a mutation', async () => {
    const reason = new TypeError('synthetic connection failure');
    const fetchMock = vi.fn().mockRejectedValue(reason);
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/activities', { method: 'PATCH', body: '{}' })).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves successful-response decoding failures and cleans the deadline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid', { headers: { 'content-type': 'application/json' } })));
    await expect(api('/members')).rejects.toBeInstanceOf(SyntaxError);
  });
});
