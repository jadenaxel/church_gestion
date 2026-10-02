# Índice verificable de evidencia premium

Corte técnico local: **2026-10-02 04:12–04:32 UTC**, build **`m3K6tJtdsnu8HBjapaS00`** (fecha de carpeta/trabajo: 2026-10-01, America/La_Paz). Esta actualización documental lee artefactos y metadatos; no ejecuta pruebas, reinicios, fixtures ni cambios de aplicación. El [prompt de ejecución](../../../prompt-ultra-premium-end-to-end.md) y los gates R01–R36 conservan su alcance íntegro.

## Estado del corte y procedencia

- **Unitarias GC actuales: 395/395 PASS**, 57 archivos, cero fallos/pendientes. **HTTP root 69/69 y backend 103/103**, seis y diez archivos respectivamente; **DB66/66**, nueve archivos. Son niveles distintos, no un total de funcionalidades verificadas.
- **Browser 21/21: 18 GC + 3 Nom**, inicio 04:12:42.610 UTC, duración 220.658 s, cero unexpected/skipped/flaky. Los 112 probes de anchura, 48 de idioma y los recorridos de exportación/ACK/Save son aserciones incluidas en esos 21 escenarios, no casos adicionales.
- Root confirmó fuente congelada, full typecheck y build services/web PASS, arranque oficial Native `-SkipDataSetup -NoBuild`. Performance y estado registran el BuildID actual. Vitest/Playwright no incluyen BuildID: la asociación al runtime proviene del arranque coordinado y del ejecutor root, no de un campo inventado.
- Root comunicó repetición estática 04:30 UTC: typecheck y lint PASS, OpenAPI153 rutas PASS, audit de dependencias productivas sin vulnerabilidades conocidas y SBOM renovado. El count de archivos lint no es cobertura. Son gates separados, no auditoría independiente. [SBOM](../../sbom.cdx.json): CycloneDX1.7, timestamp 04:21:50.262 UTC, 566 componentes.
- [Estado local](final-local-state.json), 04:21:49.907 UTC: `servicesReady:true`, cuatro HTTP200, pero **`metadataReviewClear:false`/`pass:false`** por una base tenant no registrada cuya propiedad no está verificada. Se preservó; no se atribuye al ensayo ni se autoriza borrado. Synthetic tenants/global users 0, control temporal 0 y runtime logins no registrados 0. El cleanup propio es distinto de la revisión global de ownership.
- Status oficial comunicado por root: **2026-10-02 00:21:54-04:00**, todos UP. No se ejecutó otro status desde este índice. Los incidentes y checker fallidos anteriores permanecen conservados.
- Los cortes `9Rs93DdT6H9Go53CnWtsV` y `deA8EC3awHzyV_-6jgeyw` son antecedentes archivados. Sus pruebas/PDF y los subconjuntos focalizados no se suman al corte actual.

Una suite verde no acredita cada botón, actor, estado ni todo R01–R36. **Alcance incompleto; salida productiva no aprobada.**

## Artefactos machine-readable actuales

Todas las horas siguientes son **2026-10-02 UTC**. «Escrito» es `LastWriteTimeUtc`, no firma ni timestamp de commit. Vitest usa `startTime`, Playwright `stats.startTime`; los scripts usan `measuredAt`/`verifiedAt`. Archivos Vitest se cuentan desde `testResults`, no desde grupos `describe` anidados.

