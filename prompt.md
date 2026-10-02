# Prompt maestro de implementación — GestionChurch

## Etapa 1: Core de calendario y coordinación de actividades

Actúa como un equipo sénior compuesto por arquitectura de software, ingeniería backend y frontend, seguridad, DevOps, QA, diseño de producto y UX móvil. Tu misión es diseñar, implementar, probar y documentar la primera etapa completamente funcional de **GestionChurch**, una plataforma SaaS multi-tenant para la gestión integral de iglesias Adventistas del Séptimo Día, cuyo dominio de producción será `gestionchurch.com`.

No entregues únicamente una propuesta, prototipo visual, wireframe, pseudocódigo o conjunto de archivos vacíos. Construye software ejecutable de extremo a extremo. Cuando una decisión menor no esté especificada, adopta la opción más segura, mantenible y sencilla, documenta la decisión y continúa. Solo detente si falta una credencial externa, una autorización legal o una decisión de negocio que haga imposible continuar de forma segura.

La etapa 1 se concentra exclusivamente en el **Core de calendario de actividades entre departamentos**. Debe quedar preparada una base arquitectónica real para añadir posteriormente mayordomía, tesorería, secretaría, ancianos, presentación de niños y otros módulos sin convertir el sistema en un monolito distribuido.

---

## 1. Visión del producto

GestionChurch debe permitir que una iglesia coordine toda su programación departamental desde un único lugar, evite choques de fechas y horarios, gestione excepciones mediante una junta de revisión, adjunte el programa de cada actividad y notifique oportunamente a los responsables.

El producto debe sentirse:

- espiritual e institucionalmente respetuoso;
- moderno, confiable, claro y acogedor;
- extraordinariamente fácil de usar desde un teléfono celular;
- visualmente sobrio, elegante y de alta calidad;
- rápido aun con conexiones móviles modestas;
- accesible para usuarios con distintos niveles de experiencia digital.

El término “ultra premium” significa excelente jerarquía visual, interacciones fluidas, estados vacíos útiles, mensajes claros, datos legibles, gráficos con propósito, accesibilidad, consistencia y cero pantallas rotas. No significa saturar la interfaz con efectos, degradados, animaciones o gráficos decorativos.

---

## 2. Resultado obligatorio de esta etapa

Al finalizar, una iglesia debe poder completar sin intervención técnica el siguiente recorrido:

1. Un administrador global crea y provisiona un tenant.
2. El administrador del tenant configura la iglesia, su zona horaria, departamentos, usuarios, roles, lugares y recursos.
3. Un director o planificador departamental inicia sesión desde el celular.
4. Crea un borrador de actividad mediante una plantilla guiada.
5. Define una o varias opciones de fecha, cada una con uno o varios bloques de horario, responsable, lugar y recursos.
6. Adjunta el programa de la actividad en Word, PDF, Excel, PowerPoint u otro formato permitido y seguro.
7. El sistema muestra disponibilidad y choques en tiempo real mientras se completa el formulario.
8. Al enviar, el servidor vuelve a validar de manera transaccional; la validación del navegador nunca es la autoridad final.
9. Si no hay choque, la fecha queda reservada provisionalmente y entra al flujo de aprobación.
10. Si hay choque, el usuario puede elegir otra propuesta, guardar el borrador o enviar una solicitud de revisión justificando por qué las actividades pueden coexistir.
11. La junta de revisión visualiza todos los casos pendientes, riesgos, recursos afectados, alternativas y antecedentes.
12. El secretario autorizado registra la decisión: aprobar una alternativa, autorizar coexistencia, solicitar cambios o rechazar.
13. Todas las partes reciben notificaciones dentro de la aplicación y, según configuración, por correo y WhatsApp.
14. La actividad aprobada aparece en el calendario oficial, el dashboard, las exportaciones y los recordatorios.
15. Todo cambio relevante queda en una auditoría inmutable y comprensible.

La solución no se considera terminada si el “happy path” funciona pero fallan los choques concurrentes, el aislamiento entre tenants, la autorización por rol, los archivos, los reintentos de alertas o el uso móvil.

---

## 3. Alcance funcional

### 3.1 Incluido en la etapa 1

- autenticación segura con correo y contraseña;
- recuperación y cambio de contraseña;
- sesiones seguras, cierre de sesión y revocación;
- administración global de tenants;
- provisionamiento de una base de datos independiente por tenant;
- administración de la iglesia, usuarios, roles y permisos del tenant;
- catálogo básico y configurable de departamentos;
- catálogo de lugares y recursos reservables;
- calendario mensual, semanal, diario, agenda y lista;
- formulario/plantilla para crear y editar actividades;
- múltiples opciones de fecha para una actividad;
- actividades de una sola sesión, varias sesiones y recurrencias controladas;
- disponibilidad visual y detección robusta de conflictos;
- reservas provisionales y confirmadas;
- solicitudes de excepción por conflicto;
- bandeja y sesiones de junta de revisión;
- resolución autorizada de coexistencia;
- aprobación, rechazo, solicitud de cambios, reprogramación y cancelación;
- adjuntos y versiones del programa de cada actividad;
- centro de notificaciones dentro de la aplicación;
- envío de correo mediante SMTP;
- integración preparada y funcional con Meta WhatsApp Cloud API al proporcionar credenciales válidas;
- recordatorios configurables;
- dashboard ejecutivo con indicadores y gráficos útiles;
- exportación `.ics` de actividad y calendario filtrado;
- exportación operativa a CSV y vista imprimible/PDF de la agenda de revisión;
- búsqueda, filtros y vistas guardadas esenciales;
- bitácora de auditoría;
- observabilidad, respaldos documentados, pruebas y documentación operativa;
- experiencia responsive y mobile-first;
- interfaz visible en español con infraestructura de internacionalización lista para inglés y francés.

### 3.2 Fuera de alcance por ahora

No implementar todavía la lógica de negocio de:

- tesorería;
- mayordomía;
- secretaría general o membresía;
- ancianos;
- presentación de niños;
- nombramientos;
- inventario general;
- contabilidad;
- pagos;
- sitio público completo;
- aplicación móvil nativa;
- sincronización bidireccional con Google Calendar, Outlook u otros calendarios;
- inicio de sesión social o SSO;
- autenticación de dos factores.

No crear módulos vacíos para aparentar que estas áreas existen. Solo define contratos, convenciones y puntos de extensión documentados para integrarlas como microservicios reales en etapas futuras.

### 3.3 Autenticación de dos factores

