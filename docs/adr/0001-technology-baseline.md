# ADR 0001: línea tecnológica

Estado: aceptado · 2026-09-26

Se eligió Node.js 24 LTS, TypeScript estricto, Next.js 16.3.6, React 19.3, NestJS 12.1 y PostgreSQL 18. La combinación mantiene el producto en JavaScript moderno con seguridad de tipos y permite usar rangos temporales/locks nativos de PostgreSQL.

El monorepo usa pnpm, pero cada servicio tiene proceso, puerto, módulo, responsabilidad y estado persistente separados. El Gateway es el único punto de entrada del navegador.

NATS JetStream es el transporte durable preferido con outbox/inbox y deduplicación; cuando `NATS_URL` no existe, el entorno nativo degrada a transporte HTTP interno idempotente. Redis aplica rate limiting distribuido con respaldo en memoria. Docker usa MinIO y ClamAV; la ejecución nativa puede usar filesystem aislado y firma EICAR. OpenTelemetry exporta OTLP a Jaeger cuando se configura el endpoint.
