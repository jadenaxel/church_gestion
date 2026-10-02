import 'reflect-metadata';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import swaggerUi from 'swagger-ui-express';
import { createClient } from 'redis';
import { bearerFromRequest, correlationMiddleware, csrfOriginMiddleware, initializeTelemetry, LocalRateCounter, observabilityMiddleware, prometheusMetrics, verifyAccessToken } from '@gc/platform';
import { openApiDocument } from './openapi.js';
import { checkServiceReadiness } from './readiness.js';
import { authenticatedNominationsConnectorOperation, consumeNominationsConnectorBudget, parseNominationsConnectorBudget } from './nominations-connector-budget.js';

try { process.loadEnvFile?.('.env'); } catch {}

@Module({})
class GatewayModule {}

initializeTelemetry('api-gateway');
const app = await NestFactory.create(GatewayModule, { logger: ['log', 'error', 'warn'] });
const server = app.getHttpAdapter().getInstance();
server.disable('x-powered-by');
server.use(cookieParser());
server.use(correlationMiddleware);
server.use(observabilityMiddleware('api-gateway'));
server.use(csrfOriginMiddleware);
server.use(helmet({ contentSecurityPolicy: false }));

const redis = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL }) : null;
if (redis) {
  redis.on('error', (error) => console.error(JSON.stringify({ level: 'warn', service: 'api-gateway', event: 'redis_error', error: error.message })));
  void redis.connect().catch(() => undefined);
}
const localRates = new LocalRateCounter();
const connectorLocalRates = new LocalRateCounter(16);
const nominationsConnectorBudget = parseNominationsConnectorBudget(process.env);
const allowedOrigins = [process.env.WEB_ORIGIN ?? 'http://localhost:3000'];
if (process.env.NODE_ENV !== 'production') allowedOrigins.push('http://127.0.0.1:3000');
// CORS must also decorate early rate-limit responses, otherwise browsers hide
// the 429 problem response as a generic network failure.
app.enableCors({
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ['x-correlation-id', 'content-disposition', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset']
});
server.use('/api/v1', async (request: Request, response: Response, next: () => void) => {
  // Los preflight CORS no son intentos de autenticación ni consumo de API.
  if (request.method === 'OPTIONS') {
    next();
    return;
  }
  const connectorOperation = authenticatedNominationsConnectorOperation({
    method: request.method, path: request.path, originalUrl: request.originalUrl,
    secretHeader: request.headers['x-integration-secret'], rawHeaders: request.rawHeaders,
  }, process.env.NOMINATIONS_INTEGRATION_SECRET);
  if (connectorOperation) {
    const admission = await consumeNominationsConnectorBudget({
      operation: connectorOperation, budget: nominationsConnectorBudget,
      localRates: connectorLocalRates, redis,
    });
    response.setHeader('ratelimit-limit', String(admission.limit));
    response.setHeader('ratelimit-remaining', String(admission.remaining));
    response.setHeader('ratelimit-reset', String(admission.resetSeconds));
    if (!admission.allowed) {
      response.setHeader('retry-after', String(admission.resetSeconds));
      response.status(429).type('application/problem+json').send({ status: 429, code: 'RATE_LIMITED', detail: 'Demasiadas solicitudes. Intente nuevamente en un minuto.' });
      return;
    }
    next();
    return;
  }
  const isLogin = /^\/auth\/(?:global\/login|login|password\/(?:forgot|reset))\/?$/.test(request.path);
  const windowSeconds = isLogin ? 60 : 60;
  const authLimit = Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? (process.env.NODE_ENV === 'production' ? 10 : 300));
  const apiLimit = Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 240);
  const limit = isLogin ? authLimit : apiLimit;
  const clientAddress = request.ip || request.socket.remoteAddress || 'unknown';
  // Authenticated traffic is limited per session instead of only by IP. A church
  // office commonly has many users behind the same public address, so an IP-only
  // bucket could make one active user throttle everyone else. Never persist the
  // raw session token in Redis or memory.
  const sessionToken = bearerFromRequest(request);
  let sessionKey: string | undefined;
  if (!isLogin && sessionToken) {
    try {
      const principal = await verifyAccessToken(sessionToken);
      sessionKey = createHash('sha256').update(`${principal.scope}:${principal.tenantId ?? ''}:${principal.sessionId}`).digest('hex').slice(0, 24);
    } catch { /* Invalid/rotating cookies stay in the shared unauthenticated IP bucket. */ }
  }
  const keyPart = isLogin ? clientAddress : (sessionKey ? `session:${sessionKey}` : `ip:${clientAddress}`);
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `gc:rate:${isLogin ? 'auth' : 'api'}:${keyPart}:${window}`;
  // Count locally even while Redis is healthy so a mid-window outage cannot reset the limit.
  const localCount = localRates.increment(key, (window + 1) * windowSeconds * 1000);
  let count: number;
  try {
    if (redis?.isReady) {
      const distributedCount = await redis.incr(key);
      if (distributedCount === 1) await redis.expire(key, windowSeconds + 1);
      count = Math.max(localCount, distributedCount);
    } else {
      count = localCount;
    }
  } catch {
    count = localCount;
  }
  response.setHeader('ratelimit-limit', String(limit));
  response.setHeader('ratelimit-remaining', String(Math.max(0, limit - count)));
  const resetSeconds = Math.max(1, Math.ceil(((window + 1) * windowSeconds * 1000 - Date.now()) / 1000));
  response.setHeader('ratelimit-reset', String(resetSeconds));
  if (count > limit) {
    response.setHeader('retry-after', String(resetSeconds));
    response.status(429).type('application/problem+json').send({ status: 429, code: 'RATE_LIMITED', detail: 'Demasiadas solicitudes. Intente nuevamente en un minuto.' });
    return;
  }
  next();
});