La aplicación **sí usará MFA/2FA en una etapa posterior**, preferentemente WebAuthn/passkeys y TOTP con códigos de recuperación. En la etapa 1:

- no mostrar controles de MFA que todavía no funcionen;
- no habilitar endpoints incompletos;
- dejar una arquitectura de autenticación extensible, eventos de seguridad y campos/migraciones futuras documentadas, sin almacenar secretos ficticios;
- registrar esta decisión en un ADR y en el backlog de seguridad;
- no describir el producto como si ya tuviera MFA.

---

## 4. Alineación con la Iglesia Adventista del Séptimo Día

El sistema debe alinearse con la edición oficial vigente del **Manual de la Iglesia Adventista del Séptimo Día**, 21.ª edición revisada en 2025, y con las orientaciones oficiales aplicables de la Asociación General y la asociación/misión local.

Fuentes oficiales iniciales:

- Manual y recursos de Secretaría: `https://secretariat.adventist.org/resources`
- Manual vigente: `https://gc.adventist.org/church-manual/`
- Sistema oficial de identidad: `https://www.adventist.design/`
- Recursos de identidad: `https://www.adventist.design/downloads/`

Reglas obligatorias:

1. No inventes doctrina, cargos, atribuciones, procesos de votación ni autoridad eclesiástica.
2. No conviertas una inferencia técnica en una supuesta regla de la Iglesia.
3. Crea `docs/manual-traceability.md` con una matriz que relacione cada regla eclesiástica usada por el producto con edición, capítulo/sección, página si aplica, fuente, interpretación funcional y fecha de verificación.
4. Toda regla que no se encuentre expresamente en el Manual debe marcarse como **configuración operativa local**, no como política denominacional.
5. Los nombres de cargos y departamentos deben ser configurables, porque pueden variar por territorio e idioma.
6. Un revisor eclesiástico designado debe validar la matriz antes de declarar cumplimiento denominacional. El software no debe afirmar por sí solo “cumplimiento 100 %” sin esa revisión humana.
7. Si una configuración local contradice una norma oficial confirmada, muestra una advertencia y exige revisión administrativa; no bloquees basándote en interpretaciones no verificadas.
8. Conserva historial de la versión del Manual utilizada para cada regla configurable.

Para el flujo específico de calendario, la aplicación debe distinguir claramente entre una recomendación del sistema, una decisión administrativa local y una decisión oficialmente registrada por la junta.

---

## 5. Identidad visual y experiencia de usuario

### 5.1 Dirección visual

Usa como referencia conceptual la claridad y línea de producto de `nombramientos.com`, sin copiar código, textos, componentes, ilustraciones ni recursos protegidos. Antes de implementar, inspecciona esa referencia si está disponible y documenta únicamente patrones generales reutilizables. Si no está disponible, continúa con el sistema oficial adventista y no inventes que fue inspeccionada.

Respeta el sistema de identidad visual oficial de la Iglesia Adventista:

- usa la familia **Advent Sans** obtenida de una fuente oficial y conserva su licencia OFL;
- usa Advent Sans en marca, encabezados y elementos donde tenga buena legibilidad;
- para texto de interfaz extenso puede utilizarse una tipografía secundaria altamente legible y compatible con las guías oficiales;
- conserva el espacio, proporciones, color sólido y composición oficial del símbolo;
- no redibujes, deformes, animes, combines ni alteres el símbolo adventista;
- no uses el símbolo registrado ni un lockup oficial en producción sin confirmar que la iglesia/entidad tiene autorización;
- durante desarrollo utiliza un marcador de marca claramente reemplazable si aún no se suministraron los activos autorizados;
- implementa la “Sabbath column” solo si puede hacerse conforme a la guía oficial y sin perjudicar el espacio útil en móvil.

Define tokens semánticos para color, tipografía, espacio, radios, sombras, elevación, movimiento y estados. La paleta debe transmitir confianza y calidez, tener contraste WCAG y poder personalizarse moderadamente por tenant sin romper la identidad.

### 5.2 Requisitos mobile-first

Diseña primero para anchos de 360–430 px y después para tablet y escritorio.

- navegación inferior o equivalente ergonómica para las acciones principales en móvil;
- objetivos táctiles mínimos de 44 × 44 px;
- formularios en pasos cortos, con guardado automático de borrador;
- selector de fecha/hora optimizado para tacto;
- resumen fijo antes de enviar;
- conflictos visibles sin depender solo del color;
- tablas transformadas en tarjetas o listas útiles en móvil;
- acciones críticas con confirmación y explicación de consecuencias;
- skeletons, estados vacíos, carga, error, sin conexión y reintento;
- no permitir pérdida silenciosa de un formulario ante navegación o caída de red;
- no implementar mutaciones offline en esta etapa; si se usa PWA, el modo offline será informativo o de lectura segura.

### 5.3 Accesibilidad y calidad percibida

- WCAG 2.2 nivel AA;
- navegación completa por teclado;
- foco visible y orden lógico;
- etiquetas, descripciones y errores asociados al campo correcto;
- contraste suficiente en todos los estados;
- compatibilidad con lectores de pantalla;
- respeto de `prefers-reduced-motion`;
- lenguaje sencillo y respetuoso en español;
- fechas, horas, números y zona horaria siempre explícitos cuando exista riesgo de confusión;
- componentes consistentes, sin botones duplicados ni acciones ambiguas.

### 5.4 Dashboard premium

El dashboard debe priorizar decisiones, no decoración. Incluye:

- próximas actividades aprobadas;
- solicitudes pendientes;
- conflictos abiertos por severidad;
- actividades por estado;
- distribución por departamento;
- ocupación por semana/mes;
- tendencia de choques y tiempo promedio de resolución;
- recordatorios que requieren atención;
- accesos rápidos contextuales según permiso.

Cada gráfico debe tener título claro, periodo, leyenda accesible, valores consultables, estado vacío y alternativa tabular. Nunca uses gráficos 3D. En móvil, evita paneles que obliguen a desplazamiento horizontal.

---

## 6. Idioma e internacionalización

En la etapa 1, todo el contenido visible al usuario debe estar terminado en **español**, que será el idioma predeterminado.

La arquitectura debe quedar preparada desde el primer commit para español (`es`), inglés (`en`) y francés (`fr`):

