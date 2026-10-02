# Índice verificable de evidencia premium

Corte documental final local: **2026-10-02 03:21 UTC** (fecha del trabajo: 2026-10-01, America/La_Paz). Inventario de archivos leídos y metadata verificada; no se ejecutaron pruebas, reinicios ni cambios de aplicación para producir este índice. El [prompt de ejecución](../../../prompt-ultra-premium-end-to-end.md) y los gates R01–R36 mantienen su alcance íntegro.

## Estado del corte y procedencia

- **Último unitario GC leído:** 352/352 PASS, 52 archivos, 0 fallos/omitidas; incluye los 15 casos nuevos de localización PDF y la ampliación posterior de conexiones. Reemplaza 341 y 326, sin sumarlos. Es un snapshot aprobado, no garantía sobre cambios posteriores.
- **Build final local probado:** `9Rs93DdT6H9Go53CnWtsV`. Root confirmó full typecheck, build services/web PASS y arranque oficial `SkipDataSetup/NoBuild`; los JSON actuales acreditan unitarias352, HTTP root69/backend90, DB36 y browser19/19. Performance y estado registran ese BuildID. Los JSON Vitest/Playwright no incluyen BuildID: la asociación al runtime proviene del ejecutor root y su arranque coordinado, no de un campo inventado.
- **Corte anterior preservado:** `previous-deA8EC3/` conserva browser19/19, performance y cuatro PDF del build `deA8EC3awHzyV_-6jgeyw`. Son antecedentes, no resultados sumados al corte nuevo. Las correcciones posteriores de reportes/localización/gráfico y conexiones ya tienen regresión automatizada renovada; no queda pendiente esa repetición final.
- **Estado final local con distinción explícita:** `final-local-state.json` a las 03:21:12.389 UTC registra `servicesReady:true`, las cuatro superficies HTTP200 y `metadataReviewClear:false`/`pass:false` por una base tenant no registrada de propiedad desconocida, preservada. Root informó status oficial UP a las 23:20:45 locales. No se convierte el indicador de revisión en caída de servicios ni en autorización de borrar esa base. El incidente real DOWN de las 03:01 y el posterior error de ruta del checker permanecen archivados.
- Los nombres `*-final*` de archivos históricos no elevan su vigencia. En caso de discrepancia con narrativas previas, mandan fecha, build, fuente probada y resultado machine-readable.

No se suman repeticiones, subconjuntos ni pruebas de distintos niveles como un supuesto total de funcionalidades verificadas. Una suite verde tampoco acredita cada botón, actor o estado de R01–R36.

## Artefactos machine-readable existentes

Todas las horas de esta tabla son **2026-10-02 UTC**. «Escrito» es `LastWriteTimeUtc` del archivo leído, no una firma ni un timestamp de commit. Vitest registra `startTime`; Playwright registra `stats.startTime`; los scripts usan `measuredAt`/`verifiedAt`.

