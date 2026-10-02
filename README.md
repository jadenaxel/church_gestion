# GestionChurch

Primera etapa operativa de GestionChurch: calendario multi-tenant para coordinar actividades de los departamentos de una iglesia, anticipar conflictos y registrar excepciones aprobadas por una junta de revisión.

## Estado actual

El recorrido principal está implementado de extremo a extremo:

- autenticación y sesiones HttpOnly;
- administración global y provisionamiento de tenants;
- una base PostgreSQL independiente por tenant;
- departamentos, lugares, actividades y varias fechas propuestas;
- reservas provisionales y confirmadas;
- detección transaccional de solapamientos mediante `tstzrange` e índices GiST;
- solicitudes de revisión, sesiones de junta con convocatorias/RSVP/asistencia/actas y autorización auditada de coexistencia;
- biblioteca ministerial por departamento con programas y documentos, versionado, buscador, visor interno, firma, hash, cuarentena, visibilidad y control de acceso;
- declaración y revisión humana auditable de la alineación de cada material con el plan anual, Manual de Iglesia o guía departamental correspondiente;
- notificaciones in-app, preferencias, recordatorios y adaptadores de correo/WhatsApp;
- dashboard, calendario, agenda, equipo, juntas de revisión y exportación iCalendar/CSV/PDF;
- módulo de Ancianos con cobertura anual por departamento, generador automático de turnos para el Primer Anciano, agenda personal, programas de culto, fotografías y enlace informativo al calendario sin conflictos artificiales;
- espacios de trabajo departamentales con planes, objetivos, programas, calendario, presupuestos, tareas, reuniones, acuerdos, capacidades ministeriales, colaboración, KPI, pronósticos y reportes PDF/CSV;
- interfaz mobile-first, accesible y completamente disponible en español, inglés y francés;
- módulo federado de Nombramientos con inicio de sesión único, tenant físico enlazado, roles sincronizados y revocación en vivo.

## Requisitos

- Node.js 24 LTS o superior compatible;
- pnpm 11 o superior;
- PostgreSQL 18.

En Windows, `pnpm db:bootstrap` utiliza la instalación de PostgreSQL 18 ubicada en `C:\Program Files\PostgreSQL\18\bin` y crea un clúster aislado dentro de `.local/postgres` en el puerto `55432`. No modifica el clúster PostgreSQL del sistema. Puede cambiar la ruta mediante `POSTGRES_BIN`.

En otros entornos puede levantar PostgreSQL y las dependencias con `docker compose up -d` y ajustar `.env`.

El despliegue integral se construye con `docker compose up --build`: crea contenedores independientes para cada microservicio y para Web, además de PostgreSQL, Redis, NATS JetStream, MinIO, ClamAV, Mailpit y Jaeger/OpenTelemetry. En la estación actual Docker no está instalado; el archivo Compose sí está validado sintácticamente y la ejecución nativa es la usada por la suite.

## Inicio rápido

### Stack completo (recomendado)

En Windows, ejecute `start-gestionchurch.cmd` con doble clic o desde PowerShell:

```powershell
.\start-gestionchurch.ps1
```

El lanzador detecta automáticamente el entorno y espera hasta que Gateway y Web
estén saludables:

- al abrirlo con doble clic, cambia automáticamente a la carpeta del proyecto;
- localiza Node.js 24 y pnpm 11 tanto en `PATH` como en ubicaciones estándar de
  Windows y en el runtime local de Codex;
- muestra las versiones y rutas exactas seleccionadas antes de iniciar;
- no instala otra copia de Node.js, pnpm ni PostgreSQL.

- con Docker, construye e inicia PostgreSQL, Redis, NATS JetStream, MinIO, ClamAV,
  Mailpit, Jaeger, todos los microservicios y la interfaz;
- sin Docker, instala/verifica los paquetes de Node, inicia el PostgreSQL aislado del
  proyecto, ejecuta migraciones, genera builds estables de producción y levanta
  los servicios en segundo plano. Los componentes externos usan sus adaptadores
  locales/degradados previstos. El launcher no usa Turbopack/HMR para evitar que una
  caché antigua del navegador invalide los módulos del dashboard.

El modo nativo también prepara, sincroniza y levanta Nombramientos desde
`X:\CODE\NOMBRAMIENTOS`. En este modo el estado sólo se declara **ARRIBA** cuando
Web, Gateway, PostgreSQL, Web/API de Nombramientos y su worker durable están
saludables. La composición Docker existente aún corresponde al stack base de
GestionChurch y no es la ruta validada para ejecutar el módulo federado.