- no escribir textos visibles directamente dentro de componentes;
- usar claves tipadas y catálogos por dominio;
- aplicar ICU MessageFormat o una solución equivalente para plurales, género cuando corresponda, fechas y números;
- separar texto de interfaz, plantillas de correo, WhatsApp, errores de API y documentos;
- almacenar fechas en UTC y mostrarlas en la zona horaria IANA del tenant/usuario;
- conservar nombres propios y datos introducidos por el usuario sin “traducirlos” automáticamente.

No habilites el selector de inglés o francés hasta que sus catálogos estén completos y revisados. Es preferible ofrecer un español completo que traducciones parciales engañosas.

---

## 7. Arquitectura obligatoria

### 7.1 Principios

- monorepo para facilitar desarrollo, contratos y automatización, sin sacrificar despliegue independiente;
- microservicios reales con procesos, contenedores, pipelines, health checks y límites de datos independientes;
- ninguna comunicación del navegador directamente a un microservicio interno;
- todo tráfico de usuario entra por el API Gateway;
- comunicación síncrona mínima y eventos asíncronos para efectos secundarios;
- contratos versionados y compatibilidad hacia atrás;
- propiedad clara de datos por servicio;
- patrón transactional outbox/inbox para no perder eventos;
- idempotencia en comandos, consumidores, webhooks y notificaciones;
- arquitectura modular que evite dependencias circulares;
- no introducir Kubernetes en desarrollo local; contenedores Docker Compose son suficientes en esta etapa.

### 7.2 Stack de referencia

Usa el ecosistema JavaScript con **TypeScript estricto**, que compila a JavaScript y reduce defectos en un sistema multi-tenant. Usa ESM donde sea compatible.

Al comenzar la implementación, verifica versiones estables y parches de seguridad en fuentes oficiales, registra la selección en `docs/adr/0001-technology-baseline.md` y fija versiones exactas en el lockfile. No uses `latest` en imágenes o despliegues reproducibles.

Línea base comprobada al 26 de septiembre de 2026:

- Node.js 24 LTS, con el parche estable más reciente;
- pnpm con workspaces;
- TypeScript estable compatible con todo el stack;
- Next.js 16.3.6 o parche posterior seguro de la misma línea Active LTS;
- React estable compatible con Next.js;
- NestJS 12 para API Gateway y microservicios;
- PostgreSQL 18 con el parche menor más reciente;
- Redis para colas, rate limiting coordinado y caché efímera;
- NATS JetStream para eventos internos durables;
- MinIO local y API S3 para almacenamiento de archivos;
- ClamAV para análisis de archivos;
- Mailpit en desarrollo y SMTP configurable en producción;
- Meta WhatsApp Cloud API detrás de un adaptador de proveedor;
- Tailwind CSS y componentes accesibles basados en Radix/shadcn, personalizados al diseño de GestionChurch;
- FullCalendar Community o alternativa con licencia compatible para mes/semana/día/lista;
- React Hook Form y Zod para formularios;
- TanStack Query para estado de servidor;
- una librería de gráficos accesible como Recharts;
- `pg` con Kysely o una capa SQL tipada equivalente que soporte SQL nativo de PostgreSQL;
- migraciones SQL explícitas, necesarias para rangos temporales, índices GiST, roles y permisos;
- Pino y OpenTelemetry para logs, métricas y trazas;
- Vitest o runner equivalente, Supertest, Testcontainers y Playwright.

Si una versión indicada dejó de ser segura o compatible al ejecutar este prompt, actualiza a la versión estable soportada más reciente, explica el cambio en el ADR y demuestra compatibilidad mediante pruebas. No actualices ciegamente a una versión “current” no LTS para producción.

### 7.3 Estructura mínima del monorepo

```text
gestionchurch/
  apps/
    web/
  services/
    api-gateway/
    identity-service/
    tenant-service/
    calendar-service/
    file-service/
    notification-service/
  packages/
    contracts/
    config/
    database/
    events/
    i18n/
    observability/
    security/
    testing/
    ui/
  infra/
    docker/
    migrations/
    monitoring/
  docs/
    adr/
  scripts/
```

Cada servicio debe poder construirse, probarse, versionarse y desplegarse de forma independiente. Los paquetes compartidos solo pueden contener contratos, utilidades técnicas y componentes transversales; no deben convertirse en un dominio compartido gigante.

### 7.4 Responsabilidad de los servicios

**API Gateway**

- punto único de entrada para `/api/v1`;
- resolución segura del tenant;
- validación de sesión/token;
- autorización de borde y propagación de contexto firmado;
- rate limiting;
- límites de tamaño;
- correlation/trace ID;
- agregación mínima de respuestas cuando sea imprescindible;
- OpenAPI público versionado;
- nunca contiene reglas centrales de calendario.

**Identity Service**

- usuarios del tenant, credenciales, sesiones, recuperación de contraseña;
- roles, permisos y membresías departamentales;
- administradores globales separados de usuarios del tenant;
- emisión y rotación segura de tokens/sesiones;
- eventos de seguridad y revocación.

**Tenant Service**

- plano de control global;
- alta, suspensión y ciclo de vida de tenants;
- dominio/subdominio, zona horaria, branding autorizado y configuración;
- provisionamiento, migración y health status de cada base de datos;
- asignación de secretos mediante referencias a un secret manager; nunca credenciales en logs.

**Calendar Service**

- departamentos operativos para calendario;
- lugares y recursos;
- actividades, opciones, sesiones y recurrencias;
- reservas, disponibilidad y conflictos;
- solicitudes y decisiones de revisión;
- sesiones de junta;
- historial y proyecciones del calendario;
- publicación de eventos de dominio.

**File Service**

- carga segura y descarga autorizada;
- metadatos y versiones de adjuntos;
- validación de extensión, MIME real, tamaño y hash;
- análisis antivirus y cuarentena;
- almacenamiento S3/MinIO mediante URLs firmadas de corta duración;
- asociación por identificadores, sin consultar directamente tablas de calendario.

**Notification Service**

- notificaciones in-app, correo y WhatsApp;
- plantillas versionadas en español;
- preferencias, consentimiento y horario silencioso;
- recordatorios programados;
- reintentos, idempotencia, entrega, fallo y dead-letter queue;
- webhooks verificados de proveedores;
- historial de entrega sin exponer secretos ni contenido sensible innecesario.

---

## 8. Multi-tenancy: una base de datos por tenant

El aislamiento no es solo un filtro `tenant_id`. Debe existir aislamiento físico a nivel de base de datos.

### 8.1 Modelo obligatorio

