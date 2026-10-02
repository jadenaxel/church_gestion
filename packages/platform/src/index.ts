import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { type ArgumentsHost, type CanActivate, Catch, type ExecutionContext, HttpException, Injectable, SetMetadata, UnauthorizedException, type ExceptionFilter } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { SignJWT, jwtVerify } from 'jose';
import { z, ZodError } from 'zod';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { permissionsFor, roles, type AuthPrincipal, type Role } from '@gc/contracts';
import { validateProductionSecurity } from './security.js';
export { assertSafeOfficeArchive, isProductionDemoPassword, LocalRateCounter, matchesSecret, officeMediaType, safeCalendarText, safeCsvCell, validateProductionSecurity } from './security.js';
export { activityReadPredicate, assertActivityRead, canReadActivityDetails, canReadLeadershipActivities, redactActivityConflict } from './activity-privacy.js';
import { finishRequestSpan, initializeTelemetry, requestSpan } from './telemetry.js';
export { initializeTelemetry } from './telemetry.js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // Optional local environment file.
}

validateProductionSecurity();
const jwtSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'gestionchurch-development-secret-change-me-now'
);

export const Public = () => SetMetadata('isPublic', true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly reflector = new Reflector();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('isPublic', [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    const token = bearerFromRequest(request);
    if (!token) throw new UnauthorizedException('La sesión es requerida.');
    try {
      const principal = await verifyAccessToken(token);
      request.user = await refreshAndValidatePrincipal(principal, request);
      return true;
    } catch {
      throw new UnauthorizedException('La sesión no es válida o ha vencido.');
    }
  }
}

async function refreshAndValidatePrincipal(principal: AuthPrincipal, request: Request): Promise<AuthPrincipal> {
  const { controlPool, tenantPoolFromId } = await import('@gc/database');
  if (principal.scope === 'global') {
    const result = await controlPool.query<{ roles: Role[] }>(
      `SELECT u.roles FROM control.global_sessions s
       JOIN control.global_users u ON u.id=s.user_id
       WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active`,
      [principal.sessionId, principal.sub]
    );
    const roles = result.rows[0]?.roles;
    if (!roles) throw new UnauthorizedException('La sesión fue revocada.');
    return { ...principal, roles, permissions: permissionsFor(roles) };
  }
  if (!principal.tenantId || !principal.tenantSlug) throw new UnauthorizedException('Contexto de iglesia inválido.');
  const host = (request.hostname || request.headers.host?.split(':')[0] || '').toLowerCase();
  const baseDomain = (process.env.BASE_DOMAIN ?? 'gestionchurch.com').toLowerCase();
  if (process.env.NODE_ENV === 'production' && host.endsWith(`.${baseDomain}`)) {
    const requestedSlug = host.slice(0, -(baseDomain.length + 1));
    if (requestedSlug !== principal.tenantSlug) throw new UnauthorizedException('La sesión no corresponde a este dominio.');
  }
  const { pool } = await tenantPoolFromId(principal.tenantId);
  const result = await pool.query<{ roles: Role[] }>(
    `SELECT u.roles FROM identity.sessions s
     JOIN identity.users u ON u.id=s.user_id
     WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active`,
    [principal.sessionId, principal.sub]
  );
  const roles = result.rows[0]?.roles;
  if (!roles) throw new UnauthorizedException('La sesión fue revocada.');
  return { ...principal, roles, permissions: permissionsFor(roles) };
}

export function bearerFromRequest(request: Request): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (request as Request & { cookies?: Record<string, string> }).cookies?.gc_session;
  return cookie ?? null;
}

export async function signAccessToken(principal: AuthPrincipal): Promise<string> {
  return new SignJWT({ ...principal })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setJti(principal.sessionId)
    .setExpirationTime('8h')
    .sign(jwtSecret);
}