server.get('/health/live', (_request: Request, response: Response) => response.json({ status: 'ok' }));
server.get('/metrics', (_request: Request, response: Response) => response.type('text/plain; version=0.0.4').send(prometheusMetrics('api-gateway')));
server.get('/health/ready', async (_request: Request, response: Response) => {
  const services = {
    identity: process.env.IDENTITY_SERVICE_URL ?? 'http://127.0.0.1:4011',
    tenant: process.env.TENANT_SERVICE_URL ?? 'http://127.0.0.1:4012',
    calendar: process.env.CALENDAR_SERVICE_URL ?? 'http://127.0.0.1:4013',
    files: process.env.FILE_SERVICE_URL ?? 'http://127.0.0.1:4014',
    notification: process.env.NOTIFICATION_SERVICE_URL ?? 'http://127.0.0.1:4015',
    reports: process.env.REPORTS_SERVICE_URL ?? 'http://127.0.0.1:4016',
    elders: process.env.ELDERS_SERVICE_URL ?? 'http://127.0.0.1:4017',
    personalMinistries: process.env.PERSONAL_MINISTRIES_SERVICE_URL ?? 'http://127.0.0.1:4018',
    womensMinistry: process.env.WOMENS_MINISTRY_SERVICE_URL ?? 'http://127.0.0.1:4019',
    departmentOperations: process.env.DEPARTMENT_OPERATIONS_SERVICE_URL ?? 'http://127.0.0.1:4020'
  };
  const dependencies = await checkServiceReadiness(services);
  const ready = Object.values(dependencies).every((status) => status === 'ok');
  response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', dependencies });
});
server.get('/api/openapi.json', (_request: Request, response: Response) => response.json(openApiDocument));
server.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'GestionChurch API' }));

const targets = [
  { paths: ['/api/v1/auth', '/api/v1/me', '/api/v1/users', '/api/v1/roles', '/api/v1/department-memberships', '/api/v1/integrations', '/api/v1/roster'], target: process.env.IDENTITY_SERVICE_URL ?? 'http://127.0.0.1:4011' },
  { paths: ['/api/v1/global', '/api/v1/tenant'], target: process.env.TENANT_SERVICE_URL ?? 'http://127.0.0.1:4012' },
  {
    paths: ['/api/v1/departments', '/api/v1/venues', '/api/v1/resources', '/api/v1/activities', '/api/v1/activity-form', '/api/v1/availability', '/api/v1/review-requests', '/api/v1/review-sessions', '/api/v1/activity-change-requests', '/api/v1/calendar', '/api/v1/dashboard', '/api/v1/exports'],
    target: process.env.CALENDAR_SERVICE_URL ?? 'http://127.0.0.1:4013'
  },
  { paths: ['/api/v1/files'], target: process.env.FILE_SERVICE_URL ?? 'http://127.0.0.1:4014' },
  { paths: ['/api/v1/notifications', '/api/v1/webhooks'], target: process.env.NOTIFICATION_SERVICE_URL ?? 'http://127.0.0.1:4015' }
  ,{ paths: ['/api/v1/reports', '/api/v1/audit'], target: process.env.REPORTS_SERVICE_URL ?? 'http://127.0.0.1:4016' }
  ,{ paths: ['/api/v1/elders'], target: process.env.ELDERS_SERVICE_URL ?? 'http://127.0.0.1:4017' }
  ,{ paths: ['/api/v1/personal-ministries'], target: process.env.PERSONAL_MINISTRIES_SERVICE_URL ?? 'http://127.0.0.1:4018' }
  ,{ paths: ['/api/v1/womens-ministry'], target: process.env.WOMENS_MINISTRY_SERVICE_URL ?? 'http://127.0.0.1:4019' }
  ,{ paths: ['/api/v1/department-operations'], target: process.env.DEPARTMENT_OPERATIONS_SERVICE_URL ?? 'http://127.0.0.1:4020' }
];

for (const group of targets) {
  const servicePaths = group.paths.map((path) => path.replace('/api/v1', ''));
  server.use('/api/v1', createProxyMiddleware({
    pathFilter: (pathname) => servicePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)),
    target: group.target,
    changeOrigin: false,
    proxyTimeout: 20_000,
    timeout: 20_000,
    on: {
      error: (_error, _request, response) => {
        if ('writeHead' in response) {
          response.writeHead(503, { 'content-type': 'application/problem+json' });
          response.end(JSON.stringify({ status: 503, code: 'SERVICE_UNAVAILABLE', detail: 'Un servicio interno no está disponible.' }));
        }
      }
    }
  }));
}

server.use('/api', (_request: Request, response: Response) => {
  response.status(404).json({ status: 404, code: 'ROUTE_NOT_FOUND', detail: 'Ruta no encontrada.' });
});

await app.listen(Number(process.env.GATEWAY_PORT ?? 4000), process.env.BIND_HOST ?? '127.0.0.1');
console.log(JSON.stringify({ level: 'info', service: 'api-gateway', event: 'listening', port: 4000 }));