- una base global de control, por ejemplo `gestionchurch_control`, contiene únicamente tenants, dominios, estado de provisionamiento, referencias cifradas a credenciales, administradores globales y metadatos operativos indispensables;
- cada tenant posee una base PostgreSQL independiente, por ejemplo `gc_tenant_<uuid_normalizado>`;
- nunca usar el nombre legible de la iglesia sin normalización como identificador de base;
- dentro de cada base de tenant, cada microservicio tiene un esquema y un rol PostgreSQL propio con privilegios mínimos;
- un servicio no puede leer o escribir el esquema de otro servicio;
- los servicios se comunican por contratos/API/eventos, no mediante joins entre esquemas ajenos;
- archivos físicos se aíslan por bucket dedicado o prefijo no adivinable con políticas verificables;
- caché, colas, claves de idempotencia, locks y métricas deben incluir un tenant ID validado;
- backups, restauraciones, migraciones y eliminación controlada operan por tenant.

### 8.2 Resolución segura de tenant

En producción resuelve el tenant por subdominio o dominio verificado, por ejemplo `{iglesia}.gestionchurch.com`. En desarrollo puede usarse un selector de tenant antes de autenticar.

- el cliente nunca puede imponer libremente un `tenantId` confiable en body, query o header;
- el gateway resuelve el tenant, valida que la sesión pertenezca a ese tenant y propaga un contexto interno firmado;
- rechaza cualquier discrepancia entre host, sesión, token y recurso solicitado;
- los identificadores deben ser UUID/UUIDv7 no secuenciales, pero un UUID difícil de adivinar jamás sustituye autorización;
- las conexiones deben seleccionarse desde un registro validado, con pools LRU y límites para evitar agotamiento;
- limpiar siempre el contexto entre solicitudes y jobs; nunca reutilizar contexto residual de otro tenant.

### 8.3 Administrador global

El administrador global gestiona el plano de control, pero **no obtiene automáticamente acceso al contenido interno de las iglesias**. Si se implementa soporte o suplantación futura, requerirá concesión temporal, motivo, doble confirmación, auditoría reforzada y notificación al tenant. En esta etapa no implementar suplantación.

### 8.4 Pruebas de aislamiento obligatorias

Automatiza intentos de acceso cruzado mediante:

- host/subdominio alterado;
- JWT de tenant A contra rutas de tenant B;
- UUID válido de un recurso de otro tenant;
- caché y claves de idempotencia repetidas;
- descarga de archivo y URL firmada;
- evento manipulado en NATS;
- job de notificación;
- usuario con membresía en más de una iglesia;
- conexiones concurrentes y reciclaje de pool.

La suite debe fallar si una sola ruta puede filtrar existencia, contenido, conteos o metadatos de otro tenant.

---

## 9. Autenticación, roles y permisos

### 9.1 Seguridad de sesión

- hash de contraseñas con Argon2id y parámetros documentados;
- política de contraseña razonable basada en longitud, bloqueo de contraseñas comprometidas cuando sea viable y sin reglas arbitrarias destructivas;
- cookies `HttpOnly`, `Secure` y `SameSite` apropiadas para la web;
- protección CSRF si se usan cookies para autenticar mutaciones;
- access tokens de vida corta y refresh tokens rotativos almacenados hasheados;
- revocación por sesión y revocación global del usuario;
- rate limiting progresivo y alertas ante intentos anómalos;
- recuperación de contraseña con token de un solo uso, corto y no revelado en logs;
- no revelar si un correo existe;
- auditoría de inicio de sesión, fallo, recuperación, cambio de permisos y cierre de sesiones.

### 9.2 Roles iniciales

Implementa RBAC con permisos granulares, no condicionales dispersos por nombre de rol.

- `GLOBAL_ADMIN`: solo plano de control global.
- `TENANT_ADMIN`: configuración general del tenant, usuarios y asignación de roles permitidos.
- `PASTOR`: supervisión y consulta/participación según configuración local.
- `BOARD_SECRETARY`: secretario de la junta de revisión; único rol inicial con permiso final `calendar.conflict.resolve`.
- `REVIEWER`: analiza casos, comenta y emite recomendación, pero no registra la decisión final si no posee el permiso final.
- `DEPARTMENT_LEADER`: administra actividades y planificadores de sus departamentos autorizados.
- `DEPARTMENT_PLANNER`: crea y sigue actividades de los departamentos asignados.
- `VIEWER`: consulta calendarios autorizados.
- `AUDITOR`: acceso de solo lectura a reportes y auditoría autorizada.

Una misma persona puede tener varios roles y pertenecer a varios departamentos. El permiso se evalúa por acción, tenant, recurso y alcance departamental. `TENANT_ADMIN` no debe saltarse silenciosamente el flujo de coexistencia; si debe resolver casos, se le asigna explícitamente el permiso correspondiente y queda auditado.

---

## 10. Dominio de calendario

### 10.1 Plantilla de actividad

Como mínimo, una actividad contiene:

- identificador;
- código humano legible único dentro del tenant;
- título;
- descripción y objetivo;
- departamento propietario y departamentos colaboradores;
- categoría y etiquetas;
- responsable principal y responsables secundarios;
- datos de contacto autorizados;
- audiencia y aforo estimado;
- modalidad: presencial, virtual o híbrida;
- lugar y recursos requeridos;
- visibilidad: interna, liderazgo o pública según política;
- opción u opciones propuestas de calendario;
- tiempo de montaje y desmontaje;
- recurrencia cuando aplique;
- prioridad operativa configurable, sin presentarla como jerarquía doctrinal;
- programa/adjuntos;
- notas internas;
- estado y versión para concurrencia optimista;
- autor, fechas de creación/modificación y trazabilidad.

### 10.2 Opciones y sesiones

Distingue dos conceptos:

- una **opción de fecha** es una alternativa completa que puede ser elegida;
- una **sesión** es cada bloque que compone esa opción, por ejemplo viernes 19:00–21:00 y sábado 09:00–12:00.

Una actividad puede proponer hasta un límite configurable de opciones ordenadas por preferencia. Cada opción puede contener una o varias sesiones. El sistema evalúa cada sesión y el conjunto completo. No debe aprobar una opción si solo algunas de sus sesiones son viables.

Si la primera opción tiene conflicto y existe una alternativa libre, muéstrala como recomendación y solicita confirmación. Nunca cambies la fecha automáticamente sin que el solicitante o la autoridad correspondiente lo acepte.

### 10.3 Estados

Separa el ciclo de vida de la actividad del estado de cada propuesta/reserva.

Estados mínimos de actividad:

