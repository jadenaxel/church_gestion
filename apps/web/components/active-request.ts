/** Abort does not promise server rollback; it only prevents stale UI updates. */
export async function activeRequest<T>(signal: AbortSignal, request: () => Promise<T>, onSuccess: (value: T) => void, onError: (reason: unknown) => void) {
  try { const value = await request(); if (!signal.aborted) onSuccess(value); }
  catch (reason) { if (!signal.aborted) onError(reason); }
}
