# API pública v1

Base local: `http://localhost:4000/api/v1`.

El contrato OpenAPI 3.1 navegable está en `/api/docs` y el documento JSON en `/api/openapi.json`. `pnpm validate:openapi` lo valida durante integración continua.

Las rutas de login, recuperación/restablecimiento y webhooks verificados son públicas; el resto requiere la cookie HttpOnly `gc_session`. Las respuestas de error usan `application/problem+json` con `status`, `code`, `detail`, `errors` y `correlationId`.

| Método | Ruta | Permiso principal |
|---|---|---|
| POST | `/auth/login` | Público |
| POST | `/auth/global/login` | Público |
| POST | `/auth/logout` | Autenticado |
| GET | `/me` | Autenticado |
| GET/POST | `/users` | `users.manage` |
| GET/POST | `/global/tenants` | `global.tenants.manage` |
| GET | `/tenant/settings` | Tenant autenticado |
| GET/POST | `/departments` | `calendar.read/manage` |
| GET/POST | `/venues` | `calendar.read/manage` |
| GET/POST | `/resources` | `calendar.read/manage` |
| GET/POST/PATCH | `/activities` | `calendar.read/create` |
| POST | `/activities/:id/submit` | `calendar.create` |
| POST | `/activities/:id/options/:optionId/confirm` | `calendar.create` |
| POST | `/activities/:id/approve` | `calendar.conflict.resolve` |
| POST | `/activities/:id/request-review` | `calendar.create` |
| POST | `/activities/:id/cancel` | `calendar.create` |
| GET | `/availability` | `calendar.read` |
| GET | `/availability/suggestions` | `calendar.read` |
| GET | `/review-requests` | `calendar.review` |
| POST | `/review-requests/:id/decision` | `calendar.conflict.resolve` |
| GET/POST/PATCH | `/review-sessions` | `calendar.review/resolve` |
| GET/POST | `/files/activity/:id` | `calendar.read/create` |
| GET | `/files/:id/download` | `calendar.read` |
| GET/PATCH | `/notifications` y `/notifications/preferences` | Autenticado |
| GET | `/notifications/dead-letter` | `users.manage` |
| POST | `/notifications/deliveries/:id/retry` | `users.manage` |
| GET | `/dashboard` | `dashboard.read` |
| GET | `/exports/calendar.ics`, `.csv`, `.pdf` | `calendar.read` |
| GET | `/exports/audit.csv` | `audit.read` |

Los contratos Zod se encuentran en `packages/contracts/src/index.ts`.