- `DRAFT`
- `SUBMITTED`
- `UNDER_REVIEW`
- `CHANGES_REQUESTED`
- `APPROVED`
- `REJECTED`
- `CANCELLED`
- `COMPLETED`
- `ARCHIVED`

Estados mínimos de una opción/reserva:

- `PROPOSED`
- `PROVISIONAL_HOLD`
- `CONFLICTED`
- `EXCEPTION_REQUESTED`
- `CONFIRMED`
- `REJECTED`
- `RELEASED`

Implementa una máquina de estados explícita. Toda transición valida permisos, precondiciones y versión; emite evento de dominio y registra auditoría. No permitas editar directamente el estado desde un formulario genérico.

### 10.4 Qué ocupa una fecha

- un borrador no reserva espacio;
- una solicitud enviada y viable crea una reserva provisional;
- una actividad aprobada crea una reserva confirmada;
- reservas provisionales y confirmadas participan en la detección;
- una solicitud en conflicto no obtiene una reserva normal sobre el bloque afectado, pero permanece visible en la cola de revisión;
- rechazar, retirar o cancelar libera sus reservas mediante una transición auditable;
- si se decide autorizar coexistencia, se crea una excepción explícita vinculada a todos los conflictos conocidos.

No elimines físicamente actividades operativas desde la interfaz. Usa cancelación/archivo y retención conforme a política.

---

## 11. Motor de disponibilidad y conflictos

Este es el núcleo crítico del producto y debe implementarse en backend con garantías de concurrencia.

### 11.1 Reglas temporales

- almacenar instantes en UTC y la zona IANA utilizada al crearlos;
- mostrar siempre en la zona del tenant, con opción futura por usuario;
- modelar intervalos como `[inicio, fin)`: una actividad que termina exactamente cuando otra comienza no se solapa;
- calcular un rango efectivo que incluya montaje antes y desmontaje después;
- usar `tstzrange` de PostgreSQL e índices GiST para consultas de solapamiento `&&`;
- validar `fin > inicio`, límites de duración y fechas razonables;
- soportar cruces de medianoche y cambios de horario de verano aunque la zona inicial no los use;
- expandir recurrencias solo dentro de un horizonte configurable y conservar su regla original;
- una edición de serie debe distinguir esta sesión, esta y siguientes, o toda la serie;
- no usar comparación de strings ni hora local sin zona para decidir conflictos.

### 11.2 Niveles de conflicto

Como regla inicial, cualquier solapamiento entre actividades activas de diferentes departamentos genera al menos una advertencia y requiere visibilidad; la iglesia puede decidir si coexistirán.

Clasifica como mínimo:

- **conflicto temporal general**: dos actividades de la misma iglesia se solapan;
- **conflicto de lugar**: intentan usar el mismo espacio reservable;
- **conflicto de recurso**: comparten equipo o recurso exclusivo;
- **conflicto de responsable**: una persona responsable está requerida simultáneamente;
- **conflicto de alcance**: una actividad marcada como “toda la iglesia” coincide con otra de alcance incompatible;
- **conflicto provisional**: el choque es contra una reserva todavía no confirmada;
- **conflicto confirmado**: el choque es contra una reserva aprobada.

La severidad se deriva de reglas configurables y debe incluir explicación legible: qué choca, con qué actividad, en qué intervalo y por qué. No muestres información privada de la actividad contraria a usuarios sin permiso; muestra lo mínimo necesario para coordinar y ofrece un canal controlado de solicitud.

### 11.3 Concurrencia

La comprobación previa en pantalla es orientativa. En `submit`, `approve`, `reschedule` y `confirm`:

1. abre una transacción;
2. adquiere un lock transaccional determinista por tenant y ámbito temporal/recurso, o una estrategia equivalente demostrablemente segura;
3. vuelve a consultar solapamientos con índices adecuados;
4. bloquea las filas relevantes cuando aplique;
5. crea la reserva o el caso de conflicto;
6. escribe outbox y auditoría en la misma transacción;
7. confirma;
8. publica de forma idempotente fuera de la transacción.

Evita un lock global que degrade todo el tenant. Documenta orden de locks para prevenir deadlocks. Añade una prueba de carrera real con dos solicitudes simultáneas al mismo horario: nunca deben aprobarse silenciosamente ambas sin excepción autorizada.

Si se usa una constraint de exclusión, debe diseñarse de modo que permita coexistencias expresamente autorizadas; no desactives constraints manualmente para aprobar una excepción.

### 11.4 Sugerencias de alternativas

Cuando hay conflicto, sugiere próximos horarios libres respetando:

- duración total y sesiones;
- montaje/desmontaje;
- horario operativo del tenant;
- lugar y recursos;
- ventanas preferidas indicadas por el solicitante;
- bloqueos y eventos ya reservados.

Explica por qué una alternativa es viable. No presentes una recomendación algorítmica como una decisión de la junta.

---

## 12. Flujo de revisión y coexistencia

### 12.1 Solicitud

Ante un conflicto, el usuario puede enviar una solicitud de revisión con:

- opción que desea conservar;
- motivo;
- impacto de moverla;
- plan de coexistencia;
- necesidades de lugar, sonido, transporte, personal u otros recursos;
- alternativa aceptable;
- adjuntos o evidencia opcional.

El sistema crea un caso con snapshot de los conflictos detectados, pero también muestra su estado en vivo. Si el conflicto desaparece antes de la decisión, informa al revisor y permite tramitar la opción por el flujo normal.

### 12.2 Junta de revisión

La bandeja debe permitir:

- agrupar casos por sesión de junta;
- ordenar por fecha de actividad, severidad y antigüedad;
- ver todas las actividades relacionadas en una línea de tiempo visual;
- comparar opciones en paralelo;
- consultar responsables, lugares, recursos y programas según permisos;
- registrar recomendaciones de revisores;
- registrar acta/resumen y participantes;
- filtrar decisiones pendientes;
- generar agenda imprimible/PDF.

### 12.3 Decisión

Solo quien tenga `calendar.conflict.resolve`, inicialmente el `BOARD_SECRETARY`, puede registrar la decisión final:

- aprobar una alternativa libre;
- autorizar coexistencia;
- solicitar cambios;
- rechazar;
- posponer con fecha y motivo.

Autorizar coexistencia exige:

- nota de decisión obligatoria;
- identificación de las actividades afectadas;
- recursos y medidas acordadas;
- participantes o referencia de la sesión de junta;
- fecha y usuario que registra;
- revalidación de conflictos nuevos antes de confirmar;
- creación de un `conflict_waiver` inmutable y versionado;
- notificación a todos los responsables afectados.