| Artefacto | Inicio / escrito UTC | Resultado observado | Alcance |
|---|---|---|---|
| [gc-unit-results.json](gc-unit-results.json) | 04:12:52.931 / 04:12:55.533 | 395/395, 0 fail/pending | 57 archivos GC; comportamiento y guardas estructurales. Incluye reset 14 y PDF-localización 15; no agregarlos otra vez. |
| [gc-root-api-results.json](gc-root-api-results.json) | 04:13:29.137 / 04:13:46.574 | 69/69, 0 fail/pending | Seis archivos: flujos departamentales 17, gobierno 7, identity/audit 12, provisioning 3, workspaces 14, security 16. |
| [gc-backend-api-results.json](gc-backend-api-results.json) | 04:14:10.049 / 04:14:25.871 | 103/103, 0 fail/pending | Diez archivos: calendario 9, atomicidad Hub 23, atomicidad PM/Mujer 31, gateway 1, localización 6, identidad Nom 4, outbox-recovery 7, reset 8, privacidad 2, fiabilidad 12. |
| [gc-db-final-results.json](gc-db-final-results.json) | 04:15:57.203 / 04:16:12.241 | 66/66, 0 fail/pending | Nueve archivos: Ancianos 15, runtime-isolation 2, tenant-runtime 3, reliability 8, read-contract 3, outbox Hub 4, leased-client 2, reset 17, settings-reconciliation 12. Controlador+PostgreSQL no equivale a 66 HTTP. |
| [browser-results.json](browser-results.json) | 04:12:42.610 / 04:16:23.250 | 21 expected, 0 unexpected/skipped/flaky | Dos archivos; 18 GC+3 Nom, Chromium aislado, worker 1, sin retries. Incluye Save explícito persistido y cola Identidad; no ciclo completo Nom ni todos los procesos GC. |
| [performance-final.json](performance-final.json) | Medido 04:21:29.478 / escrito 04:21:29.479 | p 95 lecturas 10.06 ms; comandos 12.85 ms | Windows/PG18, DB sintética nueva, loopback sin throttle, concurrencia 1; 80 lecturas y 25 replays de **una** actividad idempotente. Guardas 300/600 ms,`userApprovedSlo:false`; no carga productiva ni Web Vitals de campo. |
| [final-local-state.json](final-local-state.json) | Verificado 04:21:49.907 / escrito 04:21:49.909 | Servicios listos; revisión metadata no aprobada | Cuatro 200, PG18 existente, originales canónicos verificados; una DB unknown preservada y cero fixtures propios declarados por cleanup. El indicador `pass:false` permanece. |
| [source-secret-scan-review.json](source-secret-scan-review.json) | Ejecutado 04:29:28 / escrito 04:29:29.769 | 938 archivos, 6 patrones, 9 findings, exit 1 | Inicio registrado desde el reloj UTC de la herramienta con precisión de segundos, no timestamp nativo del scanner. Solo project/file/kind/contexto, sin valores. |
| [static-checks-final.json](static-checks-final.json) | Registrado 04:32:23 | Typecheck/lint/OpenAPI/auditprod exit 0 | Salidas reales de root,lint 305 archivos/OpenAPI153; no nuevo build. Counts estáticos no acreditan cobertura de acciones ni auditoría independiente. |

### Subconjuntos focalizados, incluidos en la regresión actual

| Artefacto | Inicio / escrito UTC | Resultado y relación |
|---|---|---|
| [password-reset-unit-results.json](password-reset-unit-results.json) | 04:03:32.006 / 04:03:32.358 | 14/14, un archivo; repetidos dentro de UNIT395. |
| [password-reset-db-results.json](password-reset-db-results.json) | 04:00:29.710 / 04:00:33.634 | 17/17, un archivo; repetidos dentro de DB66. |
| [password-reset-api-results.json](password-reset-api-results.json) | 04:04:59.403 / 04:05:03.281 | 8/8, un archivo; repetidos dentro de BACK103. Los focales preceden al build final y no lo sustituyen. |
| [tenant-settings-reconciliation-db.json](tenant-settings-reconciliation-db.json) | PG04:10:29 / registrado 04:10:30 | 12/12 en dos DB propias; repetidos dentro de DB66. Sus 22 unitarios focales son subconjunto de UNIT395. No representa 12 HTTP. |
| [gc-calendar-final-target-results.json](gc-calendar-final-target-results.json), [gc-new-cut-target-api-results.json](gc-new-cut-target-api-results.json) | Consultar `startTime` de cada JSON | Selecciones anteriores de calendario 9 y calendario 9+dominio 31+provisioning 3; ya contenidas en los lotes finales, no sumar. |
| [additive-recovery-schema.json](additive-recovery-schema.json) | Postflight 03:59:40 | Aplicación scoped revisada por root: identity una tabla/un índice por cada una de las dos bases originales; control una tabla/dos índices y revocación PUBLIC. Cero DML de negocio, seed, sync, credenciales cambiadas, roles reales asignados, mensajes o grants nuevos. No certifica producción. |

La recuperación de contraseña se documenta en [password-reset-outbox.md](password-reset-outbox.md): token+audit+intención cifrada en una TX, dispatcher postcommit/reinicio, lease/fence/timeout 15s, retry acotado y metadata administrativa. La respuesta genérica y permisos existentes se conservan. ACK es aceptación interna o reprogramación, no recepción SMTP. Intenciones usadas/vencidas/inactivas no se reactivan; una entrega ya aceptada durante la carrera token/usuario↔transporte no puede retirarse.

