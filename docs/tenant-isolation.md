# Aislamiento multi-tenant

## Garantías implementadas

1. Cada tenant tiene una base PostgreSQL física independiente.
2. El JWT contiene `tenantId` y `tenantSlug` firmados; el cliente no decide el tenant para una ruta autenticada.
3. El registro de base vive exclusivamente en el plano global.
4. Los nombres de base derivan de UUID y pasan por una expresión regular antes de formar una conexión.
5. Los pools están indexados por tenant validado y tienen límite/LRU.
6. Archivos se guardan bajo un directorio de tenant no elegido por el cliente.
7. Las descargas buscan el ID exclusivamente en la base del tenant autenticado.
8. El administrador global no puede abrir contenido de un tenant mediante su sesión global.
9. Cada microservicio activa un rol PostgreSQL distinto; los grants cruzados necesarios son de solo lectura y las escrituras permanecen bajo el esquema propietario.
10. En producción, los pools de runtime rechazan logins administrativos y conexiones sin TLS. El login de tenant solo puede pertenecer al rol de su servicio; las credenciales de migración/provisionamiento no deben reutilizarse como credenciales de runtime.

El entorno local sigue usando su clúster aislado y sus credenciales de desarrollo. Para producción se deben suministrar logins distintos por servicio, sin `SUPERUSER`, `CREATEDB`, `CREATEROLE` ni `BYPASSRLS`, con permisos mínimos en el plano de control y en las bases autorizadas. El certificado de PostgreSQL debe verificarse (`verify-full`, CA confiable). Las comprobaciones de runtime no sustituyen la configuración de `pg_hba.conf`, firewall, permisos `CONNECT` por base ni la custodia de secretos. El aislamiento ante una ejecución arbitraria dentro de un servicio exige además segmentación y credenciales por tenant según el modelo de despliegue.

## Matriz de hardening antes de producción

- usar cookie de tenant A con UUID de actividad/archivo de B;
- cambiar el host manteniendo la cookie;
- repetir una idempotency key en dos tenants;
- inyectar `x-tenant-id` desde el navegador;
- reciclar un pool y comprobar que no conserva contexto;
- restaurar solo una base de tenant.

`tests/integration/tenant-isolation.test.ts` provisiona una segunda base real en cada ejecución, escribe un marcador exclusivo y demuestra que no aparece en la base central; además verifica esquemas, GiST, constraints, deduplicación outbox/inbox, auditoría inmutable y denegaciones reales entre roles de servicio. Después elimina únicamente la base generada. El test E2E demuestra que el contexto proviene de una cookie firmada. Los intentos cruzados por cada ruta y los hosts wildcard reales deben repetirse en el entorno productivo bajo TLS antes de habilitar tenants externos.