| Artefacto | Inicio / escrito UTC | Resultado observado | Alcance y vigencia |
|---|---|---|---|
| [gc-unit-results.json](gc-unit-results.json) | 03:13:31.005 / 03:13:33.244 | 352/352; 0 fail/pending | 52 archivos unitarios GC. Mezcla comportamiento y guardas estructurales; no sustituye DOM/HTTP. Reemplaza los snapshots341/326, no se suma a ellos. |
| [gc-backend-api-results.json](gc-backend-api-results.json) | 03:14:43.224 / 03:15:02.171 | 90/90; 0 fail/pending | 9 suites HTTP sintéticas renovadas: CAL5, DOM30, HUB23, gateway1, localización6, identidad Nom4, privacidad2, recuperación7, fiabilidad12. Runtime final; no usuarios reales. |
| [gc-root-api-results.json](gc-root-api-results.json) | 03:13:49.622 / 03:14:07.750 | 69/69; 0 fail/pending | 6 suites renovadas: flujos departamentales17, gobierno7, identity/audit12, provisioning3, workspaces14, security16. Runtime final confirmado por root; no usuarios reales. |
| [gc-db-final-results.json](gc-db-final-results.json) | 03:15:45.080 / 03:15:54.674 | 36/36; 0 fail/pending | 7 archivos: Ancianos14 (controlador+PostgreSQL, no 14 HTTP), aislamiento runtime2, runtime tenant3, reliability8, read-contract3, outbox Hub4 y lease2. Contiene la repetición de DBROOT19 + backendDB15 + lease2: no sumar esos subconjuntos otra vez. |
| [gc-db-root-results.json](gc-db-root-results.json) | 02:29:17.484 / 02:29:23.706 | 19/19; 0 fail/pending | Snapshot anterior de tres archivos, repetidos dentro del DB36 actual. No prueba restore ni aumenta36. |
| [browser-results.json](browser-results.json) | 03:16:20.790 / 03:19:55.861 | 19 expected, 0 unexpected/skipped/flaky | 16 GC + 3 Nom, un proyecto Chromium aislado, duración 215.084 s, build final confirmado por root. Incluye 112 probes de anchura, 48 probes de locale, exportaciones base+ES/EN/FR, lost-ACK, File tras expiración y purge por identidad; son subconjuntos, no casos adicionales. |
| [performance-final.json](performance-final.json) | `measuredAt` 03:20:11.373 / escrito 03:20:11.375 | p95 lectura 10.32 ms; comandos 9.33 ms | Windows/PostgreSQL18, gateway loopback, sin throttle, concurrencia1, DB sintética nueva; 80 lecturas y 25 replays de **una** actividad idempotente. Build final. Guardas de desarrollo 300/600 ms, `userApprovedSlo:false`; no carga productiva ni Web Vitals de campo. |
| [final-local-state.json](final-local-state.json) | `verifiedAt` 03:21:12.389 / escrito 03:21:12.393 | `servicesReady:true`; `metadataReviewClear:false`; `pass:false` | Web/gateway/Nom web/Nom API200. Synthetic tenants/global users0, bases no registradas1, control temporal0, runtime logins no registrados0; originales canónicos verificados. Base desconocida preservada para revisión de propiedad: no se atribuye al ensayo ni se autoriza borrado. |
| [source-secret-scan-review.json](source-secret-scan-review.json) | `scannedAt` 03:17:58.663 / escrito 03:17:58.666 | 887 archivos, 6 patrones, 9 findings, exit1 | Solo metadata project/file/kind y revisión de contextos dev/test, sin valores. No scanner universal ni «cero secretos». |

### Antecedentes fallidos que se conservan

| Artefacto | Inicio / escrito UTC | Resultado | Tratamiento |
|---|---|---|---|
| [gc-backend-api-first-final-attempt.json](gc-backend-api-first-final-attempt.json) | 02:30:09.569 / 02:30:27.465 | 58 pass, 2 fail, 30 pending | Fixtures con responsable requerido ausente y tipo de registro inexistente; la repetición 90/90 posterior no borra el intento. |
| [gc-unit-leased-client-first-attempt.json](gc-unit-leased-client-first-attempt.json) | 03:11:58.006 / 03:12:59.100 | 350 pass, 2 fail, 0 pending | Según root, dos timeouts de un mock async-connect obsoleto; adaptado a EventEmitter+callback sin relajar aserciones. La repetición352/352 posterior no convierte este intento en un pase. |
| [browser-first-final-attempt.json](browser-first-final-attempt.json) | 02:32:32.620 / 02:37:24.342 | 11 pass, 8 fail, 0 skip | Histórico conservado, no éxito parcial agregado al 19/19. |
| [browser-second-final-attempt.json](browser-second-final-attempt.json) | 02:42:15.137 / 02:49:59.159 | 14 pass, 5 fail, 0 skip | Histórico conservado, no ejecución adicional de nuevas capacidades. |
| [final-local-state-first-attempt.json](final-local-state-first-attempt.json) | 03:01:30.605 / 03:01:30.604 | `pass:false` | Copia del incidente anterior para conservarlo cuando root renueve el archivo de estado. |
| [final-local-state-route-check-attempt.json](final-local-state-route-check-attempt.json) | 03:20:40.950 / 03:20:40.951 | `servicesReady:false`, Nom web404 | Checker consultaba `/es`, ruta incorrecta para esa verificación; root lo alineó con `/healthz`. No se interpreta ese404 como caída real del módulo ni se borra el intento. El JSON final posterior registra los cuatro200. |