export async function verifyAccessToken(token: string): Promise<AuthPrincipal> {
  const result = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] });
  const principal = z.object({
    sub: z.uuid(), email: z.email(), name: z.string().min(1).max(200),
    roles: z.array(z.enum(roles)).min(1).max(roles.length),
    permissions: z.array(z.string().max(120)).max(200),
    tenantId: z.uuid().optional(), tenantSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional(),
    scope: z.enum(['global', 'tenant']), sessionId: z.uuid()
  }).parse(result.payload);
  if (!result.payload.exp || result.payload.jti !== principal.sessionId
    || (principal.scope === 'tenant' && (!principal.tenantId || !principal.tenantSlug))
    || (principal.scope === 'global' && (principal.tenantId || principal.tenantSlug))) {
    throw new UnauthorizedException('Contexto de sesión inválido.');
  }
  const { tenantId, tenantSlug, ...identity } = principal;
  return { ...identity, ...(tenantId ? { tenantId } : {}), ...(tenantSlug ? { tenantSlug } : {}) };
}

export function currentUser(request: Request & { user?: AuthPrincipal }): AuthPrincipal {
  if (!request.user) throw new UnauthorizedException('Sesión requerida.');
  return request.user;
}

export function requirePermission(user: AuthPrincipal, permission: string): void {
  if (!user.permissions.includes(permission)) {
    const error = new Error(`No tiene el permiso requerido: ${permission}`) as Error & { status?: number; code?: string };
    error.status = 403;
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function correlationMiddleware(request: Request, response: Response, next: NextFunction): void {
  const id = typeof request.headers['x-correlation-id'] === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(request.headers['x-correlation-id'])
    ? request.headers['x-correlation-id']
    : randomUUID();
  request.headers['x-correlation-id'] = id;
  response.setHeader('x-correlation-id', id);
  next();
}

export function csrfOriginMiddleware(request: Request, response: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }
  const origin = request.headers.origin;
  const allowed = new Set([process.env.WEB_ORIGIN ?? 'http://localhost:3000']);
  if (process.env.NODE_ENV !== 'production') allowed.add('http://127.0.0.1:3000');
  const cookieAuthenticated = /(?:^|;\s*)gc_session=/.test(request.headers.cookie ?? '');
  // Bearer/service clients need no browser origin. Browser cookie writes do.
  // Also check anonymous login origins to prevent login CSRF.
  if ((origin !== undefined && !allowed.has(origin)) || (cookieAuthenticated && !origin)) {
    response.status(403).type('application/problem+json').json({
      type: 'about:blank', title: 'Origen no permitido', status: 403, code: 'CSRF_ORIGIN_REJECTED',
      detail: 'El origen de la solicitud no está autorizado.', instance: request.originalUrl,
      correlationId: request.headers['x-correlation-id']
    });
    return;
  }
  next();
}

type Metric = { count: number; errors: number; durationMs: number };
const httpMetrics = new Map<string, Metric>();

function routeLabel(request: Request): string {
  return request.route?.path ? String(request.route.path) : 'unmatched-or-proxied';
}

export function observabilityMiddleware(serviceName: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const start = performance.now();
    const span = requestSpan(serviceName, request.method, routeLabel(request));
    response.on('finish', () => {
      const route = routeLabel(request);
      const key = httpMetrics.size < 500 ? `${request.method} ${route}` : 'OTHER';
      const current = httpMetrics.get(key) ?? { count: 0, errors: 0, durationMs: 0 };
      current.count += 1;
      current.errors += response.statusCode >= 500 ? 1 : 0;
      current.durationMs += performance.now() - start;
      httpMetrics.set(key, current);
      finishRequestSpan(span, response.statusCode, performance.now() - start);
      console.log(JSON.stringify({
        level: response.statusCode >= 500 ? 'error' : 'info', service: serviceName, event: 'http_request',
        method: request.method, route, status: response.statusCode,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        correlationId: request.headers['x-correlation-id']
      }));
    });
    next();
  };
}

const auditedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function auditRoute(request: Request): { resourceType: string; resourceId: string | null; operation: string } {
  const path = request.originalUrl.split('?')[0] ?? request.path;
  const segments = path.split('/').filter(Boolean).filter((segment) => segment !== 'api' && segment !== 'v1');
  const resourceId = segments.find((segment) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) ?? null;
  const semanticSegments = segments.filter((segment) => segment !== resourceId).slice(0, 5);
  return {
    resourceType: semanticSegments[0]?.replaceAll(/[^a-z0-9_-]/gi, '').slice(0, 80) || 'api',
    resourceId,
    operation: semanticSegments.join('.').replaceAll(/[^a-z0-9_.-]/gi, '').slice(0, 180) || 'request'
  };
}

function auditOutcome(status: number): 'SUCCESS' | 'REJECTED' | 'FAILED' {
  if (status < 400) return 'SUCCESS';
  if (status < 500) return 'REJECTED';
  return 'FAILED';
}

/**
 * Defense-in-depth audit coverage for every authenticated state-changing API call.
 * Domain services still write their richer business events in the same append-only
 * ledger; this middleware guarantees that denied and otherwise uncovered writes
 * also leave a durable, correlation-aware trace. Request bodies, cookies, tokens,
 * query strings and response bodies are intentionally never persisted.
 */