Settings tiene intención/recibos durables entre control y tenant; solo 200 cuando la operación y snapshot están coherentes, sin COMMIT distribuido supuesto. DB12 prueba rollback/restart/ACK perdido/concurrencia/snapshot y divergencia independiente de Calendar. Un COMMIT real seguido de excepción sintética de ACK no acredita caída de red ni atomicidad cross-base universal. Los demás comandos y los gates HA/infra continúan independientes.

## Antecedentes preservados: no sumar ni convertir fallos en pases

| Artefacto | Inicio UTC / resultado | Tratamiento |
|---|---|---|
| [gc-backend-api-first-final-attempt.json](gc-backend-api-first-final-attempt.json) | 02:30:09.569; 58 pass, 2 fail, 30 pending | Fixtures con responsable requerido ausente y tipo de registro inexistente; el posterior 90/90 y el actual 103/103 no borran el intento. |
| [gc-unit-leased-client-first-attempt.json](gc-unit-leased-client-first-attempt.json) | 03:11:58.006; 350 pass, 2 fail | Root diagnosticó mocks async-connect obsoletos; adaptó EventEmitter+callback sin relajar aserciones. Snapshot histórico. |
| [gc-unit-new-cut-first-attempt.json](gc-unit-new-cut-first-attempt.json) | 03:56:06.597; 389 pass, 1 fail | Guarda DDL/privilegios de tenant-settings-reconciliation fallida; conservar el fallo, sin presentarlo como pase ni inferir desde él una concesión productiva. |
| [password-reset-outbox-db-first-attempt.json](password-reset-outbox-db-first-attempt.json) | 03:54:40.286; 14 pass, 2 fail de 16 | Precisión timestamptz real corregida; lookup notifications del harness bajo rol sin USAGE reemplazado por comprobación ACL/OID, sin grants. |
| [password-reset-outbox-db-results.json](password-reset-outbox-db-results.json) | 03:55:49.643; 16/16 | Intermedio anterior al caso adicional; no sumar al 17/17 ni aDB66. |
| [gc-unit-intermediate-2n-results.json](gc-unit-intermediate-2n-results.json) | 04:09:34.282; 394/394 | Fuente/corte intermedio, sustituido por 395/395, no agregar. |
| [browser-first-final-attempt.json](browser-first-final-attempt.json) | 02:32:32.620; 11 pass, 8 fail | Intento fallido conservado, 0 skip. |
| [browser-second-final-attempt.json](browser-second-final-attempt.json) | 02:42:15.137; 14 pass, 5 fail | Intento fallido conservado, 0 skip. |
| [final-local-state-first-attempt.json](final-local-state-first-attempt.json) | 03:01:30.605;`pass:false` | Incidente DOWN anterior conservado; no ocultarlo por readiness posterior. |
| [final-local-state-route-check-attempt.json](final-local-state-route-check-attempt.json) | 03:20:40.950; Nom web 404 | Checker consultaba `/es`, no el endpoint adecuado `/healthz`; separado de una caída real. |

Las correcciones previas del harness browser distinguieron el announcer Next transitoriamente vacío, consultaron `custom_data` en vez de `custom_fields`, acotaron CTA legítimos Nom y comprobaron título escrito en `h2` de ficha frente a `h1` de Shell. No se retiraron controles ni se tradujo contenido para hacer pasar pruebas. Las regresiones posteriores están identificadas por su propio corte.

[previous-9Rs93Dd/](previous-9Rs93Dd/) conserva **47 archivos** del corte 9Rs: UNIT352/52 archivos, ROOT69/BACK90, DB36, browser 19 y documentos/PDF/metadatos anteriores. Es inventario archivado, no 47 pruebas. [gc-backend-api-before-m3K6.json](gc-backend-api-before-m3K6.json) y [gc-db-final-before-m3K6.json](gc-db-final-before-m3K6.json) conservan además los snapshots 90/36 antes de renovar esos nombres.

