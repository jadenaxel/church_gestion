# Recuperación de contraseña: intención durable R01/R23/R32

Continuación autorizada del prompt original, 2 de octubre de 2026. Las mediciones focales de esta tabla corresponden al corte intermedio `2nOpFkzVeNxq3P0_zbvii`, no a su cierre global. Después root reconstruyó/arrancó el runtime oficial `-SkipDataSetup -NoBuild` en `m3K6tJtdsnu8HBjapaS00`: las 14 unitarias, 17 DB y 8 HTTP se repitieron dentro de UNIT395, DB66 y BACK HTTP103; navegador21 incluye la cola Identidad y su retiro inmediato. Son subconjuntos, no pases adicionales. Este documento no autoriza producción.

## Corrección y contrato conservado

`POST /auth/password/forgot` conserva validación, token aleatorio de 32 bytes, hash SHA-256, vigencia de 30 minutos y respuesta genérica. Producción no devuelve token; el `developmentToken` existente permanece solo en desarrollo. Cuenta inexistente/inactiva o fallo interno mantienen la respuesta genérica, no un recibo de entrega.

La misma transacción crea token, auditoría `auth.password_reset.requested` e intención `identity.password_reset_outbox`. Nunca hay HTTP antes de COMMIT. Auditoría incluye solamente ID de correlación de intención, no token/hash/email/URL. La expiración se copia directamente en SQL: pasar un timestamptz por JS Date perdía microsegundos y fue corregido sin cambiar vigencia.

El payload destinatario/URL está cifrado con el primitivo AES-256-GCM y `CONFIG_ENCRYPTION_KEY` existentes, ligado por AAD al tenant y evento. En producción una clave ausente/corta falla cerrado, sin crear un token huérfano. No se generaron/rotaron secretos reales. La clave debe permanecer disponible para intenciones pendientes y restauraciones; su rotación requiere coordinación, no fallback secreto productivo.

## Dispatcher y recuperación administrativa

- Evento UUID estable de extremo a extremo; el inbox existente deduplica replay de ACK incierto y detecta cambio de contenido.
- Arranque posterior a bootstrap/obtención del pool y barrido cada 10 segundos; captura errores de control, tenant, transporte y actualización secundaria sin rechazo no manejado.
- Lease de 45 segundos por solicitud, timeout HTTP de 15 segundos, claim-token/fencing, máximo 20 publicaciones por barrido y ocho claims automáticos. Contar al claim también acota reinicios/crashes antes del ACK.
- Tras respuesta HTTP exitosa marca **aceptación interna** y borra el ciphertext de la intención. No dice que SMTP/Meta entregó ni que el destinatario leyó.
- Token usado/vencido o usuario inactivo impiden nuevos claims/retry; el barrido retira y borra payload. Metadata calcula validez y causa desde el estado actual, sin esperar el siguiente barrido.
- `GET /auth/password/outbox/dead-letter` y `POST /auth/password/outbox/:id/retry` exigen el permiso existente `users.manage` y sesión tenant. No hay nueva autoridad, asignaciones personales o grants cross-domain.
- GET devuelve solo `id,eventType,aggregateId,attempts,createdAt,expiresAt,retryable,lastError`. `lastError` es null o código acotado TOKEN_EXPIRED/TOKEN_USED/ACCOUNT_INACTIVE, nunca error del proveedor. Agotados y retirados permanecen visibles; vencidos/usados/inactivos no reprogramables. Expiración usa la menor fecha token/intención.
- POST requiere razón de 10–500 caracteres, conserva ID y valida token/usuario/lease bajo lock; reset y audit son atómicos. Ya aceptado, no agotado, lease vigente o retry repetido/concurrente se rechaza409; ajeno/inexistente404. ACK significa reprogramado, no enviado.

## Archivos y aplicación de esquema

Implementación: `services/identity-service/src/password-reset-outbox.ts` y cambios focalizados en `main.ts`; esquema `packages/database/src/password-reset-outbox.ts` integrado en provisioning de bases nuevas; OpenAPI en `services/api-gateway/src/openapi.ts` (153 rutas al comprobarse).

`scripts/apply-premium-password-reset-outbox.ts` es read-only por defecto/`--check`; `--apply` explícito añade una tabla y un índice. Valida control y admin PostgreSQL loopback55432, control canónico, exactamente los dos tenants originales y nombres UUID correctos; rechaza argumentos desconocidos. Verifica ACL identity derivada de defaults y el índice. No ejecuta seed/full-migrate/sync, DML de negocio ni GRANT.

Root revisó/aplicó el esquema a dos bases originales a las **03:59:40 UTC**, sin datos QA, mensajes o grants; evidencia [additive-recovery-schema.json](additive-recovery-schema.json). Esta partición no aplicó DDL a originales ni reinició servicios. No hay backfill de solicitudes históricas: su hash no permite reconstruir un token y no se fabricaron avisos anteriores.

## Pruebas actuales y limpieza