Las correcciones de harness que precedieron al primer browser19/19 fueron: distinguir el announcer transitoriamente vacío de Next de un aviso real; corregir la consulta R20 que usaba la columna equivocada `custom_fields` para consultar la columna real `custom_data`; acotar los dos CTA legítimos Nom; comprobar el título escrito en el `h2` de la ficha y no en el `h1` de Shell. No se retiraron controles ni se tradujo contenido del usuario para hacer pasar esas pruebas. Entre aquellos tres intentos no cambió la aplicación. Después se corrigieron reportes y conexiones, se generó el build final y **se volvió a ejecutar todo19/19**: la regresión nueva ya está aprobada, sin convertir los fallos históricos en pases.

### Corte anterior archivado

[previous-deA8EC3/](previous-deA8EC3/) conserva seis archivos del build anterior: `browser-results.json` (inicio02:52:59.845, 19/19), `performance-final.json` (02:57:21.307, p95 9.44/5.98 ms) y los cuatro `reporte-sintetico{,-es,-en,-fr}.pdf` (02:56:14–27). No se suman al corte final ni sustituyen sus artefactos. Los renders de las00:55–00:56 y los intentos fallidos también permanecen.

## Exportaciones y evidencia visual finales

Archivos sintéticos regenerados contra el build final, no documentos de iglesias reales. Este índice verifica existencia/fechas y enlaza la [revisión visual realizada por root](pdf-visual-review.md): los cuatro PDF tienen tres páginas A4 y root abrió **las doce páginas rasterizadas a144dpi**. No se deduce revisión visual de enumerar archivos ni se atribuye una inspección nueva al autor de este índice.

| Familia | Archivos existentes | Escrito UTC / alcance |
|---|---|---|
| Export filtrado base | [reporte-sintetico.csv](reporte-sintetico.csv), [reporte-sintetico.pdf](reporte-sintetico.pdf) | 03:19:34; filtros reales con tres actividades sintéticas, coherentes con CSV/filas PDF en la revisión de root. |
| PDF por idioma | [reporte-sintetico-es.pdf](reporte-sintetico-es.pdf), [reporte-sintetico-en.pdf](reporte-sintetico-en.pdf), [reporte-sintetico-fr.pdf](reporte-sintetico-fr.pdf) | ES 03:19:41, EN 03:19:44, FR 03:19:48; tres páginas cada uno, regenerados. No PDF accesible etiquetado ni revisión lingüística nativa acreditados. |
| Reportes móvil | [reportes-es-390.png](reportes-es-390.png), [reportes-en-390.png](reportes-en-390.png), [reportes-fr-390.png](reportes-fr-390.png) | ES 03:19:41, EN 03:19:44, FR 03:19:48; viewport390 Chromium. No dispositivo físico. |
| Renders base | `reporte-sintetico-final-page-1.png`, `-page-2.png`, `-page-3.png` | 03:20:11–12; tres páginas finales,144dpi. |
| Renders ES/EN/FR | `reporte-sintetico-es-final-page-{1,2,3}.png`, `reporte-sintetico-en-final-page-{1,2,3}.png`, `reporte-sintetico-fr-final-page-{1,2,3}.png` | 03:20:12–14; nueve imágenes finales,144dpi, no nueve exportaciones independientes. |
| Renders de un corte más antiguo | `reporte-sintetico-pagina-1.png`, `reporte-sintetico-2.png`, `reporte-sintetico-3.png` | 00:55:51–00:56:01; conservar como antecedentes, no mezclar con el PDF posterior. |

Root observó en estas doce páginas ausencia de solapamiento, truncación, páginas vacías adicionales y glifos perdidos; acentos ES/FR visibles. Confirmó decimales/plurales FR (`6,8 jours`, `1 conflit`, `1 ouvert`), ES (`6,8 días`, `1 abierto`), conteos del gráfico2/1 y eje mes+año. Son ejemplos inspeccionados, no perfección universal. Los PDF son **Tagged:no**; siguen pendientes PDF/UA/lectura asistida, rangos/gráficos enormes, textos muy largos y revisión nativa. Advertencias locales de sustitución Symbol/ArialUnicode no impidieron estos renders, pero exigen revisar configuración/portabilidad de fuentes: no certifican todos los glifos.

## Documentos de apoyo y evidencia fuera de este directorio

