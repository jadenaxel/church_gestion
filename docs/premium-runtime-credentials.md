# Credenciales de runtime por iglesia y servicio

El modo local de desarrollo mantiene su conexión existente. En `NODE_ENV=production` ya no se permite el fallback compartido `TENANT_DATABASE_USER`: cada servicio debe recibir `GC_TENANT_CREDENTIALS_FILE`, un archivo privado inyectado por el gestor de secretos. No se han creado ni rotado credenciales de iglesias reales.

## Contrato del archivo

JSON versión 1, colección `tenants`. Cada entrada contiene `tenantId`, `databaseName`, `serviceRole`, `username`, `password`, `host`, `port` y `caFile`. El ID y la base deben corresponder exactamente: `gc_tenant_<UUID con guiones bajos>`. El login debe llamarse `gcr_<UUID sin guiones>_<dominio>`; ejemplo de dominio: `calendar` para `gc_calendar_service`. La contraseña debe ser aleatoria y tener al menos 32 caracteres. No se incluyen ejemplos con contraseñas utilizables.

Cada archivo corresponde a **un solo servicio**, con los tenants autorizados para ese servicio. No montar todas las credenciales de todos los dominios en cada proceso. El archivo y la CA se montan solo lectura, fuera del repositorio/imagen, con ACL mínima. `ssl.rejectUnauthorized=true` es obligatorio. La CA debe ser real y el certificado del servidor válido para el host. Cambiar la credencial cambia la identidad del pool; los hashes de esa identidad no se exponen en logs ni APIs.

## Preparación del servidor, a cargo del operador

- Crear logins distintos por par tenant/servicio, sin superusuario, CREATEDB, CREATEROLE o BYPASSRLS.
- Conceder al login únicamente su rol de dominio vigente. No conceder propietario ni un segundo rol de servicio.
- Revocar CONNECT de PUBLIC en cada base tenant y conceder CONNECT únicamente a sus logins autorizados y al plano administrativo separado. Comprobar las membresías heredadas: una concesión indirecta también puede habilitar CONNECT.
- Mantener provisioning/migración/backup separados del runtime. El control tiene su propio login mínimo, TLS y secreto inyectado.
- Restringir redes y `pg_hba.conf`, usar autenticación SCRAM, certificados verificados y rotación coordinada. No usar el cluster local con trust como producción.

Este documento **no aplica automáticamente esos cambios** sobre bases o roles reales. El despliegue exige revisarlos y ensayarlos en staging, incluida recuperación y rollback. Un archivo de configuración correcto no prueba por sí solo las ACL del servidor.

## Servicio de tenancy y provisionamiento

`gc_tenant_service` es un rol NOLOGIN independiente. Solo lee las columnas de identidad necesarias para validar sesión/actor, lee la configuración de calendario, actualiza su zona horaria y agrega/consulta auditoría. No lee contraseñas/credenciales ni escribe usuarios, actividades o auditorías existentes. Su login runtime canónico es `gcr_<UUID sin guiones>_tenant` y mantiene la misma exigencia de archivo monodominio y TLS verificado.

Crear una iglesia usa un pool administrativo separado, de vida corta, para una base UUID nueva cuya identidad ya fue verificada; se cierra incluso si falla el bootstrap. Nunca se almacena como pool runtime ni sirve como fallback productivo. En producción `POSTGRES_ADMIN_URL` debe estar explícitamente configurada para el plano de provisionamiento.

En esta ejecución se aplicaron únicamente los grants aditivos mínimos del rol a las **dos bases originales** mediante `scripts/apply-premium-tenant-runtime-grants.ts --apply`, después de preflight read-only y negativas de privilegios. No se crearon logins, contraseñas, membresías de personas ni entradas de secret-store para iglesias reales. El helper rechaza destinos distintos o fixtures activos; no es un instalador productivo general.

El provisionamiento no distribuye por sí solo credenciales a los diez servicios. Antes de aceptar una nueva iglesia en producción, el operador debe preparar y comprobar esas credenciales y CONNECT ACL en todos los dominios. `ACTIVE` del bootstrap no certifica esa preparación, ni readiness de todos los tenants. Esta dependencia productiva sigue abierta: el runtime falla cerrado si falta la entrada autorizada.

## Evidencia y límite

`tests/unit/runtime-credentials.test.ts` comprueba fail-closed productivo, correspondencia tenant/base/login, rol único, TLS verificable y renovación del pool. `RUN_PREMIUM_RUNTIME_ISOLATION_TESTS=1 pnpm exec vitest run tests/integration/premium-runtime-isolation.test.ts` crea dos bases y dos logins propios, prueba que A no conecta B ni B conecta A y niega lectura de credenciales de identidad. Limpia únicamente esos destinos.

El ensayo ACL local usa el PostgreSQL existente con autenticación trust, **no prueba password/SCRAM ni TLS productivo**. R31 continúa parcial hasta repetir con credenciales y redes reales en staging productivo autorizado. No sustituye la evaluación independiente.

`tests/unit/tenant-runtime-boundary.test.ts` y `tests/integration/premium-tenant-runtime-db.test.ts` añaden negativas sobre el rol tenancy, bootstrap nuevo exacto y ausencia de privilegios administrativos/de otros dominios. El array PostgreSQL de roles se convierte explícitamente a `text[]` para que el guard no dependa de un `name[]` serializado como string.