Ninguno de los dos modos instala o modifica el servicio PostgreSQL de Windows.

```powershell
.\start-gestionchurch.ps1 -Action Status
.\start-gestionchurch.ps1 -Action Logs
.\start-gestionchurch.ps1 -Action Restart
.\start-gestionchurch.ps1 -Action Stop
.\start-gestionchurch.ps1 -Mode Docker
.\start-gestionchurch.ps1 -Mode Native
.\start-gestionchurch.ps1 -Mode Native -SeedDemo
.\start-gestionchurch.ps1 -Mode Native -SkipDataSetup -NoBuild
```

El seed demostrativo ahora requiere `-SeedDemo` explícito; permanece disponible,
pero un reinicio habitual no vuelve a insertar ni modificar datos demostrativos.
Para verificación/recuperación de una instalación ya preparada,
`-SkipDataSetup` inicia el clúster existente sin migrar, sembrar ni sincronizar
cargos/tenants de Nombramientos. Requiere esquema y configuración ya preparados;
`-NoBuild` reutiliza un build existente y falla si falta. No use estos flags para
ocultar migraciones pendientes en un despliegue nuevo. Son opciones nativas.

Los datos se conservan al detener o reiniciar. Use `-OpenBrowser` para abrir la
aplicación automáticamente, `-FollowLogs` para seguir los logs después del inicio,
`-Pull` para actualizar imágenes o `-NoBuild` para reutilizar la imagen ya construida.

El modo `Auto` es el predeterminado. Para forzar el stack integral se requiere Docker
Desktop con Docker Compose v2. El script no instala Docker ni software global.
`start-gestionchurch.cmd` abre el navegador al completar y conserva la ventana si se
produce un error, para que el diagnóstico no desaparezca.

### Desarrollo nativo reducido

```bash
pnpm install
pnpm db:setup
pnpm dev
```

Abrir:

- aplicación: `http://localhost:3000`
- API Gateway: `http://localhost:4000`
- documentación OpenAPI: `http://localhost:4000/api/docs`
- health check: `http://localhost:4000/health/live`
- administración global: `http://localhost:3000/global/login`
- módulo Nombramientos: se abre desde el menú interno de GestionChurch; no use un login separado

### Usuarios de demostración

| Alcance | Usuario | Contraseña | Uso |
|---|---|---|---|
| Tenant `central` | `admin@central.local` | `GestionChurch!2026` | Administración y planificación |
| Tenant `central` | `secretaria@central.local` | `Revision!2026` | Resolución de conflictos |
| Tenant `central` | `jovenes@central.local` | `Actividad!2026` | Dirección departamental |
| Tenant `central` | `infantil@central.local` | `Actividad!2026` | Segundo liderazgo departamental |
| Tenant `central` | `primeranciano@central.local` | `Actividad!2026` | Primer anciano y programación anual |
| Tenant `central` | `anciano@central.local` | `Actividad!2026` | Agenda personal de anciano |
| Global | `global@gestionchurch.local` | `GestionChurch!2026` | Provisionamiento de tenants |

Estas credenciales existen solo en el seed local. No deben utilizarse en producción.

## Comandos

```bash
pnpm typecheck       # TypeScript de servicios y web
pnpm lint            # análisis estático con Biome
pnpm test            # unitarias + integración API E2E
pnpm test:e2e        # recorrido de concurrencia y revisión
pnpm test:browser    # Chromium desktop + móvil 360 px + axe WCAG
pnpm validate:openapi # valida las 147 rutas del contrato público
pnpm build           # servicios + build de producción de Next.js
pnpm db:migrate      # migraciones globales y por tenant
pnpm db:seed         # datos locales idempotentes
pnpm generate:sbom   # CycloneDX 1.7 de la versión
```

## Servicios