- [frontend-ux.md](frontend-ux.md): actualizado en este corte documental con correspondencia R05/R20/R27/R28/R29, browser final19/19, reportes regenerados y límites obligatorios.
- [backend-reliability.md](backend-reliability.md), escrito02:44:25 UTC al leerlo: fallos reproducidos, TX/audit/outbox, contratos y correspondencia backend. Sus59 unitarios son subconjunto del unitario GC; backendDB15 ahora se repite dentro del JSON DB36, no se agrega otra vez. Restore1 se informa allí; no atribuirlo a DBROOT19 ni DB36, cuyos archivos están enumerados arriba. Esa narrativa previa no sustituye los timestamps nuevos de los JSON.
- [pdf-visual-review.md](pdf-visual-review.md): revisión de root03:20–03:21 UTC, doce páginas/144dpi, SHA-256 de los cuatro PDF, resultados concretos y límites de accesibilidad/fuentes/dataset.
- [release-evidence-manifest.json](release-evidence-manifest.json), registrado por root03:27:50 UTC: vincula12 artefactos a SHA-256, resultados/build y procedencia. Es un manifest de integridad/proveniencia preparado por el ejecutor, no firma externa ni certificación independiente; esta revisión no recalcula los hashes ni modifica ese archivo.
- [Matriz R01–R36](../../premium-requirements-matrix.md), [plan](../../premium-delivery-plan.md), [decisiones D01–D11](../../premium-authorization-decisions.md), [threat model](../../premium-threat-model.md), [runbook](../../premium-operations-runbook.md), [runtime credentials](../../premium-runtime-credentials.md), [plan de piloto](../../premium-pilot-plan.md) y [guía](../../premium-user-guide.md): alcance, autorización y operación; un documento preparado no demuestra su ejecución.
- `X:/CODE/NOMBRAMIENTOS/docs/premium-nominations-evidence-2026-10-01.md`: documento leído del corte Nom, no JSON reejecutado desde este índice. Informa web264, API no-live421, DB completa451 pass/3 skip (contiene el no-live346/1 skip), E2EE31, dominio41, herramientas39 y arnés aislado8/8. No sumar DB completa+no-live, subgrupos ni browser3 (ya incluidos en el browser19 GC). El arnés8 usa Fastify `inject`, PostgreSQL y criptografía reales propios; no son ocho recorridos visuales. Root comunicó cleanup independiente read-only renovado03:21:13.060 UTC PASS, cinco receipts propios y cero recursos owned remanentes. Es alcance acotado a receipts, no ausencia global de residuos ni autorización para borrar la base desconocida del estado GC.
- `services/api-gateway/src/openapi.ts`/`docs/sbom.cdx.json` y los gates de build/typecheck/lint/audit referidos por root requieren su propio comando, fecha y log. OpenAPI se deriva de la fuente; no se inventa un archivo YAML de contrato que no existe. Este índice no inventa JSON de esos comandos ni convierte «sin vulnerabilidades conocidas» en auditoría de seguridad independiente.

## Recetas de reproducción y guardas de alcance

Son comandos/flags derivados de los scripts y configuraciones **leídos**, no comandos ejecutados al elaborar el índice. Antes de renovar un archivo, conservar los intentos relevantes y anotar build/fecha. Los tests de integración, navegador, performance y restore **sí escriben fixtures propias**: solo bajo autorización, con destino y ownership verificados; nunca Central/Ozama. No ejecutar suites heredadas por comodidad.

