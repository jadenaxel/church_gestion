# Operación y recuperación de la consolidación

Alcance: builds locales de GestionChurch y Nombramientos, sin publicación. No sustituye un ensayo productivo ni autoriza cambiar claves, cargos o infraestructura. Mantener secretos fuera de consola, tickets, capturas y repositorio.

## Arranque y diagnóstico local

Desde `X:/CODE/GestionChurch`, el PostgreSQL local existente debe conservarse. No instalar otra instancia para esta comprobación.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./start-gestionchurch.ps1 -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./start-gestionchurch.ps1 -Action Start -Mode Native -SkipDataSetup -NoBuild
```

Esta segunda orden necesita builds existentes y el cluster ya creado. Omite migraciones, demos y la preparación/sincronización general de Nombramientos. Si falta un artefacto, compilar primero; no usar `-NoBuild` para aceptar uno inválido. El inicio normal mantiene la preparación legítima, pero cualquier migración o sincronización debe revisarse antes de una validación sobre iglesias existentes. Las demostraciones requieren `-SeedDemo` explícito; no usarlas en iglesias reales.

La interfaz local es `http://localhost:3000`, el gateway `http://localhost:4000`, Nombramientos web `http://localhost:3300` y su API `http://localhost:4100`. La salud del gateway consulta `/health/ready` de sus servicios: un proceso vivo no basta. Revisar por separado los checks de Nombramientos y sus dependencias. Un mensaje de modo nativo/degradado **no significa** que Redis, NATS, antivirus, storage o proveedores productivos estén validados.

Ante fallo: consultar `-Action Status`, después `-Action Logs`; corregir la dependencia indicada y repetir el check. No copiar logs completos sin sanitizar. No cambiar a `development`, relajar permisos o habilitar simulación para presentar un éxito productivo.

El apagado oficial también detiene el PostgreSQL administrado por este arranque. Antes de ejecutarlo, coordinar que no haya trabajos/fixtures ni usuarios que dependan de esa instancia. No usar un `taskkill` general sobre todos los procesos Node/PostgreSQL.

## Publicación futura: gates previos

1. Acordar staging, carga, SLO y RPO/RTO con el dueño; no hay cifras contractuales aprobadas aquí.
2. Usar artefactos identificados y lockfiles; separar runtime, migración/provisionamiento y backup. Revisar el plan de todas las migraciones antes de escribir.
3. Inyectar secretos privados, credenciales por tenant/servicio y CA verificable según `premium-runtime-credentials.md`. Validar CONNECT, roles heredados, SCRAM, TLS y redes con negativas A→B/B→A.
4. Configurar HTTPS, proxy/orígenes/cookies, storage privado, antivirus real, colas durables y observabilidad. No publicar `docker-compose.yml` local como configuración productiva sin revisión.
5. Probar SMTP/Meta con remitentes y destinatarios autorizados; distinguir encolado/aceptado/entregado y preservar consentimiento. No utilizar teléfonos de miembros para QA.
6. Ensayar restauración coordinada GC/Nom, objetos y custodia histórica. Los ensayos aislados de este trabajo no acreditan S3 ni un snapshot atómico de todo el sistema.
7. Cerrar las decisiones técnicas pendientes de la matriz, después ejecutar piloto humano, revisión lingüística, dispositivos físicos y evaluación independiente autorizada.

## Migraciones y rollback

Las DDL de fiabilidad GC agregan columnas nullable e índice, sin backfill de datos de negocio. Nombramientos 031/032 y tenant038 preservan funciones/grants y no asignan roles a personas reales. Se aplicaron con planes exactos y controles de destino; no ejecutar los helpers otra vez como una migración general. Los snapshots de rollback están en una carpeta privada, no en el informe distribuible.

### Sesiones por navegador — D10, 2 de octubre

Nombramientos añade039 (`039_device_bound_http_sessions.sql`) con tres tablas de metadatos, índices y triggers para revocación y limpieza acotada de nonces. La aplicación local se hizo exclusivamente sobre los tres destinos conocidos, con el módulo detenido, checksum del plan exacto y comparación de datos/privilegios anteriores. No hubo seed, sync general, sustitución de claves, cambios de cargos ni instalación de PostgreSQL. El [receipt final](premium-evidence/2026-10-02/nom-device-session-migration-receipt.jsonl) verifica ledger41, pending0 y control estable; el primer receipt se conserva porque una suite concurrente provisionaba sus fixtures y el cierre de control falló de forma explícita.

`X:/CODE/NOMBRAMIENTOS/packages/database/scripts/apply-device-session-migration.mjs --check` es un preflight read-only para esta instalación exacta, no un migrador productivo universal. `--apply` requiere detener únicamente Nombramientos y falla si encuentra otros tenants, planes o destinos; en un reinicio incompleto verifica nuevamente tablas, dueños NOLOGIN, ACL y triggers sin volver a ejecutar una DDL ya aplicada. No sustituir sus guardas por una orden general de migración.

