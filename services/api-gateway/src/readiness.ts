/** Liveness alone does not prove a service can access its database. */
export async function checkServiceReadiness(services: Record<string, string>, timeoutMs = 1_500): Promise<Record<string, 'ok' | 'error'>> {
  const checks = await Promise.all(Object.entries(services).map(async ([name, url]) => {
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/health/ready`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) return [name, 'error'] as const;
      const payload: unknown = await response.json();
      const ready = payload !== null && typeof payload === 'object' && 'status' in payload && payload.status === 'ready';
      return [name, ready ? 'ok' : 'error'] as const;
    } catch { return [name, 'error'] as const; }
  }));
  return Object.fromEntries(checks);
}