[previous-deA8EC3/](previous-deA8EC3/) conserva **seis archivos**: browser 19 inicio 02:52:59.845, performance 02:57:21.307 p 95 9.44/5.98 ms y cuatro PDF02:56:14–27. Los renders antiguos 00:55–00:56 y demás intentos permanecen como antecedentes. Ningún nombre `*-final*` histórico eleva su vigencia.

## Exportaciones y revisión visual actuales

Documentos exclusivamente sintéticos, descargados por browser 21 contra el build actual. Este índice comprueba existencia/fechas y enlaza la [revisión visual de root](pdf-visual-review.md), no simula inspección propia. Root rasterizó a 144dpi y **abrió las 12 páginas**, cuatro PDF de tres páginas A4, 04:21–04:25 UTC.

| Familia | Archivo / escrito UTC | Alcance observado por root |
|---|---|---|
| Base filtrada | [CSV](reporte-sintetico.csv)04:15:57.396; [PDF](reporte-sintetico.pdf)04:15:57.491 | Tres actividades sintéticas y 60 asistentes estimados; filtros/filas coherentes, sin inventar fecha/estado/evidencia. |
| Español | [PDF ES](reporte-sintetico-es.pdf)04:16:05.389 | Ocho actividades; `7,7 días`,`1 abierto`, gráfico 2/1 y mes+año. |
| Inglés | [PDF EN](reporte-sintetico-en.pdf)04:16:09.430 | Ocho actividades; `7.7 days`,`1 open`,`1 conflict`,`Oct 2026`. |
| Francés | [PDF FR](reporte-sintetico-fr.pdf)04:16:13.452 | Ocho actividades; `7,7 jours`,`1 ouvert`,`1 conflit`,`oct. 2026`; estado largo envuelve dentro de su celda. |
| Rasters actuales | `reporte-sintetico{-es,-en,-fr}-final-page-{1,2,3}.png` y base `reporte-sintetico-final-page-{1,2,3}.png` | Doce imágenes 144dpi; no 12 exportaciones independientes. La revisión y hashes actuales están en pdf-visual-review.md. |
| Capturas móviles | [ES390](reportes-es-390.png), [EN390](reportes-en-390.png), [FR390](reportes-fr-390.png) | Chromium viewport 390; no Android/iPhone físicos. |

En estos ejemplos root no observó solapamiento, truncación, páginas vacías adicionales o glifos perdidos; acentos ES/FR, marca y contenido original intactos. **Tagged:no**: no PDF/UA ni evaluación completa con lectores. Advertencias locales Symbol/ArialUnicode no impidieron render, pero no certifican todas las fuentes/glifos. Rangos enormes, textos largos, legibilidad y revisión lingüística competente siguen pendientes. Los ejemplos antiguos `6,8` pertenecen al corte anterior, no al PDF actual.

## Documentos de apoyo y procedencia externa

- [Frontend UX](frontend-ux.md), [backend reliability](backend-reliability.md) y [reset durable](password-reset-outbox.md): trazabilidad, fallos corregidos y límites. Las 59 unitarias/backendDB15 de la narrativa backend anterior son subconjuntos históricos, repetidos en los lotes actuales; no agregarlos. Restore sintético 1 es evidencia separada allí, no una prueba adicional de DB66.
- [PDF visual](pdf-visual-review.md): revisión actual de root, doce páginas y hashes de cuatro PDF, no inspección del autor de este índice.
- [Manifest de entrega](release-evidence-manifest.json): root lo renueva después de los documentos; consultar su `recordedAt`/`webBuildId` y hashes antes de atribuir integridad al corte. Un manifest 9Rs anterior **no acredita los archivos actuales**. Los hashes identifican artefactos, no son firma externa ni hash de toda la fuente. No se recalculó ni modificó ese archivo desde este índice.
- [Informe](../../premium-release-report.md), [matriz R01–R36](../../premium-requirements-matrix.md), [plan](../../premium-delivery-plan.md), [decisiones D01–D11](../../premium-authorization-decisions.md), [threat model](../../premium-threat-model.md), [runbook](../../premium-operations-runbook.md), [runtime credentials](../../premium-runtime-credentials.md), [piloto](../../premium-pilot-plan.md) y [guía](../../premium-user-guide.md): alcance/autoridad/operación; plan preparado no demuestra ejecución.
- [Evidencia Nom](X:/CODE/NOMBRAMIENTOS/docs/premium-nominations-evidence-2026-10-01.md): browser Nom 3 sí repetido dentro de 21. Sus web 264, API no-live 421, DB451 pass/3 skip (contiene 346/1 skip), E2EE31, dominio 41, herramientas 39 y arnés real API/crypto 8 son **históricos anteriores al corte GC actual**, no renovados por esa navegación. Arnés usa Fastify `inject`, PostgreSQL y criptografía propios, no ocho ciclos visuales. Cleanup Nom read-only directo 04:21:41.791 UTC: seis receipts propios, cero recursos owned incluidos secret refs, registro original 3, ledgers 32/40 válidos/pending 0; `auditIntegrityVerified:false`, no prueba integridad criptográfica de audit ni ausencia global de residuos o propiedad de la DBunknown.
- OpenAPI proviene de `services/api-gateway/src/openapi.ts`; no inventar YAML ni JSON de comandos estáticos inexistentes. Audit 0known/SBOM no equivalen a prueba externa ni suministro libre de riesgo.

