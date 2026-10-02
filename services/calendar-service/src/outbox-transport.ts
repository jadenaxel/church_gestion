/** Successful HTTP persistence is required; a hung transport must not hold the worker forever. */
export async function sendOutboxEvent(url: string, tenantId: string, secret: string, envelope: unknown, send: typeof fetch = fetch): Promise<void> {
  const response = await send(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': secret, 'x-tenant-id': tenantId },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Notification service ${response.status}`);
}