Una excepción autoriza únicamente los intervalos y recursos registrados. No se convierte en una omisión general para ediciones futuras. Cambiar fecha, duración, lugar o recursos reabre la evaluación.

---

## 13. Archivos y programas de actividades

Cada actividad debe admitir uno o más archivos y versiones del programa.

Formatos iniciales permitidos, configurables:

- PDF;
- DOC/DOCX;
- XLS/XLSX;
- PPT/PPTX;
- ODT/ODS/ODP;
- TXT/CSV;
- imágenes comunes seguras cuando sean necesarias.

No permitir ejecutables, scripts, HTML activo ni macros sin una política explícita. Para archivos Office con macros, bloquear o poner en cuarentena por defecto.

Requisitos:

- límite por archivo y cuota por tenant configurables;
- validación de nombre, extensión y firma/MIME real;
- nombres de objeto generados por el servidor;
- hash SHA-256 para integridad y deduplicación controlada dentro del tenant;
- análisis ClamAV antes de hacer disponible la descarga;
- estados `UPLOADING`, `SCANNING`, `AVAILABLE`, `QUARANTINED`, `REJECTED`;
- URLs firmadas de corta duración y autorización en cada descarga;
- historial de versiones, autor y fecha;
- nombre original escapado al mostrarlo;
- vista previa solo para formatos procesados de manera segura;
- eliminación lógica y política de retención;
- auditoría de carga, descarga sensible, reemplazo y cuarentena.

Nunca confíes en el MIME enviado por el navegador y nunca sirvas un archivo en cuarentena.

---

## 14. Alertas y notificaciones

### 14.1 Eventos mínimos

Genera notificaciones para:

- actividad enviada;
- reserva provisional creada;
- conflicto detectado;
- solicitud de revisión creada;
- comentario/recomendación relevante;
- cambios solicitados;
- coexistencia aprobada;
- actividad aprobada o rechazada;
- fecha, hora, lugar o programa modificados;
- actividad cancelada;
- recordatorios configurables, inicialmente 7 días y 24 horas antes;
- fallo permanente de entrega que requiera atención administrativa.

### 14.2 Canales

**In-app** debe funcionar siempre y será la fuente de verdad para el usuario.

**Correo** debe funcionar localmente con Mailpit y en producción con SMTP configurable. Incluye plantillas responsivas, texto plano, enlaces seguros, preferencias y baja de notificaciones no esenciales.

**WhatsApp** debe usar un adaptador para Meta WhatsApp Cloud API:

- variables de entorno documentadas;
- números en formato E.164;
- consentimiento verificable;
- plantillas aprobadas cuando Meta las exija;
- verificación de firma de webhooks;
- estados enviado/entregado/leído/fallido si el proveedor los reporta;
- reintentos con backoff y jitter;
- idempotencia para evitar mensajes duplicados;
- separación entre alertas transaccionales y comunicaciones opcionales.

Sin credenciales reales de Meta, el entorno local debe usar un proveedor simulado claramente identificado y pruebas de contrato. Nunca marcar un mensaje como entregado si solo fue simulado. La aplicación será funcional localmente, pero la entrega real por WhatsApp no puede declararse operativa hasta configurar una cuenta, número y plantillas aprobadas.

### 14.3 Robustez

- transactional outbox desde el servicio productor;
- consumidores con inbox/idempotency key;
- colas separadas por prioridad/canal;
- reintentos limitados;
- dead-letter queue visible para administradores autorizados;
- acción manual de reintento auditada;
- plantillas versionadas;
- no incluir información sensible innecesaria en correo o WhatsApp;
- métricas de entrega, latencia y fallos por proveedor sin cruzar tenants.

---

## 15. API y contratos

Publica REST JSON versionado bajo `/api/v1`, documentado con OpenAPI y ejemplos. Usa errores consistentes compatibles con RFC 9457 o equivalente, con código de máquina estable, mensaje en español, correlation ID y errores por campo.

Recursos/rutas mínimas:

```text
/auth/*
/global/tenants/*
/tenant/settings
/users/*
/roles/*
/departments/*
/venues/*
/resources/*
/activities/*
/activities/{id}/options/*
/activities/{id}/attachments/*
/availability/check
/conflicts/*
/review-requests/*
/review-sessions/*
/calendar/*
/notifications/*
/dashboard/*
/exports/*
```

Requisitos:

- paginación por cursor donde el volumen pueda crecer;
- filtros validados y límites máximos;
- `Idempotency-Key` para comandos sensibles;
- `ETag`/versión o `If-Match` para evitar actualizaciones perdidas;
- timestamps ISO 8601 con zona/UTC explícita;
- OpenAPI generado y validado en CI;
- contratos de eventos versionados con schema registry o validación equivalente;
- pruebas de compatibilidad del gateway con servicios;
- no exponer stack traces, consultas SQL, nombres internos de base o secretos.

---

## 16. Modelo de datos mínimo

Diseña el modelo final con migraciones, constraints, índices y comentarios. Como referencia funcional, contempla:

**Plano global:**

- `tenants`
- `tenant_domains`
- `tenant_database_registry`
- `tenant_provisioning_jobs`
- `global_users`
- `global_sessions`
- `global_audit_log`

**Identity por tenant:**

- `users`
- `credentials`
- `sessions`
- `password_reset_tokens`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `department_memberships`

**Calendar por tenant:**

- `departments`
- `venues`
- `resources`
- `activities`
- `activity_collaborators`
- `schedule_options`
- `schedule_sessions`
- `recurrence_rules`
- `reservations`
- `conflict_cases`
- `conflict_links`
- `review_requests`
- `review_recommendations`
- `review_sessions`
- `review_session_participants`
- `review_decisions`
- `conflict_waivers`
- `activity_revisions`
- `outbox_events`

**Files por tenant:**

- `file_objects`
- `file_versions`
- `file_links`
- `scan_results`

**Notifications por tenant:**

- `notification_preferences`
- `notifications`
- `notification_deliveries`
- `notification_templates`
- `provider_webhook_events`
- `scheduled_reminders`
- `inbox_events`

**Auditoría por tenant:**

- `audit_events` de solo inserción para la identidad de aplicación;
- actor, acción, recurso, antes/después redactado, motivo, IP truncada/hasheada según política, user agent, correlation ID, fecha y metadatos de tenant;
- denegar `UPDATE` y `DELETE` a roles normales de servicio.