| Objetivo | Comando / configuración pertinente | Guarda o limitación |
|---|---|---|
| Unitarias GC | `pnpm exec vitest run tests/unit --reporter=json --outputFile=<nuevo-json>` | No opt-in de integración; Vitest node. TSC/lint no se sustituyen por PASS unitario. |
| Build/verificación estática | `pnpm typecheck`; `pnpm lint`; `pnpm build`; `pnpm validate:openapi` | Comandos declarados en package.json; `build` incluye servicios+Next. Son gates separados de runtime. |
| Una suite HTTP/DB premium | Activar **solo** el flag de su fila siguiente y ejecutar `pnpm exec vitest run tests/integration/<archivo> --maxWorkers=2 --reporter=json --outputFile=<nuevo-json>` | `describe.skip` sin opt-in no acredita comportamiento. El máximo 2 reproduce el lote backend anterior; no es un ensayo de estrés. |
| Browser premium integrado | `pnpm exec playwright test --config playwright.premium.config.ts` | Dos archivos premium, worker1, sin parallel/retries, Chromium1440×900 inicial, timeout180s/expect15s, JSON en browser-results.json; screenshot/trace automáticos desactivados. Las capturas de reportes se generan explícitamente. |
| Performance local | `pnpm test:performance` | `scripts/performance-smoke.ts` rechaza producción/no-loopback y exige gateway4000; crea/destruye fixture propia y registra muestra/entorno. No SLO aprobado. |
| Estado local | `pnpm exec tsx scripts/verify-premium-local-state.ts` | Consultas PostgreSQL read-only y health HTTP con deadline5s; escribe solo JSON y falla si no cumple. No cleanup automático ni autorización de borrado. |
| Restore, preflight | `pwsh -NoProfile -File scripts/restore.ps1 -BackupDirectory <backup-propio> -VerifyOnly` | `-ConfirmRestore` es otra acción destructiva, solo destino aislado aprobado. Manifestv3 autenticado; v2 solo verify; no overwrite de configuración. Prueba live opt-in `RUN_PREMIUM_RESTORE_TESTS=1`, fixture propia; no implica restauración productiva coordinada GC/Nom/S3/custodia. |
| Arranque coordinado | `powershell -NoProfile -ExecutionPolicy Bypass -File ./start-gestionchurch.ps1 -Action Restart -Mode Native -SkipDataSetup -NoBuild` | Solo root cuando corresponda. `-SkipDataSetup` evita setup/seed/Prepare, requiere PG existente y no se mezcla con SeedDemo/Docker. `-NoBuild` exige artefacto válido; no prueba que sea el build deseado. No usar como sustituto de la regresión. |
| Scanner suplemental | `pnpm exec tsx scripts/scan-source-secrets.ts X:/CODE/GestionChurch X:/CODE/NOMBRAMIENTOS` | Salida project/file/kind, nunca valor; exit1 con findings. No se ejecutó nuevamente en esta revisión. Contexto y límites se detallan abajo. |

### Opt-ins exactos de integración

Archivo relativo a `tests/integration/`; todos los flags se comparan con el literal `'1'`. El ejemplo PowerShell de activación es `$env:RUN_PREMIUM_CALENDAR_API_TESTS='1'`. Retirar el flag al terminar o usar un proceso dedicado. Los archivos no incluidos en un JSON actual no se consideran aprobados por existir.

| Archivo | Flag | Evidencia en este corte |
|---|---|---|
| premium-calendar-api.test.ts | RUN_PREMIUM_CALENDAR_API_TESTS | backend HTTP90 |
| premium-department-atomicity-api.test.ts | RUN_PREMIUM_DEPARTMENT_ATOMICITY_API_TESTS | backend HTTP90 |
| premium-domain-atomicity-api.test.ts | RUN_PREMIUM_DOMAIN_ATOMICITY_API_TESTS | backend HTTP90 |
| premium-gateway-api.test.ts | RUN_PREMIUM_GATEWAY_API_TESTS | backend HTTP90 |
| premium-localization-api.test.ts | RUN_PREMIUM_LOCALIZATION_API_TESTS | backend HTTP90 |
| premium-nominations-identity-api.test.ts | RUN_PREMIUM_NOMINATIONS_IDENTITY_API_TESTS | backend HTTP90 |
| premium-outbox-recovery-api.test.ts | RUN_PREMIUM_OUTBOX_RECOVERY_API_TESTS | backend HTTP90 |
| premium-record-privacy-api.test.ts | RUN_PREMIUM_RECORD_PRIVACY_API_TESTS | backend HTTP90 |
| premium-reliability-api.test.ts | RUN_PREMIUM_RELIABILITY_API_TESTS | backend HTTP90 |
| department-flows-api.test.ts | RUN_DEPARTMENT_FLOW_API_TESTS | root HTTP69 |
| premium-governance-api.test.ts | RUN_PREMIUM_GOVERNANCE_TESTS | root HTTP69 |
| premium-identity-audit-api.test.ts | RUN_PREMIUM_IDENTITY_AUDIT_API_TESTS | root HTTP69 |
| premium-tenant-provision-api.test.ts | RUN_PREMIUM_TENANT_PROVISION_API_TESTS | root HTTP69 |
| premium-workspaces.test.ts | RUN_PREMIUM_WORKSPACE_TESTS | root HTTP69 |
| security-api.test.ts | RUN_SECURITY_API_TESTS | root HTTP69 |
| premium-elders-atomic-db.test.ts | RUN_PREMIUM_ELDERS_ATOMIC_DB_TESTS | DBFINAL36; también snapshot anterior DBROOT19 |
| premium-runtime-isolation.test.ts | RUN_PREMIUM_RUNTIME_ISOLATION_TESTS | DBFINAL36; también snapshot anterior DBROOT19 |
| premium-tenant-runtime-db.test.ts | RUN_PREMIUM_TENANT_RUNTIME_DB_TESTS | DBFINAL36; también snapshot anterior DBROOT19 |
| premium-reliability-db.test.ts | RUN_PREMIUM_RELIABILITY_DB_TESTS | DBFINAL36 |
| premium-read-contract-db.test.ts | RUN_PREMIUM_READ_CONTRACT_DB_TESTS | DBFINAL36 |
| premium-department-outbox-db.test.ts | RUN_PREMIUM_DEPARTMENT_OUTBOX_DB_TESTS | DBFINAL36 |
| premium-leased-client-db.test.ts | RUN_PREMIUM_LEASED_CLIENT_DB_TESTS | DBFINAL36; dos desconexiones controladas PostgreSQL |
| premium-restore.test.ts | RUN_PREMIUM_RESTORE_TESTS | Narrativa restore 1; sin JSON de esta prueba en el directorio |

