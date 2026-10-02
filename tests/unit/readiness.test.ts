import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { checkServiceReadiness } from '../../services/api-gateway/src/readiness.js';

describe('gateway dependency readiness', () => {
  it('does not treat a live process with failed database readiness as healthy', async () => {
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/health/live') { response.end('{"status":"ok"}'); return; }
      response.statusCode = 503; response.end('{"status":"not_ready"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing isolated test address');
      expect(await checkServiceReadiness({ synthetic: `http://127.0.0.1:${address.port}` })).toEqual({ synthetic: 'error' });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it('bounds dependency waits and validates the declared ready state, not only HTTP 200', async () => {
    const server = createServer((request, response) => {
      if (request.url?.startsWith('/hanging/')) return;
      response.setHeader('content-type', 'application/json');
      response.end(request.url?.startsWith('/valid/') ? '{"status":"ready"}' : '{"status":"ok"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing isolated test address');
      const base = `http://127.0.0.1:${address.port}`;
      const start = performance.now();
      expect(await checkServiceReadiness({ valid: `${base}/valid`, misleading: base, hanging: `${base}/hanging` }, 100)).toEqual({ valid: 'ok', misleading: 'error', hanging: 'error' });
      expect(performance.now() - start).toBeLessThan(2_000);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