## Reproducción y guardas de alcance

Recetas leídas, no ejecutadas al elaborar este índice. Integración/browser/performance/restore escriben **solo fixtures propias** bajo autorización, destino/nonce/marker verificados y cleanup exacto; nunca usar Central/Ozama como datos QA. Preservar intentos relevantes antes de renovar un JSON y anotar build/fecha.

| Objetivo | Comando/configuración | Guarda |
|---|---|---|
| Unitarias | `pnpm exec vitest run tests/unit --reporter=json --outputFile=<nuevo-json>` | No sustituye TSC, lint, HTTP o DOM. |
| Estática | `pnpm typecheck`,`pnpm lint`,`pnpm build`,`pnpm validate:openapi` | Gates separados; build incluye servicios+Next. |
| HTTP/DB premium | Flag exacto de la tabla siguiente en literal `'1'`; `pnpm exec vitest run tests/integration/<archivo> --maxWorkers=2 --reporter=json --outputFile=<nuevo-json>` | BACK10 y DB9 ejecutados con máximo 2; skip sin opt-in no acredita caso ni constituye estrés. |
| Browser | `pnpm exec playwright test --config playwright.premium.config.ts` | Dos archivos, Chromium 1440×900 inicial, worker 1, no parallel/retries, timeout 180s/expect 15s; screenshots/trace automáticos off, capturas de reportes explícitas. |
| Performance | `pnpm test:performance` | Loopback 4000, producción rechazada, fixture propia; no SLO aprobado. |
| Estado | `pnpm exec tsx scripts/verify-premium-local-state.ts` | PostgreSQL read-only, health deadline 5s; escribe solo JSON, no cleanup automático. |
| Restore preflight | `pwsh -NoProfile -File scripts/restore.ps1 -BackupDirectory <backup-propio> -VerifyOnly` | `-ConfirmRestore` es otra acción destructiva autorizada solo sobre destino aislado. Manifestv 3 autenticado; v 2 solo verify, no overwrite configuración. |
| Arranque coordinado | `powershell -NoProfile -ExecutionPolicy Bypass -File ./start-gestionchurch.ps1 -Action Restart -Mode Native -SkipDataSetup -NoBuild` | Solo root cuando corresponda; sin setup/seed/Prepare, no SeedDemo/Docker; PG existente y artefacto válido, no sustituye regresión. |
| Scanner | `pnpm exec tsx scripts/scan-source-secrets.ts X:/CODE/GestionChurch X:/CODE/NOMBRAMIENTOS` | Solo project/file/kind, exit 1 con findings, no ejecutar desde revisión documental. |

### Opt-ins exactos de integración

Archivo relativo a `tests/integration/`. Activación PowerShell de ejemplo: `$env:RUN_PREMIUM_CALENDAR_API_TESTS='1'`; retirar el flag al terminar o usar proceso dedicado. Los counts son del JSON final, no del número de `describe`.

