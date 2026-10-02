# Backup y restauración

El respaldo versión 3 incluye el plano global, las bases físicas seleccionadas y sus objetos locales. La copia cifrada autenticada del manifiesto protege la correspondencia tenant/base/archivo. No equivale a un respaldo de Nombramientos ni de sus claves privadas, que nunca se almacenan en el servidor.

## Crear y verificar

```powershell
# GC_BACKUP_PASSPHRASE se obtiene del gestor de secretos (mínimo 16 caracteres).
pwsh -File ./scripts/backup.ps1 -OutputDirectory D:/Respaldos/gestionchurch-20261001
# Escrow cifrado de configuración únicamente cuando se solicita:
pwsh -File ./scripts/backup.ps1 -OutputDirectory D:/Respaldos/gestionchurch-20261001-config -IncludeConfiguration
```

Requiere PowerShell 7 (`pwsh`) y herramientas PostgreSQL compatibles. Detenga escrituras y trabajadores durante el snapshot para que bases y archivos correspondan al mismo estado. El script no puede garantizar esa consistencia si se sigue escribiendo. Configure destinos y credenciales mediante el entorno, sin pasarlas en la línea de comandos ni en reportes.

El directorio de salida debe ser nuevo. El cifrado usa AES-256-GCM y PBKDF2-HMAC-SHA256, 200.000 iteraciones y sal aleatoria. Los dumps temporales existen sin cifrar durante su generación: use un volumen privado/cifrado y custodie respaldo, contraseña y claves de configuración en ubicaciones separadas con mínimo privilegio. No sustituye un servicio de respaldos inmutable. El cifrado actual utiliza memoria y necesita dimensionamiento con el volumen real.

`-TenantSlug` selecciona bases y objetos del tenant, pero **el plano de control sigue siendo completo**. No utilice este respaldo para una restauración parcial sobre un control activo compartido: reemplaza el control. Mover un único tenant necesita un procedimiento de importación dedicado.

Los objetos se limitan a `UPLOAD_ROOT/<tenant UUID>/<UUID>.<extensión>`. Se rechazan enlaces y directorios inesperados. Si el proveedor es S3, el script rechaza generar un respaldo que aparentaría incluir objetos sin copiarlos: coordine snapshot/versionado del bucket y ensayo específico. El límite de expansión por archivo de objetos es 10 GiB.

## Restaurar

Detenga escrituras del tenant y verifique que `CONTROL_DATABASE_URL`, `POSTGRES_ADMIN_URL` y las variables `TENANT_DATABASE_*` apuntan al entorno correcto.

```powershell
pwsh -File ./scripts/restore.ps1 -BackupDirectory D:/Respaldos/gestionchurch-20261001 -VerifyOnly
# Solo después de verificar un entorno aislado y detener sus escrituras:
pwsh -File ./scripts/restore.ps1 -BackupDirectory D:/Respaldos/gestionchurch-20261001 -ConfirmRestore
# Recuperar configuración solo en un archivo NUEVO, sin sobrescribir .env:
pwsh -File ./scripts/restore.ps1 -BackupDirectory D:/Respaldos/gestionchurch-20261001-config -ConfirmRestore -ConfigurationDestination D:/Recuperacion/gestionchurch.env
```

La bandera es deliberadamente obligatoria: `pg_restore --clean --if-exists` reemplaza objetos del destino. Todos los ciphertext/dumps/archivos se validan antes del primer reemplazo. Los objetos previos se preservan en `<tenant>.pre-restore-<UUID>` y se informa su ubicación recuperable. Los respaldos versión 2 pueden verificarse, pero no restaurarse directamente porque su manifiesto no está autenticado. No editar manualmente un manifiesto versión 3.

**No existe una transacción atómica entre todas las bases y el storage.** Si falla un destino durante la escritura, mantenga detenida la aplicación e investigue; no anuncie recuperación hasta reconciliar todo. Revise endpoints de la configuración recuperada, permisos, claves de canales, archivos y sesiones. No ejecutar seeds ni sincronizaciones de cargos como smoke test. Use el arranque `-Mode Native -SkipDataSetup -NoBuild` solo con un build compatible ya verificado; no lanzar suites históricas live contra iglesias reales.

## Evidencia automatizada

`RUN_PREMIUM_RESTORE_TESTS=1 pnpm exec vitest run tests/integration/premium-restore.test.ts` crea un tenant y un control nuevos con UUID/marcadores propios. Ensaya backup cifrado, verificación, rechazo de manifiesto alterado/ciphertext corrupto sin modificar datos, restauración real de base/objeto/configuración y consulta posterior. Limpia únicamente sus destinos. Ejecución del 1 de octubre de 2026: 1/1 pasó, sin skips.

Este ensayo no acredita R34 completo: faltan restauración combinada con Nombramientos, custodia/recovery del mismo contenido cifrado y entorno productivo S3 cuando sea elegido. RPO/RTO, retención y volumen deben acordarse y medirse; no se han aceptado objetivos productivos.