`vitest.config.ts` excluye suites históricas `tests/e2e/**`, tenant-isolation y backup-restore salvo `RUN_LEGACY_GC_TESTS=1`. `playwright.config.ts` cambia a core heredado con `RUN_LEGACY_BROWSER_TESTS=1`. **No activar estos flags sobre el workspace real para aumentar conteos.** Browser premium usa `playwright.premium.config.ts`, no acredita los tres proyectos del config genérico. El helper Nom requiere receipt/nonce/marker propios; Start del módulo emplea `-NoPrepare`, nunca sync/seed general. El arnés Nom separado es opt-in `NOMBRAMIENTOS_PREMIUM_ISOLATED=true` en `apps/api/test/premium-federation-crypto.live.test.mjs`; no ejecutarlo dentro del índice.

## Escaneo suplemental: nueve findings, no «cero secretos»

El [JSON metadata actual](source-secret-scan-review.json), `scannedAt=2026-10-02T03:17:58.663Z`, registra **887 archivos, seis patrones, nueve findings, exit1**, todos `credential-bearing-database-url`, con revisión explícita de contextos dev/test. El conteo887 reemplaza al preliminar880; no se suman archivos entre scans. La revisión de estas rutas se hizo redaccionando por completo las URLs; este índice y el JSON no guardan valores de credenciales. El exit1 se conserva: contexto reconocido no equivale a scanner limpio.

| Proyecto / ruta | Contexto observado, sin valores | Tratamiento |
|---|---|---|
| GC `.github/workflows/ci.yml` | Job CI con PostgreSQL de servicio y entorno de prueba | Credenciales de CI/desarrollo en fuente; no promover a producción ni declarar scanner limpio. |
| GC `docker-compose.yml` | Comentario explícito de desarrollo local, NODE_ENV development y servicios locales | Defaults de desarrollo: revisar que nunca se distribuyan como configuración productiva. |
| Nom `apps/api/scripts/performance-scale-local.ts` | Casos `assertNonDefaultLoopbackUrl`, aceptaciones/rechazos del guard | Literales del self-test, incluidos inputs inválidos; no endpoints productivos acreditados. |
| Nom `apps/api/test/contracts.test.ts` | Inputs DATABASE_CONTROL_URL válidos/negativos del contrato | Fixture/test; coincidencia reconocida, no ignorada por el scanner. |
| Nom `apps/api/test/real-browser-stack-guards.test.ts` | `assertWorkspaceAdminUrl` y inputs rechazados | Test de destino/guardas. |
| Nom `packages/database/scripts/local-cluster.ps1` | Constructor de URLs admin/control del cluster local, salida que omite password | Herramienta local; construcción/interpolación no demuestra ausencia de secretos runtime. |
| Nom `packages/database/test/crypto.test.ts` | Input de `redactConnectionString` | Test de redacción. |
| Nom `scripts/create-ci-install.mjs` | Constructor de configuración de instalación CI | Herramienta/fixture CI; no evidencia de secret-store productivo. |
| Nom `scripts/verify-local-evidence.test.mjs` | `assertSanitized` rechaza un diagnóstico con URL | Negativa de sanitización. |