| Servicio | Puerto | Responsabilidad |
|---|---:|---|
| API Gateway | 4000 | Entrada única, CORS, routing y correlation ID |
| Identity | 4011 | Usuarios, roles, sesiones y login |
| Tenant | 4012 | Plano global y provisionamiento físico |
| Calendar | 4013 | Actividades, reservas, conflictos y decisiones |
| File | 4014 | Biblioteca departamental, visor seguro, alineación, almacenamiento y descarga |
| Notification | 4015 | Alertas in-app, correo y WhatsApp |
| Reports | 4016 | Analítica del tenant, reportes ejecutivos y exportaciones |
| Elders | 4017 | Turnos, agenda de culto y enlace con Publicidad/Adoración |
| Personal Ministries | 4018 | Iniciativas misioneras, estudios, campañas, equipos y presupuesto |
| Women's Ministry | 4019 | Planificación, retiro, roster, participación y cumpleaños |
| Department Operations | 4020 | Espacios de trabajo, planes, iniciativas, tareas, presupuesto, gobierno y capacidades por ministerio |
| Web | 3000 | Interfaz Next.js mobile-first |
| Nombramientos Web | 3300 | Módulo federado, accesible sólo desde GestionChurch |
| Nombramientos API | 4100 | Sesión federada, roles y procesos de nombramiento |

## Acceso al módulo Nombramientos

El acceso se concede automáticamente a `GLOBAL_ADMIN`, `TENANT_ADMIN` y
`BOARD_SECRETARY`. El perfil asignable **Comisión de nombramientos** agrega el rol
`NOMINATIONS_USER` a usuarios autorizados. El Global Admin selecciona el tenant antes
de abrirlo; los demás usuarios permanecen limitados a su tenant activo. Los códigos de
lanzamiento son de un solo uso, expiran en 60 segundos y la API revalida cuenta, tenant
y roles en cada petición. El login y el MFA propios de la aplicación original no están
disponibles en este modo; el 2FA futuro se implementará para toda la solución.

Los servicios escuchan en `127.0.0.1` durante desarrollo; el navegador solo usa el Gateway.

## Correo y WhatsApp

El centro de notificaciones siempre persiste alertas in-app. El correo usa SMTP real cuando `SMTP_HOST` está disponible; Docker Compose incluye Mailpit en `http://localhost:58025`. Desde **Configuración → Canales**, administración puede validar DNS/TLS/autenticación y luego confirmar una entrega real, con resultados separados y auditados.

WhatsApp permanece desactivado por defecto y cualquier simulación local se identifica como tal en la base; nunca se presenta como una entrega real. Para activar **Producción real** se necesitan una cuenta de Meta, número, token, App Secret, plantilla aprobada, consentimiento y `PUBLIC_API_URL` HTTPS pública. La consola valida directamente el número con Meta antes de habilitar la prueba de entrega. Consulte [notification-providers.md](docs/notification-providers.md).

## Identidad visual

La interfaz usa la familia `Advent Sans` cuando el archivo oficial autorizado está presente en `apps/web/public/fonts/AdventSans-Logo.otf`, con fallback de sistema. El activo no se redistribuye automáticamente porque el sitio oficial bloqueó la descarga automatizada y su uso institucional debe validarse. No se incluye ni altera el símbolo registrado de la Iglesia.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Arquitectura de espacios departamentales](docs/department-operations-architecture.md)
- [API](docs/api.md)
- [Eventos](docs/events.md)
- [Aislamiento multi-tenant](docs/tenant-isolation.md)
- [Seguridad](docs/security-threat-model.md)
- [Trazabilidad con el Manual](docs/manual-traceability.md)
- [Operación](docs/operations.md)
- [Archivos](docs/file-security.md)
- [Accesibilidad](docs/accessibility.md)
- [Backup y restauración](docs/backup-restore.md)
- [Rendimiento](docs/performance.md)
- [Lista de salida](docs/release-checklist.md)

## Decisiones y dependencias externas de producción

- MFA/2FA está planificado para una etapa posterior; todavía no está habilitado.
- El modo Docker usa MinIO/S3 y ClamAV; el modo nativo puede usar almacenamiento local y firma EICAR si esas dependencias no están levantadas.
- SMTP y WhatsApp están implementados con validación real de proveedor. La entrega externa requiere las credenciales del operador; `CONFIG_ENCRYPTION_KEY` es obligatoria en producción y WhatsApp exige un webhook HTTPS público.
- El rate limiting distribuido usa Redis cuando se configura y tiene una protección local degradada. El outbox publica en NATS JetStream cuando `NATS_URL` está configurado; sin NATS usa entrega HTTP interna idempotente como modo degradado local.
- Los backups generados por `scripts/backup.ps1` requieren `GC_BACKUP_PASSPHRASE`, se verifican y se cifran con AES-256-GCM antes de quedar en disco.
- La telemetría de producción debe conectarse al proveedor observacional elegido por el operador.
- La matriz denominacional requiere validación humana por la autoridad eclesiástica correspondiente.
- TLS, DNS wildcard, secretos y política de retención deben configurarse en el proveedor de hosting elegido.