| Conjunto propio | Resultado | Evidencia / alcance |
|---|---|---|
| Unitarias | **14/14 PASS** | [password-reset-unit-results.json](password-reset-unit-results.json), `tests/unit/password-reset-outbox.test.ts`: cifrado/AAD/tamper/clave productiva, HTTP15s/response.ok, fences/scrub, errores secundarios, razones y DDL sin grants/backfill. Son subconjunto del total GC, no sumar dos veces. |
| PostgreSQL | **17/17 PASS**, cero omitidas | [password-reset-db-results.json](password-reset-db-results.json), `tests/integration/premium-password-reset-outbox-db.test.ts`. Última ejecución inicia 00:00:29 local. |
| HTTP | **8/8 PASS**, cero omitidas | [password-reset-api-results.json](password-reset-api-results.json), `tests/integration/premium-password-reset-outbox-api.test.ts`; `RUN_PREMIUM_PASSWORD_RESET_API_TESTS=1`, inicio 00:04:59 local y runtime actualizado confirmado por root. |

DB17 ejecuta SQL real bajo rol identity y en tenant propio SUSPENDED: token/hash/audit/intención; inexistente/inactivo; rollback audit y enqueue; COMMIT PostgreSQL confirmado con ACK perdido; receptor HTTP503 y dos procesos Node/tsx worker sucesivos; inbox COMMIT con socket/ACK perdido y replay sin segunda notificación; claims concurrentes/lease vencida/fence; ocho intentos; metadata sin contenido; usado/vencido/inactivo antes/después del worker; retry-audit rollback y positivo/concurrente; clave indisponible; ACL identity permitida sin USAGE/INSERT de notifications.

El receptor HTTP efímero y sus filas son propios. No SMTP/Meta/NATS ni reinicio del runtime real. Los procesos worker efímeros exigen destino canónico UUID, registro `premium-*` suspendido y conexión loopback; credenciales solo en memoria/environment, no argv/salida. Teardown cierra receptor/worker/pools y `destroy()` valida ausencia de DB/registro/carpeta propios: **cero fixtures propios activos/restantes** al finalizar.

HTTP8 verifica403 para ambos endpoints sin `users.manage`, metadata de ocho campos sin destinatario/contenido,404/no-list de otra fixture propia, expiración visible inmediatamente y409, usados/aceptados/no agotados409, rollback audit del retry y concurrentes201/409 con un solo audit, UUID/razón/campos extra400 y respuesta forgot genérica ante inexistente/fallo audit. Las dos fixtures HTTP usan claves de cifrado sintéticas diferentes del runtime y preferencias email/WhatsApp deshabilitadas: el worker no puede descifrar sus intenciones administrativas ni contactar proveedor. Ambas tuvieron cleanup validado, sin recursos propios restantes.

Typecheck servicios PASS, lint focal de10 archivos PASS y OpenAPI153 PASS tras los cambios. El conjunto unitario final global395 ya contiene las selecciones del agente; este documento no agrega14 ni ejecuciones anteriores a ese total. La consolidación DB/HTTP global pertenece al índice root, no se suma aquí otra vez.

Primer ensayo DB: **14 PASS/2 FAIL de16**, conservado en [password-reset-outbox-db-first-attempt.json](password-reset-outbox-db-first-attempt.json). Un fallo real era precisión de expiración; el otro, harness usando lookup de tabla notifications sin USAGE bajo identity. Se corrigió el SQL de expiración y se comprobó ACL por OID más USAGE=false, sin grants. El intermedio16/16 no se suma al final17/17.

Ejecución reproducible aislada:

```powershell
pnpm exec vitest run tests/unit/password-reset-outbox.test.ts
$env:RUN_PREMIUM_PASSWORD_RESET_DB_TESTS='1'
pnpm exec vitest run tests/integration/premium-password-reset-outbox-db.test.ts --maxWorkers=1
# Solo después del aviso de runtime actualizado:
$env:RUN_PREMIUM_PASSWORD_RESET_API_TESTS='1'
pnpm exec vitest run tests/integration/premium-password-reset-outbox-api.test.ts --maxWorkers=1
```

## Límites honestos

Se cierra la ausencia de intención durable para **nuevas solicitudes** en el dominio identity; el transporte proveedor real no se validó. Inbox/outbox garantizan persistencia y replay controlado en los casos ensayados, no exactamente una entrega externa.

Existe una frontera temporal inevitable: si el token se usa/vence o la cuenta cambia después del claim mientras el HTTP/proveedor está en vuelo, no se puede retirar un mensaje ya aceptado. Un enlace usado/vencido sigue rechazado por el endpoint de reset; metadata/retry nunca lo reactivan. El test no acredita cancelación distribuida de mensajes ni deduplicación SMTP del proveedor. Tampoco valida HA, caída prolongada, despliegue del secret-store, custodia/rotación productivas o recuperación completa del conjunto integrado.

No se habilitó MFA ni cambió política de usuarios/roles, tenant-settings, frontend o Nombramientos. La aceptación productiva y los gates externos permanecen en la matriz global.