| Archivo | Flag literal 1 | Lote actual / casos |
|---|---|---|
| premium-calendar-api.test.ts | RUN_PREMIUM_CALENDAR_API_TESTS | BACK103 /9 |
| premium-department-atomicity-api.test.ts | RUN_PREMIUM_DEPARTMENT_ATOMICITY_API_TESTS | BACK103 /23 |
| premium-domain-atomicity-api.test.ts | RUN_PREMIUM_DOMAIN_ATOMICITY_API_TESTS | BACK103 /31 |
| premium-gateway-api.test.ts | RUN_PREMIUM_GATEWAY_API_TESTS | BACK103 /1 |
| premium-localization-api.test.ts | RUN_PREMIUM_LOCALIZATION_API_TESTS | BACK103 /6 |
| premium-nominations-identity-api.test.ts | RUN_PREMIUM_NOMINATIONS_IDENTITY_API_TESTS | BACK103 /4 |
| premium-outbox-recovery-api.test.ts | RUN_PREMIUM_OUTBOX_RECOVERY_API_TESTS | BACK103 /7 |
| premium-password-reset-outbox-api.test.ts | RUN_PREMIUM_PASSWORD_RESET_API_TESTS | BACK103 /8 |
| premium-record-privacy-api.test.ts | RUN_PREMIUM_RECORD_PRIVACY_API_TESTS | BACK103 /2 |
| premium-reliability-api.test.ts | RUN_PREMIUM_RELIABILITY_API_TESTS | BACK103 /12 |
| department-flows-api.test.ts | RUN_DEPARTMENT_FLOW_API_TESTS | ROOT69 /17 |
| premium-governance-api.test.ts | RUN_PREMIUM_GOVERNANCE_TESTS | ROOT69 /7 |
| premium-identity-audit-api.test.ts | RUN_PREMIUM_IDENTITY_AUDIT_API_TESTS | ROOT69 /12 |
| premium-tenant-provision-api.test.ts | RUN_PREMIUM_TENANT_PROVISION_API_TESTS | ROOT69 /3 |
| premium-workspaces.test.ts | RUN_PREMIUM_WORKSPACE_TESTS | ROOT69 /14 |
| security-api.test.ts | RUN_SECURITY_API_TESTS | ROOT69 /16 |
| premium-elders-atomic-db.test.ts | RUN_PREMIUM_ELDERS_ATOMIC_DB_TESTS | DB66 /15 |
| premium-runtime-isolation.test.ts | RUN_PREMIUM_RUNTIME_ISOLATION_TESTS | DB66 /2 |
| premium-tenant-runtime-db.test.ts | RUN_PREMIUM_TENANT_RUNTIME_DB_TESTS | DB66 /3 |
| premium-reliability-db.test.ts | RUN_PREMIUM_RELIABILITY_DB_TESTS | DB66 /8 |
| premium-read-contract-db.test.ts | RUN_PREMIUM_READ_CONTRACT_DB_TESTS | DB66 /3 |
| premium-department-outbox-db.test.ts | RUN_PREMIUM_DEPARTMENT_OUTBOX_DB_TESTS | DB66 /4 |
| premium-leased-client-db.test.ts | RUN_PREMIUM_LEASED_CLIENT_DB_TESTS | DB66 /2; desconexiones PG controladas propias |
| premium-password-reset-outbox-db.test.ts | RUN_PREMIUM_PASSWORD_RESET_DB_TESTS | DB66 /17 |
| premium-tenant-settings-reconciliation-db.test.ts | RUN_PREMIUM_TENANT_SETTINGS_RECONCILIATION_DB_TESTS | DB66 /12 |
| premium-restore.test.ts | RUN_PREMIUM_RESTORE_TESTS | Restore 1 narrativo separado, sin JSON de este caso en el directorio |

`vitest.config.ts` excluye e 2e, tenant-isolation y backup-restore históricos salvo `RUN_LEGACY_GC_TESTS=1`; el browser genérico cambia a core heredado con `RUN_LEGACY_BROWSER_TESTS=1`. **No activar legacy sobre datos reales para aumentar conteos.** El browser premium no acredita tres proyectos del config genérico. El helper Nom exige receipt/nonce/marker; Start Nom usa `-NoPrepare`, no sync/seed general. El arnés histórico separado exige `NOMBRAMIENTOS_PREMIUM_ISOLATED=true` en `apps/api/test/premium-federation-crypto.live.test.mjs`.

## Scanner suplemental: nueve findings, no «cero secretos»

[JSON actual](source-secret-scan-review.json): **938 archivos, seis patrones, nueve findings, exit 1**, todos credential-bearing-database-url. Nueva ejecución 04:29:28 UTC registrada desde el reloj de la herramienta con precisión de segundos, no scanner-native timestamp; sustituye la metadata aproximada 04:21 UTC y no suma 887/880 scans anteriores. Se preservan findings sin valores ni URLs.