export function durableAuditMiddleware(serviceName: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!auditedMethods.has(request.method)) {
      next();
      return;
    }
    const startedAt = performance.now();
    const token = bearerFromRequest(request);
    response.once('finish', () => {
      if (!token) return;
      void (async () => {
        try {
          const principal = await verifyAccessToken(token);
          const route = auditRoute(request);
          const status = response.statusCode;
          const metadata = {
            service: serviceName,
            method: request.method,
            operation: route.operation,
            status,
            outcome: auditOutcome(status),
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
            sessionId: principal.sessionId,
            sourceFingerprint: createHash('sha256').update(
              `${process.env.AUDIT_PRIVACY_SALT ?? 'gestionchurch-local-audit'}:${request.ip ?? request.socket.remoteAddress ?? ''}:${request.headers['user-agent'] ?? ''}`
            ).digest('hex').slice(0, 32)
          };
          const correlationId = typeof request.headers['x-correlation-id'] === 'string'
            ? request.headers['x-correlation-id'].slice(0, 100)
            : null;
          const { controlPool, tenantPoolFromId } = await import('@gc/database');
          if (principal.scope === 'tenant' && principal.tenantId) {
            const { pool } = await tenantPoolFromId(principal.tenantId);
            await pool.query(
              `INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data,correlation_id)
               VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
              [principal.sub, `api.${serviceName.replace(/-service$/, '')}.${request.method.toLowerCase()}.${route.operation}`.slice(0, 240),
                route.resourceType, route.resourceId, JSON.stringify(metadata), correlationId]
            );
          } else if (principal.scope === 'global') {
            await controlPool.query(
              `INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
               VALUES($1,$2,$3,$4,$5::jsonb)`,
              [principal.sub, `api.${serviceName.replace(/-service$/, '')}.${request.method.toLowerCase()}.${route.operation}`.slice(0, 240),
                route.resourceType, route.resourceId, JSON.stringify({ ...metadata, correlationId })]
            );
          }
        } catch (error) {
          console.error(JSON.stringify({
            level: 'error', service: serviceName, event: 'durable_audit_write_failed',
            correlationId: request.headers['x-correlation-id'],
            error: error instanceof Error ? error.message : String(error)
          }));
        }
      })();
    });
    next();
  };
}

export function prometheusMetrics(serviceName: string): string {
  const service = serviceName.replaceAll('-', '_');
  const lines = [
    '# HELP gestionchurch_http_requests_total HTTP requests processed.',
    '# TYPE gestionchurch_http_requests_total counter',
    '# HELP gestionchurch_http_request_errors_total HTTP responses with status 5xx.',
    '# TYPE gestionchurch_http_request_errors_total counter',
    '# HELP gestionchurch_http_request_duration_ms_total Accumulated request duration.',
    '# TYPE gestionchurch_http_request_duration_ms_total counter'
  ];
  for (const [route, metric] of httpMetrics) {
    const label = route.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    lines.push(
      `gestionchurch_http_requests_total{service="${service}",route="${label}"} ${metric.count}`,
      `gestionchurch_http_request_errors_total{service="${service}",route="${label}"} ${metric.errors}`,
      `gestionchurch_http_request_duration_ms_total{service="${service}",route="${label}"} ${metric.durationMs.toFixed(3)}`
    );
  }
  return `${lines.join('\n')}\n`;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const candidate = exception as { status?: number; statusCode?: number; code?: string; message?: string };
    const status = exception instanceof ZodError
      ? 400
      : exception instanceof HttpException
        ? exception.getStatus()
        : candidate.status ?? candidate.statusCode ?? 500;
    const detail = exception instanceof ZodError
      ? 'Uno o más campos no son válidos.'
      : status >= 500
        ? 'Ocurrió un error inesperado.'
        : candidate.message ?? 'No fue posible completar la solicitud.';
    response.status(status).type('application/problem+json').json({
      type: 'about:blank',
      title: status >= 500 ? 'Error interno' : 'Solicitud no completada',
      status,
      code: exception instanceof ZodError ? 'VALIDATION_ERROR' : candidate.code ?? 'REQUEST_ERROR',
      detail,
      errors: exception instanceof ZodError ? exception.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) : undefined,
      instance: request.originalUrl,
      correlationId: request.headers['x-correlation-id']
    });
  }
}

export async function bootstrapNest(module: object, port: number, serviceName: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const { assertRuntimeDatabaseSecurity, controlPool } = await import('@gc/database');
    await assertRuntimeDatabaseSecurity(controlPool);
  }
  initializeTelemetry(serviceName);
  const app = await NestFactory.create(module as never, { logger: ['log', 'error', 'warn'], rawBody: true });
  const server = app.getHttpAdapter().getInstance();
  app.use(cookieParser());
  app.use(correlationMiddleware);
  app.use(observabilityMiddleware(serviceName));
  app.use(durableAuditMiddleware(serviceName));
  app.use(csrfOriginMiddleware);
  app.use(serviceName === 'api-gateway' ? helmet() : helmet({ contentSecurityPolicy: false }));
  const allowedOrigins = [process.env.WEB_ORIGIN ?? 'http://localhost:3000'];
  if (process.env.NODE_ENV !== 'production') allowedOrigins.push('http://127.0.0.1:3000');
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['x-correlation-id']
  });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  server.get('/health/ready', async (_request: Request, response: Response) => {
    try {
      const { controlPool } = await import('@gc/database');
      await controlPool.query('SELECT 1');
      response.json({ status: 'ready', service: serviceName });
    } catch {
      response.status(503).json({ status: 'not_ready', service: serviceName });
    }
  });
  server.get('/metrics', (_request: Request, response: Response) => {
    response.type('text/plain; version=0.0.4').send(prometheusMetrics(serviceName));
  });
  await app.listen(port, process.env.BIND_HOST ?? '127.0.0.1');
  console.log(JSON.stringify({ level: 'info', service: serviceName, event: 'listening', port }));
}

export function problem(error: unknown): { status: number; body: Record<string, unknown> } {
  const candidate = error as { status?: number; statusCode?: number; code?: string; message?: string; issues?: unknown };
  const status = candidate.status ?? candidate.statusCode ?? 500;
  return {
    status,
    body: {
      type: 'about:blank',
      title: status >= 500 ? 'Error interno' : 'No fue posible completar la solicitud',
      status,
      code: candidate.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      detail: status >= 500 ? 'Ocurrió un error inesperado.' : candidate.message,
      errors: candidate.issues
    }
  };
}

export const HEALTH_RESPONSE = { status: 'ok' as const };