No copies este listado ciegamente: normaliza donde aporte integridad, evita tablas polimórficas inseguras y documenta decisiones. Usa índices para filtros reales, análisis con `EXPLAIN` y constraints de base además de validación de aplicación.

---

## 17. Seguridad y privacidad

Apunta como mínimo a OWASP ASVS nivel 2 y OWASP API Security Top 10.

- principio de mínimo privilegio en aplicación y PostgreSQL;
- validación de entrada y serialización de salida;
- CSP estricta, protección XSS, clickjacking y MIME sniffing;
- CORS cerrado a orígenes conocidos;
- CSRF donde aplique;
- SSRF bloqueado en cualquier función que reciba URLs;
- secretos únicamente por variables seguras/secret manager;
- `.env.example` sin secretos reales;
- redacción de tokens, contraseñas, teléfonos, correos y contenido sensible en logs;
- cifrado TLS en tránsito y estrategia de cifrado en reposo documentada;
- rotación de credenciales de base por tenant;
- dependencias fijadas y escaneo de vulnerabilidades/licencias;
- SBOM por versión;
- backups cifrados, restauración probada y RPO/RTO documentados;
- retención y eliminación de datos configurables;
- consentimiento y preferencias para WhatsApp/correo;
- auditoría de acciones privilegiadas;
- mensajes de error que no permitan enumeración de tenants, usuarios o recursos;
- ninguna telemetría debe mezclar ni exponer datos de iglesias distintas.

Realiza threat modeling y guarda el resultado en `docs/security-threat-model.md`, incluyendo abuso de subdominios, confusión de tenant, IDOR, escalada de rol, archivos maliciosos, carreras de reservas, webhooks falsos y duplicación de notificaciones.

---

## 18. Observabilidad y operación

Cada servicio debe ofrecer:

- `/health/live`;
- `/health/ready` comprobando solo dependencias necesarias;
- logs JSON estructurados;
- correlation ID propagado por HTTP, NATS y jobs;
- trazas OpenTelemetry;
- métricas de latencia, errores, saturación, colas y conexiones;
- nombre/versión del servicio sin revelar secretos;
- cierre ordenado y consumo idempotente al reiniciar.

Métricas de negocio operativas:

- solicitudes enviadas;
- conflictos detectados por tipo;
- tiempo de resolución;
- coexistencias autorizadas;
- recordatorios pendientes/fallidos;
- entregas por canal;
- provisionamientos/migraciones fallidos.

Evita tenant IDs legibles o datos personales como etiquetas de alta cardinalidad. Proporciona runbooks para servicio caído, cola atascada, migración parcial, base de tenant no disponible, archivo en cuarentena y webhook de proveedor fallido.

---

## 19. Desarrollo local y despliegue

Proporciona un `docker-compose.yml` reproducible que levante como mínimo:

- web;
- API Gateway;
- todos los microservicios de la etapa;
- PostgreSQL;
- Redis;
- NATS JetStream;
- MinIO;
- ClamAV;
- Mailpit;
- dependencias de observabilidad que sean razonables para desarrollo.

Incluye:

- comandos simples `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`;
- migración del plano global;
- provisionamiento/migración idempotente de tenants;
- seed de demostración;
- datos de ejemplo claramente marcados como desarrollo;
- checks que esperen dependencias sanas, no `sleep` arbitrarios;
- Dockerfiles multi-stage, usuario no root y `.dockerignore`;
- configuración de producción por variables;
- proxy y TLS documentados para `gestionchurch.com` y subdominios wildcard;
- estrategia CI con lint, tipos, pruebas, contratos, build, escaneo y migración dry-run.

El seed debe crear:

- un administrador global de desarrollo;
- un tenant de demostración;
- un administrador de tenant;
- un secretario de junta;
- dos o más líderes departamentales;
- por lo menos tres departamentos;
- lugares y recursos;
- actividades libres, pendientes, aprobadas y un caso de conflicto reproducible.

Las credenciales de demostración deben existir solo en entorno local, estar documentadas y requerir cambio o estar deshabilitadas en cualquier modo de producción.

---

## 20. Pruebas obligatorias

### 20.1 Unitarias

- máquina de estados;
- cálculo de rangos efectivos;
- intervalos `[inicio, fin)`;
- recurrencias;
- severidad de conflicto;
- permisos por rol/alcance;
- sugerencia de alternativas;
- idempotencia y política de reintentos;
- render de plantillas de alertas.

### 20.2 Integración con PostgreSQL real

- migraciones desde cero;
- rangos e índices GiST;
- constraints;
- locks y transacciones;
- outbox/inbox;
- permisos de roles PostgreSQL;
- conexión dinámica a bases de tenant;
- aislamiento de esquemas por servicio;
- restauración de una base de tenant de prueba.

No reemplaces PostgreSQL con SQLite en pruebas que validan comportamiento de PostgreSQL.

### 20.3 Contratos

- gateway ↔ servicios;
- eventos NATS;
- proveedor SMTP;
- proveedor simulado y contrato de Meta WhatsApp;
- webhooks firmados;
- carga/escaneo/descarga de archivos.

### 20.4 E2E con Playwright

Automatiza al menos:

1. provisionar tenant e iniciar sesión;
2. crear departamento y usuarios;
3. crear actividad desde móvil y adjuntar programa;
4. reservar una fecha libre;
5. detectar un choque antes de enviar;
6. insistir y crear solicitud de revisión;
7. revisar como miembro sin permiso final;
8. autorizar coexistencia como secretario;
9. comprobar ambas actividades y el indicador de excepción;
10. comprobar notificación in-app y correo en Mailpit;
11. reprogramar y reabrir validación;
12. cancelar y liberar reserva;
13. exportar `.ics`;
14. impedir acceso de tenant A a datos/archivo de tenant B;
15. verificar experiencia a 360 px, 390 px y escritorio;
16. verificar navegación básica con teclado y análisis automático de accesibilidad.

### 20.5 Casos límite críticos

- dos usuarios envían simultáneamente la misma fecha;
- dos requests repiten la misma `Idempotency-Key`;
- fin de A igual a inicio de B;
- montaje/desmontaje produce el choque aunque el horario visible no;
- actividad cruza medianoche;
- recurrencia con una sola ocurrencia conflictiva;
- cambio de zona DST;
- lugar libre pero recurso ocupado;
- reserva provisional frente a confirmada;
- el conflicto desaparece durante la revisión;
- aparece un conflicto nuevo justo antes de aprobar;
- usuario pierde permiso con sesión abierta;
- token de tenant válido usado bajo otro dominio;
- mensaje NATS duplicado o fuera de orden;
- proveedor de correo/WhatsApp cae y luego se recupera;
- archivo cambia de extensión, MIME falso, macro o malware de prueba EICAR;
- URL firmada vencida o perteneciente a otro tenant.