| Proyecto/ruta | Contexto revisado previamente, sin credenciales |
|---|---|
| GC `.github/workflows/ci.yml` | PostgreSQL de servicio CI/entorno de prueba; no promover a producción. |
| GC `docker-compose.yml` | Defaults explícitos de desarrollo local; no distribución productiva acreditada. |
| Nom `apps/api/scripts/performance-scale-local.ts` | Self-tests de guard de loopback, inputs válidos/negativos. |
| Nom `apps/api/test/contracts.test.ts` | Inputs positivos/negativos de DATABASE_CONTROL_URL. |
| Nom `apps/api/test/real-browser-stack-guards.test.ts` | Tests de destino y guard admin. |
| Nom `packages/database/scripts/local-cluster.ps1` | Constructor de URLs locales, salida sin password. |
| Nom `packages/database/test/crypto.test.ts` | Test de redactConnectionString. |
| Nom `scripts/create-ci-install.mjs` | Constructor configuración CI. |
| Nom `scripts/verify-local-evidence.test.mjs` | Negativa de sanitización. |

El scanner usa seis regex sobre código/config, una coincidencia por patrón/archivo; excluye .env*, symlinks, .git, .next, .local*, node_modules, dist, coverage y resultados; .md no está incluido. No revisa historial Git, entropía universal, vault, secret-store o distribución/runtime. Contextos dev/test reconocidos no significan allowlist implementada, riesgo aceptado, scanner limpio ni auditoría independiente. El scanner propio de Nom tiene alcance distinto; sus counts no sustituyen estos nueve findings.

## Correspondencia de alcance y pendientes

| Requisito | Evidencia concreta actual | Límite que permanece |
|---|---|---|
| R05 | Permisos efectivos, coordination/forecast con evidencia; browser dashboard 503/retry, navegación por membresías | Todos los drill-down/filtros/regreso/próximas acciones por cada perfil. |
| R20 | Provenance SYSTEM/CUSTOM y validación; browser draft privado→preview móvil→publish→campo efectivo/persistido/audit y negativa 403 | Todos los tipos/opciones/reordenado, autoridades, errores y concurrencia. |
| R27 | UNIT/LOC, browser 16 rutas×ES/EN/FR, contenido raw tras reload, cuatro PDF y doce páginas revisadas por root | Estados dinámicos/errores legacy/avisos y revisión lingüística competente. Legacy/custom sin provenance permanece raw, no promoción por coincidencia. |
| R28 | 16 rutas×7 anchos, Axe 7 páginas, Escape/foco, modal/tabs | WCAG integral, NVDA/VoiceOver, Android/iPhone/Safari físicos, procesos/zoom/reflow/teclado/orientación/datos largos. |
| R29 | Back cancelado, lostACK actividad+File, misma identidad conserva RAM/distinta purga; **Save explícito de formulario completamente válido**, confirmado por servidor, persiste DRAFT/customData/programa y archivo confirmado tras reload/nueva pestaña; no submit ni reserva | Trabajo incompleto, File sin ACK y claves inciertas continúan en RAM:no recuperación tras cierre/reload; no todos los comandos/modales ni reconciliación universal. beforeunload previene, no recupera. |
| R01/R23/R32 | Reset durable 14 unit/17 PG/8 HTTP incluidos; browser metadata/razón/audit/mismoID y token vencido sin retry. UI fuentes Calendario/Operaciones/Identidad, users.manage, errores por fuente | ACK interno no SMTP/Meta recibido; browser Calendario+Identidad no recorre todas las fallas/acciones de tres colas. Token/usuario puede cambiar después de claim durante transporte ya aceptado. |
| R32 settings | Recibos durables/snapshot coherente, version/idempotencia, restart y fallos COMMIT ensayados en DB12 | No TX distribuida universal, HA/red real o reconciliación de todos los demás comandos; divergencia Calendar posterior se informa, no sobrescribe automáticamente. |
| R24–R26/D11 | Asignaciones centrales explícitas por tenant, revocación y browser Nom 3; legacy NOMINATIONS_USER conserva comisión histórica | **D10 pendiente**: cookie de dispositivo revocado puede operar si identidad conserva otra concesión. Retiro central 401 es otro control, no vínculo device↔sesión ni cierre del defecto. |

### Gates obligatorios abiertos