El scanner leído usa seis regex sobre extensiones de código/config, una coincidencia por patrón/archivo; excluye `.env*`, symlinks, `.git`, `.next`, `.local*`, node_modules, dist, coverage y resultados de tests. **No** escanea historial Git, entropía universal, secret-store ni documentos de distribución/runtime; `.md` no está en sus extensiones. No concluye que esas áreas estén limpias. Los contextos dev/test explican estos nueve hallazgos, pero no son aceptación de riesgo, allowlist implementada ni certificación independiente. Scanner Nom propio y scanner suplemental GC tienen alcances diferentes; sus conteos no se sustituyen.

## Correspondencia frontend acotada

| Requisito | Evidencia concreta | Lo que no cierra |
|---|---|---|
| R05 inicio por capacidades/datos honestos | `frontend-capabilities`, coordination/forecast/report evidence; browser dashboard503/retry y rutas por actores | Todos los drill-down/filtros/regreso por perfil y cada tarea del inventario. |
| R20 diseñador/formulario efectivo | Unit provenance SYSTEM/CUSTOM y validación backend; browser draft privado→preview móvil→publish→campo usado/persistido/audit, negativa no autorizado | Cada tipo/opción/variante, preview escritorio exhaustivo y claridad evaluada por personas. |
| R27 localización | i18n/locale/provenance/microcopy/PDF unitarias; 48 probes (16 rutas × ES/EN/FR), contenido escrito raw tras reload, cuatro PDF regenerados y doce páginas revisadas por root | Errores legacy/validaciones/avisos y todos los estados; revisión nativa. Legacy/custom sin provenance permanece raw intencionalmente; no promover por coincidencia de texto. No extender los ejemplos PDF a todos los datasets/glifos. |
| R28 responsive/accesibilidad | 112 probes (16 rutas × 7 anchos), Axe en siete páginas representativas, menú Escape/foco; modal/tabs y guardas source | WCAG 2.2 AA completa, procesos íntegros con NVDA/VoiceOver, Android/iPhone/Safari físicos, zoom/reflow/teclado virtual/orientación/datos largos. |
| R29 dirty/resultado incierto/expiración | Unit history/unsaved/submission/resumable/session/API; browser Back cancelado, lost-ACK actividad+File tras commit, misma identidad conserva File y exige retry humano, identidad distinta purga | Reload/cierre pierde borrador/File/keys: recuperación solo RAM de pestaña abierta. No todos los comandos/modales ni reconciliación distribuida universal. beforeunload previene, no recupera. |

R23 UI combina metadata de calendar+department outbox, errores por cola y razón/confirmación/users.manage; unitarias y HTTP prueban namespaces/atomicidad. Browser ejercita la cola calendario: no atribuirle operación de la cola departamental ni fallo parcial visual. Reprogramado no significa entregado.

## Gates obligatorios todavía abiertos