---

## 21. Criterios de aceptación

La etapa 1 está terminada solo si:

- `docker compose up --build` levanta un entorno sano siguiendo el README;
- una persona nueva puede ejecutar la aplicación con instrucciones claras;
- el flujo completo descrito en la sección 2 funciona con datos reales persistidos;
- todos los servicios atraviesan el gateway y están separados en procesos/contenedores;
- cada tenant usa su propia base de datos PostgreSQL;
- las pruebas automatizadas demuestran aislamiento entre tenants;
- la carrera de doble reserva está resuelta en el servidor;
- la coexistencia solo puede autorizarse con permiso y auditoría;
- archivos reales pasan por análisis y control de acceso;
- correo funciona end-to-end en local;
- WhatsApp funciona con proveedor simulado verificable y queda listo para credenciales reales, sin afirmar entregas falsas;
- UI completa en español y sin strings funcionales dispersos;
- calendario, formulario, revisión y dashboard funcionan a 360 px;
- no hay rutas sin autorización, botones muertos, datos mock en producción, `TODO` críticos ni errores silenciosos;
- lint, typecheck, unitarias, integración, contratos y E2E pasan;
- OpenAPI y documentación coinciden con el código;
- dependencias no presentan vulnerabilidades críticas conocidas sin mitigación documentada;
- existe evidencia de accesibilidad y pruebas de rendimiento;
- se documentaron limitaciones reales y procedimientos operativos.

Objetivos de rendimiento iniciales, medidos en entorno documentado:

- interacción principal móvil fluida y sin layout shifts significativos;
- p95 de lecturas API comunes menor a 300 ms sin contar red pública;
- p95 de comandos comunes menor a 600 ms, excluyendo análisis de archivos y proveedores externos;
- consulta mensual de calendario paginada/segmentada sin transferencias masivas;
- disponibilidad para un rango típico en menos de 500 ms;
- procesamiento asíncrono de alertas sin bloquear la aprobación.

No sacrifiques integridad o seguridad solo para alcanzar una cifra; si el entorno no permite medirla de forma honesta, documenta el método y la limitación.

---

## 22. Documentación entregable

Incluye y mantén actualizados:

- `README.md` con instalación, ejecución, cuentas demo y comandos;
- `docs/architecture.md` con diagrama C4 de contexto/contenedores y flujos;
- `docs/adr/` para decisiones relevantes;
- `docs/api.md` y OpenAPI navegable;
- `docs/events.md` con contratos y versionado;
- `docs/tenant-isolation.md` con threat boundaries y pruebas;
- `docs/manual-traceability.md`;
- `docs/security-threat-model.md`;
- `docs/notification-providers.md`;
- `docs/file-security.md`;
- `docs/operations.md` y runbooks;
- `docs/backup-restore.md` con una restauración probada;
- `docs/accessibility.md`;
- `docs/release-checklist.md`;
- `.env.example` comentado y sin secretos.

Incluye diagramas Mermaid mantenibles dentro de Markdown cuando ayuden a comprender la arquitectura o los flujos. No sustituyas documentación operacional con capturas de pantalla.

---

## 23. Orden recomendado de implementación

Trabaja en cortes verticales demostrables:

1. **Descubrimiento y base:** inspección del repositorio, ADR de versiones, monorepo, contratos, CI y Docker Compose.
2. **Tenancy e identidad:** plano global, provisionamiento por base, login, sesiones, RBAC y pruebas de aislamiento.
3. **Calendario esencial:** departamentos, lugares, plantilla, opciones/sesiones, vistas y reservas sin conflicto.
4. **Motor de choques:** PostgreSQL ranges, locks, severidad, alternativas y pruebas concurrentes.
5. **Revisión:** casos, junta, recomendaciones, decisión del secretario y coexistencia auditada.
6. **Archivos:** MinIO, escaneo, versiones y autorización.
7. **Alertas:** in-app, Mailpit/SMTP, WhatsApp adapter, recordatorios, reintentos y DLQ.
8. **Dashboard y refinamiento UX:** gráficos, filtros, exportaciones, accesibilidad y rendimiento móvil.
9. **Hardening:** threat model, pruebas cruzadas, backups/restauración, observabilidad y documentación final.

Después de cada corte, ejecuta lint, typecheck y las pruebas relevantes. No acumules todos los problemas para el final.

---

## 24. Reglas de ejecución para el agente desarrollador

- Inspecciona primero el repositorio y respeta código/instrucciones existentes.
- Conserva cambios del usuario que no pertenezcan a esta tarea.
- Mantén una lista breve de decisiones y progreso verificable.
- No inventes que una integración externa fue probada si faltan credenciales.
- No uses datos reales de miembros en seeds, screenshots o pruebas.
- No incluyas secretos en commits, logs, fixtures ni documentación.
- No ocultes fallos con mocks fuera del entorno de prueba/desarrollo.
- No crees una SPA visual desconectada de APIs reales.
- No simules microservicios mediante carpetas que corren en un único proceso.
- No permitas acceso directo del frontend a bases, NATS, Redis o servicios internos.
- No confíes en controles del frontend para permisos, tenancy o conflictos.
- No hagas borrados destructivos de datos de producción.
- No declares “listo” hasta ejecutar las pruebas y reportar sus resultados reales.
- Si una prueba falla, corrige la causa o documenta con precisión un bloqueo externo; no la elimines para obtener verde.
- Prioriza código claro y mantenible sobre abstracciones prematuras.
- Aplica migraciones hacia adelante; documenta rollback/restore para cambios destructivos.

---

## 25. Formato del informe final

Al terminar, responde en español y presenta:

1. qué quedó construido y operativo;
2. arquitectura final y servicios;
3. cómo ejecutar localmente;
4. cuentas/datos de demostración seguros;
5. pruebas ejecutadas y resultado exacto;
6. evidencia del aislamiento multi-tenant y del caso de carrera;
7. estado de correo y WhatsApp, diferenciando simulación de entrega real;
8. decisiones relevantes y limitaciones pendientes;
9. archivos/documentos principales;
10. siguientes pasos recomendados para producción y para MFA.

No cierres con promesas vagas. Entrega una aplicación comprobable, una lista honesta de lo que requiere credenciales o validación humana y pasos concretos para continuar.

