# Informe de entrega — consolidación premium GestionChurch / Nombramientos

> Corte histórico de04:21UTC del2oct. D10 fue autorizado después de este corte, implementado y verificado localmente con API480/26omisiones, DB479/7omisiones, E2EE43, arnés propio13 y navegador4/4; son conjuntos separados, no se suman. Evidencia y cierre read-only de16:16UTC en [el informe de sesiones por navegador](premium-device-sessions-2026-10-02.md). Las referencias inferiores a D10 pendiente de autorización describen el corte histórico, no el estado actual. Los resultados anteriores se conservan sin reatribuirlos al protocolo nuevo. Este documento de seguimiento incorpora avisos posteriores; su hash actual no debe confundirse con el hash del informe archivado en el manifiesto anterior. La autorización productiva global y los demás gates no cambian por este alcance; metadata conservafalse por una DB de propietario desconocido preservada.

Ejecución: 1–2 de octubre de 2026, America/La_Paz. Corte técnico actual: 02-10-2026 04:21 UTC; revisión PDF posterior de las doce páginas. Build web `m3K6tJtdsnu8HBjapaS00`. Alcance: [prompt autorizado](../prompt-ultra-premium-end-to-end.md), [inventario de acciones](premium-action-inventory.md) y [matriz R01–R36](premium-requirements-matrix.md). No se excluyeron requisitos ni se redujo el denominador para declarar un porcentaje. El [manifiesto](premium-evidence/2026-10-01/release-evidence-manifest.json) identifica artefactos y sus SHA-256; no firma ni certifica todo el código.

## Dictamen

**Entrega incompleta; salida productiva no aprobada.** Las correcciones implementadas y las pruebas locales actuales pasaron. Permanecen trabajo técnico, una autorización criptográfica específica y validaciones humanas/productivas; no se declara 100% verificado, seguridad absoluta, certificación WCAG, disponibilidad productiva ni superioridad frente a otros productos.