1. La regresión existente del build final ya terminó: unit352, HTTP69/90, DB36, browser19/PDF y smoke. Permanece la revisión de propiedad de una base no registrada: `servicesReady:true` no cambia `metadataReviewClear:false`/`pass:false`. Conservar el incidente real y el checker fallido; no borrar recursos desconocidos ni cerrar todos los requisitos por suites verdes.
2. Cobertura íntegra acción×actor×estado del inventario y persistencia, no solo apertura de rutas; todos los filtros, cancelaciones, errores, datos largos, permisos acumulados y negativas.
3. **D10/R26:** cookie de dispositivo Nom revocado puede escribir si su identidad conserva otra concesión. El401 por revocación central de rol prueba otro control. Vinculación criptográfica dispositivo–sesión pendiente de autorización/revisión; no implementada ni tratada como no aplicable.
4. **R29:** no recuperación tras reload/cierre de draft/File/keys, ni reconciliación de todas las escrituras. No introducir plaintext storage ni protocolo criptográfico nuevo sin autorización. Nom también conserva navegación/Back/formularios parciales.
5. Localización de todos los escenarios de sistema/errores/documentos y revisión competente ES/EN/FR; provenance legacy raw y mensajes backend legacy no se transforman en «traducción100%».
6. D07/R28/R36: lectores manuales NVDA/VoiceOver, dispositivos físicos/Safari, pruebas de procesos accesibles, piloto multirrol, validación lingüística y pentest independiente. PDF Tagged:no, PDF/UA y rangos/gráficos/textos extremos tampoco están aprobados por los doce renders. Preparar planes no equivale a ejecutarlos.
7. R31 producción: TLS/SCRAM/red/CONNECT/secret-store runtime por tenant/servicio y distribución completa para tenants nuevos; ACTIVE/local trust no certifican readiness. D05/D09 conservan límites de autorización.
8. R01/R23/R32: SMTP/Meta/NATS reales con destinatarios autorizados, ACK perdido del proveedor, durabilidad del reset-password postcommit, caídas prolongadas storage/DB/AV/broker, commit entre control/tenant y HA. No garantizar exactly-once externo ni TX distribuida.
9. R25/R26/R34: ciclo cifrado completo en navegador/ramas múltiples, historia/custodia operacional y restore coordinado GC/Nom/S3/config/claves seguido de uso HTTP; restore sintético aislado no cierra estos escenarios.
10. D08/R35: dueño debe aprobar SLO/dataset/concurrencia/red/RPO/RTO/retención; carga y Web Vitals de campo. El smoke secuencial local no define esos contratos.
11. El scanner ya tiene JSON fechado y triage dev/test; continúa la revisión restringida de secretos/runtime/historial/delivery y portabilidad de fuentes. Nueve findings no son un cero ni auditoría independiente. Los pendientes mantienen el denominador R01–R36.

## Handoff a root y vigencia del corte

Este corte incorpora la regresión terminada del build final. Futuras actualizaciones deben identificar nueva fuente/build/fecha y preservar los intentos anteriores; root mantiene por separado la matriz y el informe de entrega:

| Campo | Estado en este índice / completar por root |
|---|---|
| Fuente/build probado | `9Rs93DdT6H9Go53CnWtsV`, incluye correcciones posteriores de reportes y conexiones. No hubo cambios de aplicación en esta actualización documental |
| Build/arranque | Root comunicó full typecheck/build services/web PASS y Start oficial SkipDataSetup/NoBuild UP; status oficial23:20:45 local. Conservar logs/timestamps de operación por separado |
| Unitarias | 352/352, 52 archivos, inicio03:13:31.005, 0 omitidas; conservar primer intento350/2. Revalidar si cambia fuente y no sumar repeticiones |
| HTTP/DB | HTTP root69 inicio03:13:49.622, backend90 inicio03:14:43.224, DBFINAL36 inicio03:15:45.080, todos0 fail/pending; DB19/15 son subconjuntos repetidos |
| Browser | 19/19 (16 GC + 3 Nom), inicio03:16:20.790, 0 unexpected/skipped/flaky; mismas aserciones/scopes y runtime final asociado por root |
| PDF/CSV | Reexportados03:19:34–48; cuatro PDF×tres páginas, root abrió12 a144dpi, evidencia/hash/límites en pdf-visual-review.md |
| Performance | Medido03:20:11.373, p9510.32/9.33 ms, 80 lecturas/25 replays de una actividad, concurrencia1/loopback/freshDB; guardas no-SLO |
| Estado local | Verificado03:21:12.389, cuatro200/`servicesReady:true`, PG18 existente/originales canónicos. `metadataReviewClear:false`/`pass:false` por DB desconocida1 preservada; no cierre de ownership |
| Scanner | JSON03:17:58.663, 887 archivos/6 patrones/9 findings, exit1; solo project/file/kind y contextos, nunca valores |
| Histórico | Intentos fallidos conservados y previous-deA8EC3/ con browser/performance/cuatro PDF anteriores; no sumar ni borrar |
| Gates humanos/productivos/D10/R29 | Permanecen abiertos salvo autorización+implementación+prueba real posterior, no se reclasifican por suite verde |

**Conclusión de este corte: evidencia local sustancial, alcance incompleto y salida productiva no aprobada.** No se declara 100%, conformidad WCAG integral ni superioridad competitiva a partir de estos conteos.