La configuración productiva requiere `API_PUBLIC_ORIGIN` HTTPS exacto, alineado con la URL pública de API y `NEXT_PUBLIC_API_URL`, CORS/orígenes permitidos y cookies/proxy revisados. Método, URI/query y bytes del cuerpo se firman contra ese origen; no confiar en un `Host` o `X-Forwarded-*` arbitrario para reconstruirlo. El cambio no habilita el MFA global diferido ni rutas locales MFA en el perfil integrado.

En el acceso ordinario, abrir desde GestionChurch. Un navegador conocido conserva su clave local y revalida el vínculo en segundo plano. Un navegador nuevo muestra una guía y queda pendiente: un administrador autorizado y con custodia debe verificar la huella y aprobarlo, o realizar una recuperación offline explícita. Roles de administración no entregan claves ni permisos de comisión/escrutinio por sí solos. No crear claves nuevas para resolver un timeout: conservar el dispositivo e intención y reconciliar su estado.

Desde Configuración, cada persona puede consultar/cerrar una sesión propia o las demás. Revocar un dispositivo invalida sus vínculos en la transacción tenant y cierra conexiones en vivo tras la revalidación; otros dispositivos autorizados permanecen independientes. Las denegaciones autenticadas registran solo código, método, ruta registrada y contexto auditable, no firmas, nonces, cuerpo libre o cookies. Ante presupuesto429, esperar/reintentar; no desactivar las pruebas. Los nonces expirados se podan en lotes de500 sin borrar negocio, grants ni auditoría.

El gateway separa el tráfico interno de Nombramientos del presupuesto público únicamente para POST exactos `authorize`, `redeem` y `organization`, sin query/sufijo y con secreto escalar configurado de al menos32 caracteres validado en tiempo constante. Nunca inferir confianza por IP, nombre de tenant, cuerpo o un bearer/cookie declarado. El bucket de servicio es fijo, no contiene el secreto y no confiere autorización: el servicio de identidad sigue comprobando sesión de origen y roles, y Nombramientos sigue comprobando dispositivo y concesión.

Los límites por minuto son configurables mediante `NOMINATIONS_SERVICE_RATE_LIMIT_PER_MINUTE` (agregado,2400 por defecto), `NOMINATIONS_AUTHORIZE_RATE_LIMIT_PER_MINUTE` (2160), `NOMINATIONS_REDEEM_RATE_LIMIT_PER_MINUTE` (120) y `NOMINATIONS_ORGANIZATION_RATE_LIMIT_PER_MINUTE` (120). Exigen enteros positivos, máximo60000, agregado mínimo3 y suma de operaciones no superior al agregado. Configurar los cuatro coherentemente; un valor inválido detiene el arranque y el error identifica sólo el nombre, no su valor. La admisión por operación precede al agregado para reservar apertura/directorio ante introspecciones sobrecupo. No aumentar ni desactivar el límite público para solucionar un bloqueo del conector. El fallback local conserva consumo por proceso; no acredita cuota HA global durante una caída de Redis. Dimensionar y ensayar estos valores en staging según SLO acordados.

El diagnóstico Nom `gestionchurch.upstream_rejected` conserva sólo `operation` enumerada, `upstreamStatus` numérico y `observedAt`, además del evento fijo. Un502 del intercambio puede proceder de429,503 u otro rechazo: comprobar ese registro antes de atribuirlo a credenciales. Capturar sólo esos campos antes de un reinicio que trunque el log; no publicar stdout completo, cuerpos, cabeceras o URLs con códigos de lanzamiento. Los informes públicos de navegador eliminan queries/fragmentos locales y referencias a error-context bruto, conservando resultados; los originales permanecen privados.

Perder la clave de firma local no autoriza sobrescribir el firmante registrado. Usar otro navegador o un perfil nuevo para el alta/aprobación o recuperación explícita, sin borrar las claves antiguas; la guía no reemplaza un dispositivo dentro del perfil que conserva sus registros anteriores. Conservar la copia offline cifrada en un lugar protegido y separado; no adjuntarla a tickets ni capturas. Revocar no elimina información o claves copiadas antes: ante compromiso, evaluar y ejecutar una rotación autorizada separada.

Para rollback de esta versión, no volver silenciosamente al API anterior que aceptaba la cookie del dispositivo revocado. Mantener la protección del servidor o suspender el módulo mientras se prepara una corrección compatible. No eliminar tablas, grants, claves ni ciphertext para forzar una vuelta. El origen, los artefactos y las pruebas deben volver a verificarse antes de reabrir el módulo.