Aplicación local arriba: [GestionChurch](http://localhost:3000), gateway4000 y Nombramientos3300/API4100. Estado oficial 02-10 00:21:54-04:00 y [snapshot read-only](premium-evidence/2026-10-01/final-local-state.json) 04:21:49 UTC: los cuatro HTTP200 y PostgreSQL18 existente. Arranque oficial Native `-SkipDataSetup -NoBuild`, sin seed ni sincronización general.

El cierre anterior `9Rs93DdT6H9Go53CnWtsV` y sus 47 artefactos se conservaron en `premium-evidence/2026-10-01/previous-9Rs93Dd/`; `previous-deA8EC3/` conserva un corte más antiguo. Sus conteos no se atribuyen al build nuevo ni se suman a las repeticiones actuales.

## Correcciones implementadas

- **Experiencia/idiomas:** marca y funciones conservadas; navegación por responsabilidad, estados de carga/error/vacío, foco/teclado, reflow y controles táctiles. Localización declarativa ES/EN/FR, preferencias por identidad y zona horaria independiente. Contenido escrito por personas y etiquetas históricas sin provenance se preservan raw; revisión lingüística competente y todos los estados siguen pendientes.
- **Guardado explícito:** Nueva actividad permite guardar un formulario completo válido y sus adjuntos confirmados como DRAFT, sin enviarlo ni reservar fecha. Se probó reapertura desde otra pestaña, pérdida de ACK de actividad/archivo y retry con las mismas claves, sin duplicados. No es autoguardado universal: formularios incompletos o archivos/operaciones aún inciertos permanecen en RAM y pueden perderse al cerrar/recargar.
- **Edición sin pérdida de datos:** se retiraron defaults de creación de los PATCH parciales de actividad, departamento, rotación/programa de Ancianos y registro de retiro de Mujer. Un cambio de título/importe no vacía otros datos ni reabre un programa publicado. Datos personalizados se validan con el snapshot guardado con la actividad; campos ocultos/retirados conservan su valor y se rechaza alterarlos. El flujo de cambio aprobado sigue requiriendo autorización, conserva versión y persiste customData al aprobar. No acredita todas las ediciones de recurrencia o todas las variantes del diseñador.
- **Calendario/gobierno:** reservas y alternativas concurrentes, prioridad de primera solicitud, idempotencia, cambios/versiones y negativas para modificar/cancelar directamente una actividad aprobada. Convocatoria, RSVP, asistencia y acta conservan autoridades/estados; envío no equivale a confirmación ni asistencia.
- **Departamentos/dominios:** autorización tenant/workspace, responsables válidos, privacidad mínima efectiva en registros históricos y monedas segregadas. Negocio/auditoría/aviso o intención durable en la misma transacción para PM, Mujer, Hub y operaciones probadas de Ancianos; rollback de fallo audit y retry positivo comprobados. No se añadieron cargos de QA a personas reales.
- **Recuperación de contraseña durable:** token, auditoría e intención cifrada ahora confirman juntos. Worker recuperable con lease/fencing y UUID estable, aceptación interna deduplicada, retiros por token usado/vencido/cuenta inactiva y payload eliminado al retirar/aceptar. Alertas muestra la tercera cola Identidad, solo metadata, vencimiento y causa; retry exige permiso vigente/razón auditada, no reactiva un token retirado. Se cerró la ausencia de outbox para solicitudes nuevas, no entrega real de SMTP ni cancelación distribuida de mensajes ya aceptados.
- **Conciliación control/tenant:** actualización de configuración registra intención durable, versión/hash y receipt de etapa. 200 exige estado completado/coherente; PENDING devuelve503 explícito y conflicto409. Pruebas incluyen PostgreSQL COMMIT real seguido de ACK perdido, proceso worker nuevo, concurrencia y auditoría. Cambios independientes posteriores de Calendar se detectan sin sobrescritura automática. No es transacción distribuida ni UX completa de resolución de conflictos.
- **Fiabilidad/archivos:** recibos actor/clave/hash, bloqueo de versiones, idempotencia de actividades, archivos, pagos y vínculos; compensación de objetos nuevos. Inbox/outbox, límites de transporte, replay firmado y estado Meta monotónico. La desconexión de un cliente PostgreSQL prestado —que antes podía detener notification-service y el stack— se corrigió: conexión rota descartada y COMMIT incierto no presentado como éxito ni repetido ciegamente.
- **Nombramientos:** guía contextual, SSO/sourceSessionId/revocación, borrador guiado, cifrado e historia en arnés propio. D11 aprobado: GestionChurch es fuente central de comisión/custodia explícitas; administrador no obtiene automáticamente voto o custodia. El vínculo HTTP criptográfico dispositivo–sesión D10 sigue pendiente.
- **Reportes:** señales con evidencia, sin puntualidad inventada ni probabilidades perfectas; monedas no comparables separadas. Decimal/plural y gráfico mes+año corregidos. Cuatro PDF sintéticos nuevos y sus doce páginas se inspeccionaron visualmente después de exportar; no superposición/corte en esas muestras. [QA visual y límites](premium-evidence/2026-10-01/pdf-visual-review.md).

Detalle: [backend](premium-evidence/2026-10-01/backend-reliability.md), [outbox Identidad](premium-evidence/2026-10-01/password-reset-outbox.md), [conciliación](premium-evidence/2026-10-01/tenant-settings-reconciliation-db.json), [frontend UX](premium-evidence/2026-10-01/frontend-ux.md), [amenazas](premium-threat-model.md), [Nombramientos](X:/CODE/NOMBRAMIENTOS/docs/premium-nominations-evidence-2026-10-01.md). Las auditorías previas de septiembre/octubre son antecedentes, no pases nuevos.

## Evidencia actual, sin sumar repeticiones

| Conjunto | Resultado | Alcance / límite |
|---|---:|---|
| [GC UNIT](premium-evidence/2026-10-01/gc-unit-results.json) | **395/395 PASS**, 57 archivos | 0 fallos/omitidas. Incluye guardado explícito, snapshot/customData, PATCH parcial, conexiones, reset y conciliación; selecciones focales no se suman otra vez. |
| [GC ROOT HTTP](premium-evidence/2026-10-01/gc-root-api-results.json) | **69/69 PASS**, 6 archivos | Gobierno7, workspaces14, seguridad16, flujos departamentales17, identidad/audit12, provisionamiento3. Los tres de configuración se ejecutaron aquí, no solo se prepararon. |
| [GC BACK HTTP](premium-evidence/2026-10-01/gc-backend-api-results.json) | **103/103 PASS**, 10 archivos | Fiabilidad12, calendario9, localización6, gateway1, identidad Nom4, privacidad2, recuperación7, PM/Mujer31, Hub23 y reset8. 0 omitidas. |
| [GC DB](premium-evidence/2026-10-01/gc-db-final-results.json) | **66/66 PASS**, 9 archivos | Ancianos15/runtime2/tenancy3/reliability8/SQL3/Hub4/conexiones2/reset17/conciliación12. Controlador/PostgreSQL/ACL, no HTTP; no sumar subconjuntos históricos. |
| [Browser integrado](premium-evidence/2026-10-01/browser-results.json) | **21/21 PASS** | **18 GC + 3 Nom**, 0 fallos/omitidas/flaky. Chromium, un worker, sin retry automático; empieza04:12:42.610UTC. |
| GC browser, incluido arriba | **18/18 PASS** | Responsive, roles, dashboard, diseñador, idiomas, reportes, cambios, expiración, ACK perdido, recuperación, guardado DRAFT y metadata de Identidad. 112 probes de anchura y48 de idioma forman parte de esos escenarios, no acciones extra ni cobertura universal. |
| Nom browser, incluido arriba | **3/3 PASS** | SSO/retorno/admin sin custodia automática, borrador2027 persistido y retiro central de rol con401. No es ciclo cifrado completo por navegador. |
| Nom API/crypto histórico propio | **8/8 PASS** | Fastify/inject, PostgreSQL y cifrado reales aislados, ciclo de un cargo/recovery/restore. No reejecutado en este corte; no son ocho ciclos visuales ni se suman a browser3. |

Typecheck, build servicios/web y lint PASS; la repetición estática posterior a documentación comprobó **305 archivos** sin fixes, OpenAPI **153 rutas** PASS y `pnpm audit --prod` sin vulnerabilidades conocidas. El conteo lint incluye artefactos/configuración y no es cantidad de módulos ni cobertura. SBOM CycloneDX1.7 actualizado. El primer intento de regeneración SBOM sin formato falló por argumentos y se repitió correctamente con `pnpm generate:sbom`; no se altera dependencia ni se oculta el fallo. Estos gates no son pentest.

[Scanner suplemental](premium-evidence/2026-10-01/source-secret-scan-review.json): **938 archivos, seis patrones, nueve findings y EXIT1**. Hallazgos retenidos en URLs de contextos dev/CI/test, sin publicar valores. No se declara cero secretos; quedan fuera entropía/historial/vault/runtime y documentos de credenciales.

[Smoke final](premium-evidence/2026-10-01/performance-final.json),04:21:29UTC:80 lecturas/25 replays de una actividad, concurrencia1, loopback, tenant vacío sintético. p95 lecturas **10,06ms**, comandos **12,85ms**. No carga productiva, SLO aprobado ni Web Vitals de campo. El [índice](premium-evidence/2026-10-01/evidence-index.md) contiene archivos/flags y guardas; no ejecutar suites heredadas contra iglesias reales para aumentar conteos.

Intentos fallidos preservados: anteriores browser/backend y `gc-unit-new-cut-first-attempt.json` (389PASS/1FAIL por detector DDL como DML), `gc-new-cut-target-api-results.json` (41PASS/2FAIL por fixture de formulario con menos opciones que su mínimo). Se corrigieron fixtures/selectores sin relajar políticas. El primer fallo de expiración reset fue real —microsegundos perdidos por JS Date— y su SQL se corrigió. Nada de ello se cuenta como pases extra.

## Protección de datos y DDL real acotada

QA usó tenants/bases/cuentas/archivos sintéticos propios. Cada teardown verificó ownership exacto y ausencia de sus recursos; trazas de auditoría que deben conservarse no se borraron. No se hizo QA de negocio contra Central/Ozama; tampoco se asignaron cargos reales por QA, se rotaron secretos/claves ni se enviaron avisos de prueba a miembros.

Sí hubo cambios aditivos de esquema en originales; no sería correcto decir que nada cambió en sus bases:

| Área | Cambio real mínimo | Límites |
|---|---|---|
| Fiabilidad GC / dos originales |10 columnas nullable + índice de idempotencia | Sin full-migrate, seed, backfill o DML QA de negocio. |
| Hub / dos originales | Una tabla + índice de outbox, ACL de defaults existentes | Sin grants cross-domain ni mensajes QA reales. |
| Tenancy / dos originales | Grants mínimos del rol NOLOGIN `gc_tenant_service` | Sin nuevos secretos/logins runtime personales ni cargos. |
| Identidad / dos originales | Una tabla + índice de outbox reset | Defaults identity verificados; cero grants/backfill. |
| Control GC | Una tabla + dos índices de conciliación; REVOKE PUBLIC | Inventario tenant/audit protegido intacto; cero DML de negocio. |
| Nom control/tenants exactos | Migraciones aditivas031/032/038 de sesiones/roles explícitos | Sin sync general, cargos de cuentas reales o sustitución de custodia cifrada. |

Las dos últimas adiciones GC fueron aplicadas y verificadas a03:59:40UTC: [receipt de esquema](premium-evidence/2026-10-01/additive-recovery-schema.json). Se utilizó el **PostgreSQL18 existente; no se instaló otra versión**.

El snapshot final registra `servicesReady:true`, dos iglesias originales canónicas, cero registros sintéticos/globales temporales/logins no registrados, pero **una base tenant no registrada de propiedad no acreditada**: `metadataReviewClear:false` y `pass:false`. No se eliminó ni se asumió que era fixture propio. Cero recursos propios no es ausencia global de bases desconocidas.

Nom read-only04:21:41UTC: seis receipts propios PASS, cero recursos/secretrefs owned remanentes, tres ledgers originales/control32/tenant40 sin pendientes ni cambios. El checker no certifica integridad de auditoría retenida ni autoriza borrar la base desconocida.

## Pendientes obligatorios

| Pendiente | Estado / cierre necesario |
|---|---|
| **D10 / R26: sesión–dispositivo Nom** | **BLOCKED_AUTHORIZATION.** Cookie del dispositivo revocado puede operar si la identidad conserva otro grant. Hace falta autorización específica para vinculación criptográfica, implementación/revisión y negativa de cookieB tras revokeB mientrasA sigue válido. D11/401 por retiro de rol no resuelven este control. |
| **R29: recuperación integral** | Guardado válido server-confirmed está implementado; formularios incompletos, archivos/keys inciertos tras cerrar/recargar y todos los demás comandos no están cubiertos. No introducir plaintext sensible ni confundir beforeunload con recuperación. |
| **R19/R32/R34: consistencia/recovery** | Conciliación de configuración nueva tiene intención/receipts y pruebas; sigue UX operativa, todos los comandos, storage/DB prolongadamente caídos y backup coordinado GC/Nom/objetos/config/custodia. No se promete atomicidad distribuida. |
| **R31: runtime de tenants nuevos** | Provider fail-closed y ACL local probados; distribución productiva de credenciales por tenant/dominio, secret-store, CONNECT/SCRAM/TLS/red/rotación y staging siguen pendientes. ACTIVE no prueba diez dominios listos. |
| **R23: infraestructura/proveedores** | SMTP/Meta/NATS/storage/AV reales, destinatarios autorizados, pérdida de ACK del proveedor, múltiples workers y monitoreo no validados aquí. No exactamente una entrega externa. |
| **D08/R35: objetivos operativos** | Dueño debe acordar SLO/carga/retención/RPO/RTO/HA/DR; después medir con dataset/red/concurrencia representativos y restauración coordinada. El smoke no define contratos. |
| **D07/R28/R36: humanos y físico** | Diferido por el usuario hasta después de correcciones: piloto multirrol, revisión ES/EN/FR, Android/iPhone/lectores/Safari físicos y evaluación independiente. PDF Tagged:no; no PDF/UA aprobado. No se contactó a terceros ni se inventó aceptación. |
| **D03: MFA global** | Diferido; no habilitado por esta ejecución. Eliminar requisito local Nom no sustituye el control futuro. |
| **R01–R36: cobertura total** | Faltan ejecuciones positivas/negativas/persistencia para toda acción×actor×estado, datos largos y ciclo Nom completo por navegador; 21 escenarios no equivalen a todas las opciones. |
| **Base no registrada** | UNKNOWN: clasificación read-only/decisión específica de propietario, nunca borrado inferido por nombre. |
| **Secretos/fuentes/PDF** | Triage de nueve findings no es aceptación de riesgo ni scanner limpio; revisar distribución/historial/vault/portabilidad y legibilidad extrema. |

No se convierte pendiente en “no aplicable”. Riesgo aceptado tampoco significa control implementado. Pruebas verdes locales no cierran todos los requisitos del prompt.

## Entrega y continuación

[Guía por roles ES/EN/FR](premium-user-guide.md), [operación/backup/rollback](premium-operations-runbook.md), [runtime credentials](premium-runtime-credentials.md), [plan del piloto](premium-pilot-plan.md), [decisiones](premium-authorization-decisions.md), [plan de ejecución](premium-delivery-plan.md) y [matriz](premium-requirements-matrix.md).

El siguiente cambio de protocolo D10 exige respuesta del propietario; quedan además los pendientes técnicos y preparación de staging enumerados. El piloto se coordina después de correcciones conforme a D07. Mientras estos gates no se implementen y validen, el estado continúa **incompleto y sin aprobación productiva**.
