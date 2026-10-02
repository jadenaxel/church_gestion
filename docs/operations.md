# Operación

## Health checks

Cada proceso expone `/health/live`. El Gateway expone `http://localhost:4000/health/live`.

## Despliegue integral local

```bash
docker compose up --build
```

La topología contiene 15 servicios. La tarea `setup` espera a PostgreSQL, aplica migraciones y seed, y solo entonces habilita los microservicios. La aplicación queda en `http://localhost:3000`, OpenAPI en `http://localhost:4000/api/docs`, Mailpit en `http://localhost:58025`, la consola MinIO en `http://localhost:59001` y Jaeger en `http://localhost:16686`.

Cada proceso publica `/health/live`, `/health/ready` y `/metrics`. Los logs HTTP son JSON, no incluyen contenido personal y conservan `x-correlation-id`. Con `OTEL_EXPORTER_OTLP_ENDPOINT` se exportan trazas OTLP; Compose las envía a Jaeger.

## Base local Windows

```powershell
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed
```

Para detener únicamente el clúster aislado:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' stop -D '.local\postgres\data' -m fast
```

## Migraciones

`pnpm db:migrate` aplica el esquema global y luego todos los tenants registrados. Las migraciones son idempotentes. Para cambios destructivos, crear migraciones versionadas y realizar backup antes de desplegar.

## Backup y restauración

```powershell
$env:GC_BACKUP_PASSPHRASE = '<frase-secreta-de-al-menos-16-caracteres>'
./scripts/backup.ps1
./scripts/backup.ps1 -TenantSlug central
./scripts/restore.ps1 -BackupDirectory .local/backups/AAAAMMDD-HHMMSS -VerifyOnly
./scripts/restore.ps1 -BackupDirectory .local/backups/AAAAMMDD-HHMMSS -ConfirmRestore
```

El backup genera un dump custom del plano de control, uno por tenant y un manifiesto; cada dump se verifica con `pg_restore --list` y luego se cifra mediante AES-256-GCM. La restauración exige la frase secreta y confirmación explícita porque reemplaza los esquemas de destino. `-VerifyOnly` descifra y valida sin modificar bases. Después de restaurar se ejecutan migraciones, `pnpm test` y una prueba de acceso por tenant.

Objetivos iniciales recomendados: RPO de 24 horas, RTO de 4 horas, retención diaria de 30 días y copia cifrada fuera del host. La organización operadora debe ajustar estos valores y ensayar restauraciones trimestralmente.

## Verificación de una versión

```bash
pnpm typecheck
pnpm lint
pnpm validate:openapi
pnpm test
pnpm test:browser
pnpm build
pnpm audit --prod
```

## Incidentes

- Servicio caído: comprobar health y logs por nombre de servicio.
- Tenant no disponible: validar estado `control.tenants` y conectividad de su base.
- Outbox pendiente: consultar `calendar.outbox_events` con `delivered_at IS NULL`.
- Archivo en cuarentena: no servirlo; conservar metadatos y seguir la política de incidente.
- SMTP/WhatsApp caído: mantener alerta in-app y reintentar sin duplicar event ID.
- Entregas agotadas: consultar `notifications.deliveries` con estado `DEAD_LETTER` y reprocesar solo después de corregir el proveedor.