1. Revisión de ownership de una DB no registrada, preservada. Servicios listos no convierten `metadataReviewClear:false` en PASS ni prueban inexistencia global de residuos.
2. Cobertura completa acción×actor×estado del inventario, positivas/negativas/persistencia, datos largos, cancelación y permisos acumulados; suites verdes no acreditan todo el módulo.
3. **D10/R26:** autorización/revisión específica de vinculación criptográfica dispositivo–sesión pendiente, no implementada ni «no aplicable». **D11 sí autorizado** para fuente central de comisión/custodia; QA no asignó personas reales. D03/MFA sigue diferido/no autorizado.
4. **R29:** Save válido confirmado ya probado; recuperación universal del trabajo incompleto, File sin ACK/keys inciertas y todos los comandos sigue pendiente. No introducir plaintext storage, crypto, retención o nuevas grants sin autorización.
5. **D07/R27/R28/R36:** revisión lingüística, piloto multirrol, procesos accesibles con lectores manuales, dispositivos físicos y pentest independiente; usuario decidió coordinarlos después de correcciones. Planes preparados, no contactos, contratos ni aprobación externa. Tagged:no/PDF/UA, fuentes/glifos/datasets extremos permanecen abiertos.
6. **R31:** TLS/SCRAM/red/CONNECT/secret-store y distribución runtime por tenant/servicio para nuevos tenants y diez dominios no implementada/verificada íntegramente. Fail-closed/local trust/ACTIVE no certifican infraestructura productiva.
7. **R01/R23/R32:** SMTP/Meta/NATS y destinatarios reales autorizados, ACK perdido del proveedor, caídas prolongadas storage/DB/AV/broker, HA y límites entre bases. La nueva intención reset y saga settings tienen evidencia sintética específica; no exactamente-once externo ni atomicidad cross-base universal.
8. **R25/R26/R34:** ciclo cifrado completo de navegador y ramas, historia/custodia operacional, restore coordinado GC/Nom/S3/config/claves y uso HTTP posterior. Restore propio no cierra esos escenarios.
9. **D08/R35:** SLO/dataset/concurrencia/red/RPO/RTO/retención aprobados, carga y Web Vitals de campo. Smoke secuencial local y guardas de desarrollo no definen esos compromisos.
10. Scanner exit 1 documentado, no cero secretos; revisión restringida runtime/historial/distribución y configuración de fuentes aún necesarias. Audit 0known no sustituye seguridad independiente.

## Handoff y vigencia

Root mantiene matriz, informe, plan, manifest y QA PDF; UX mantiene su trazabilidad frontend. Este índice solo cambia documentación. Renovar futura evidencia exige build/fecha/fuente, resultados y preservación de intentos; no sumar historial.

| Campo | Corte actual |
|---|---|
| Fuente/build | `m3K6tJtdsnu8HBjapaS00`, arranque oficial sin seed/sync/full-migrate; typecheck/build/lint PASS y OpenAPI153 comunicados por root; repetición estática 04:30 UTC |
| Tests actuales | UNIT395/57 archivos, ROOT69/6, BACK103/10, DB66/9, browser 21=GC18+Nom 3; 0 fail/pending/skipped/unexpected/flaky según su nivel |
| Reset/settings | 14 unit/17 PG/8 HTTP reset y 12 PG settings ya incluidos, no sumar |
| PDF | Nuevos cuatro×tres páginas, export 04:15:57–04:16:13Z, revisión root 04:21–04:25Z; Tagged:no y límites humanos/fuentes |
| Performance | 04:21:29.478Z, p 9510.06/12.85 ms, 80 lecturas/25 replays/concurrencia 1/loopback/freshDB, no SLO |
| Estado | 04:21:49.907Z, cuatro 200,`servicesReady:true`,`metadataReviewClear:false`/`pass:false`, DBunknown 1preservada, 0 fixtures propios |
| Scanner | 938 archivos/6 patrones/9 findings/exit 1, ejecución 04:29:28 UTC, no valores |
| Histórico | previous-9Rs93Dd 47 archivos y previous-deA8EC3 seis; fallos/intermedios preservados, no sumados |
| Producción | **Incompleto/no aprobado**; D10, R29 residual, R31 distribución, infra/proveedores y D07 permanecen en el denominador R01–R36 |

No se declara consolidación 100%, conformidad WCAG completa, certificación de seguridad ni superioridad de mercado.