El servicio tenancy recibió grants aditivos mínimos de su rol NOLOGIN en las dos bases originales, verificados con negativas de acceso a contraseñas, credenciales, escritura de usuarios/actividades y borrado de auditoría. No cambió ninguna credencial o cargo real. Ver `premium-runtime-credentials.md`; no usar este helper local acotado para provisionar permisos en producción.

La outbox de operaciones departamentales agrega una tabla y un índice propios por base, mediante `scripts/apply-premium-department-outbox.ts --apply`. Se verificó la ACL del dominio ya existente; no se agregaron grants cross-service, datos de negocio ni mensajes. No ejecutar como sustituto de un plan de migración productivo.

La continuación agregó una tabla/índice de outbox de recuperación de contraseña por base original, y una tabla/dos índices de conciliación de configuración en control. Sus helpers `apply-premium-password-reset-outbox.ts` y `apply-premium-tenant-settings-reconciliation.ts` son de consulta por defecto/`--check`, con `--apply` explícito y guardas locales de destinos exactos. Evidencia en `premium-evidence/2026-10-01/additive-recovery-schema.json`: cero DML de negocio, nuevos grants, cambios de secretos/cargos o mensajes QA. No ejecutar estos helpers locales en producción ni como full-migrate.

## Intenciones pendientes y resultados inciertos

En Alertas, la recuperación administrativa separa Calendario, Departamentos e Identidad. Se requiere `users.manage`, razón y confirmación auditadas; cada retry conserva el ID. Identidad muestra solo metadata, vencimiento y causa de retiro: un token usado/vencido o una cuenta inactiva no pueden reprogramarse. El worker inicia después de preparar pools y vuelve a intentar intenciones válidas con lease/fencing. No copiar ciphertext, enlaces de recuperación o datos del destinatario a logs. Aceptación interna/reprogramación no significan entrega de correo o WhatsApp.

Las actualizaciones de configuración tenant aceptan intención durable y receipt de etapa. Una respuesta 503 PENDING no significa que nada se guardó: conservar su operationId y la misma clave idempotente, consultar el estado y reintentar exactamente el mismo contenido. 200 requiere la finalización confirmada. Un conflicto 409 o cambio independiente posterior de Calendar no se resuelve con sobrescritura ciega: revisar versión/estado y presentar una nueva intención explícita con expectedVersion y nueva clave. No modificar tablas a mano ni repetir una auditoría para fabricar coherencia. La UX completa de resolución operativa y sus pruebas staging permanecen pendientes.

Para rollback: detener escrituras, preservar backup verificado y el artefacto anterior, comparar contratos y leer el plan de migraciones. Nunca restaurar ciegamente una función anterior después de que se hayan utilizado roles nuevos; revisar sus precondiciones y los datos actuales. No borrar columnas aditivas ni datos para facilitar la vuelta. Revertir solamente cambios atribuibles a esta ejecución, preservando cambios previos del usuario. En GestionChurch no se encontró repositorio Git: se necesita un snapshot de entrega/artefactos bajo control del operador antes de un despliegue real.

## Respaldo y recuperación

Seguir `backup-restore.md`. PowerShell 7 y passphrase inyectada son obligatorios. El manifiesto v3 está autenticado; todos los archivos se verifican antes del primer reemplazo. Los comandos PostgreSQL reciben credenciales mediante entorno hijo, no como URL en argumentos de proceso. Los objetos previos se conservan en una ruta de recuperación identificada.

El operador debe detener escrituras y coordinar bases/objetos/custodia: el script no implementa una transacción entre varias bases. `-TenantSlug` no convierte el control completo en un importador entre iglesias. Las ACL/grants productivas y logins no se acreditan por una restauración local usando el plano administrativo; comprobarlas de nuevo antes de abrir runtime. Registrar integridad, acceso autorizado, negativa de otro tenant y apertura del mismo contenido histórico después de recuperar.

## Verificación segura reproducible

No ejecutar suites históricas que usan Central/Ozama. Las suites nuevas son opt-in, usan UUIDs propios y validan propiedad al limpiar. Leer cada destino/efecto antes de ejecutar.

```powershell
pnpm exec vitest run tests/unit
pnpm typecheck
pnpm lint
pnpm validate:openapi
pnpm audit --prod
pnpm build
pnpm exec playwright test --config=playwright.premium.config.ts
```

Los tests HTTP exigen primero readiness. Los comandos/flags específicos y sus resultados se registran en el índice de evidencia y el informe de entrega. Los totales unit/API/browser son conjuntos distintos; las repeticiones, imports y snapshots no son casos nuevos. Un scanner, build o recorrido feliz no aprueba por sí solo R01–R36.
