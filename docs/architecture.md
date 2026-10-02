# Arquitectura

El módulo de reportes opera como el microservicio independiente `reports-service` (puerto interno 4016). El API Gateway publica `/api/v1/reports/*`; el servicio valida la sesión y los permisos del tenant, abre exclusivamente la base física del tenant autenticado y expone analítica agregada, CSV y PDF ejecutivo sin compartir datos entre iglesias.

## Contexto

```mermaid
flowchart LR
  U[Miembro o líder] --> W[Web mobile-first]
  GA[Administrador global] --> W
  W --> G[API Gateway]
  G --> I[Identity Service]
  G --> T[Tenant Service]
  G --> C[Calendar Service]
  G --> F[File Service]
  G --> N[Notification Service]
  G --> R[(Redis)]
  T --> CTRL[(Control DB)]
  I --> DB[(Tenant DB)]
  C --> DB
  F --> DB
  N --> DB
  C --> BUS[(NATS JetStream)]
  BUS --> N
  F --> OBJ[(MinIO / S3)]
  F --> AV[ClamAV]
  N --> SMTP[SMTP]
  N --> WA[WhatsApp Cloud API]
  G -. trazas OTLP .-> O[Jaeger]
```

## Límites

- El navegador nunca llama directamente a un microservicio ni a PostgreSQL.
- El Gateway es el único punto de entrada y propaga cookie de sesión, CORS y correlation ID.
- Identity resuelve el tenant desde el registro global y valida credenciales en su base.
- Calendar es dueño del estado de actividades, opciones, sesiones, reservas y decisiones.
- File almacena IDs opacos de actividad y valida actualmente su existencia mediante una lectura restringida en la base física del mismo tenant; separar esa validación detrás de un contrato interno es un hardening previsto antes de dividir credenciales PostgreSQL por servicio.
- Calendar publica un outbox transaccional en NATS JetStream; en desarrollo sin NATS utiliza entrega HTTP interna idempotente.
- Notification deduplica por `event_id`.

## Flujo de conflicto

```mermaid
sequenceDiagram
  participant U as Planificador
  participant G as Gateway
  participant C as Calendar
  participant P as PostgreSQL tenant
  participant N as Notification
  U->>G: Enviar actividad
  G->>C: POST /activities/:id/submit
  C->>P: BEGIN + advisory lock por fecha
  C->>P: Consulta tstzrange && reservas activas
  alt Fecha disponible
    C->>P: Reserva PROVISIONAL + outbox + auditoría
    C-->>U: SUBMITTED
  else Hay solapamiento
    C->>P: Conflict case + outbox + auditoría
    C-->>U: CONFLICTED con explicación
    U->>C: Solicitar revisión
    C->>P: Review request
    U->>C: Secretario autoriza coexistencia
    C->>P: Revalida + waiver + reserva CONFIRMED
  end
  C->>N: Despacha outbox de forma idempotente
```

## Persistencia

Existe `gestionchurch_control` para routing/provisionamiento. Cada tenant usa `gc_tenant_<uuid>` y contiene esquemas separados:

- `identity`
- `calendar`
- `files`
- `notifications`
- `audit`

La separación física impide que un error de filtro `tenant_id` exponga otra iglesia. Los caches, buckets, métricas y colas futuras también deben namespacerse con el tenant validado.

El modo nativo usa una credencial local para abrir la conexión, pero cada proceso ejecuta la sesión bajo un rol PostgreSQL `NOLOGIN` distinto (`gc_identity_service`, `gc_calendar_service`, `gc_file_service` o `gc_notification_service`) con grants mínimos. La suite demuestra que File no puede modificar Calendar y que Identity no puede leer Files. En producción cada servicio debe recibir además un login rotatorio propio con membresía exclusiva en su rol, evitando compartir la credencial de conexión administrativa.
