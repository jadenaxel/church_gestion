# Recorrido de APIs departamentales — 1 de octubre de 2026

## Alcance y límites

Se revisaron los servicios de operaciones departamentales, Ministerios Personales, Ministerio de la Mujer, Ancianos, archivos/documentos y calendario. La nueva suite `tests/integration/department-flows-api.test.ts` recorre flujos HTTP conectados mediante el gateway local, con sesiones y roles reales de usuarios sintéticos.

Cada ejecución crea dos iglesias `flows-*`, con identificadores UUID nuevos y bases PostgreSQL propias. Solo inserta sus entradas de enrutamiento en la base de control. El cleanup comprueba identidad, slug y nombre de base antes de eliminar exclusivamente esos fixtures y sus directorios de archivos. No usa cuentas, departamentos, documentos, actividades ni padrón de Central u Ozama. No se ejecutaron las suites `tests/e2e`, porque sus fixtures actuales escriben en Central. No se enviaron comunicaciones a personas reales.

Esto verifica los flujos enumerados, no cada combinación de pantalla, rol, proveedor externo o estado del sistema. La navegación y accesibilidad del frontend se registran por separado. No certifica ausencia de vulnerabilidades ni sustituye pruebas de producción.

## Defectos reproducidos y corregidos

| Defecto | Reproducción sintética | Corrección |
|---|---|---|
| Referencias entre espacios departamentales sin validar | Cinco solicitudes aceptadas con HTTP 201: iniciativa con plan ajeno, presupuesto con iniciativa ajena, tarea con iniciativa ajena, acuerdo con reunión ajena y acuerdo con iniciativa ajena. Una partida podía contaminar los costos de otro departamento y una tarea podía revelar el título de una iniciativa ajena. | Se comprueba que cada referencia pertenece al workspace seleccionado antes de escribir. Se reutiliza la validación existente de recursos departamentales. |
| Seguimiento de Mujer asignable a usuarios sin acceso al módulo | Una directora creó con HTTP 201 un seguimiento para un `VIEWER` sin membresía de Mujer; la lógica generaba un aviso con el motivo del seguimiento. | Se exige usuario activo y acceso actual a Mujer antes de asignar responsables o seguimientos, tanto en creación como en reasignación. |
| Ancianos sin revalidación de perfil al editar | Editar una rotación aceptó con HTTP 200 un usuario `VIEWER` como anciano, aunque la creación rechaza ese perfil. La edición de programas tenía la misma omisión. | Se revalidan rol y estado activo al cambiar personas; se rechazan duplicados de ancianos y rangos parciales de fechas invertidos antes de escribir. |
| Documentos de liderazgo visibles a integrantes de consulta | El listado incluyó un documento `LEADERSHIP` para un `VIEWER` con membresía departamental. Preview, descarga y enlace temporal compartían la política permisiva. | Liderazgo de iglesia, autor y dirección/secretaría del departamento conservan acceso; pertenecer al equipo como `VIEWER` o `PLANNER` no concede acceso a documentos de liderazgo ajenos. `DEPARTMENT` sigue visible al equipo. |
| Aprobación financiera evadible en creación | Un director sin `canApprove` recibe HTTP 403 al aprobar una partida existente, pero pudo crear partidas directamente `APPROVED` y `PAID` con HTTP 201; la creación no registraba aprobador ni fecha. | Los estados iniciales aprobados/pagados exigen la misma autoridad de aprobación y registran usuario/fecha. La creación ordinaria `PLANNED` permanece disponible a responsables financieros. |

La validación de responsables en operaciones departamentales también excluye usuarios inactivos. No cambia datos existentes ni impone migraciones.

## Cobertura automatizada

La suite contiene 17 casos con varios pasos y comprobaciones positivas y negativas:

| Área | Flujo verificado |
|---|---|
| Catálogo y permisos | Aplicaciones derivadas de roles/membresías; rechazo de otros departamentos y tenants. |
| Operaciones departamentales | Plan y aprobación, objetivo, iniciativa y asignación, finanzas, tarea, reunión/acta, acuerdo, comentario/mención, KPI, registro, contexto y exportaciones PDF/CSV. |
| Referencias departamentales | Rechazo de las cinco referencias cruzadas enumeradas; ausencia de gastos y títulos ajenos en los contextos. |
| Gobierno financiero | Misma autoridad de aprobación al crear o revisar partidas; actor y fecha en estados iniciales aprobados/pagados. |
| Ministerios Personales | Plan, iniciativa, presupuesto/compromiso/gasto/ingreso/anulación, interesado, estudio bíblico, grupo pequeño, minuto misionero, campaña, calendario y rechazo de asignación ajena. |
| Padrón y fotos | Preview de importación válida/inválida, confirmación, rechazo de segundo commit, sincronización de mujeres, fotografía y aislamiento de descarga. |
| Documentos | Carga, versiones secuenciales, preview, revisión de alineación, retirada de una versión y supervivencia de otra; privacidad de liderazgo y acceso de su autor. |
| Calendario | Envío/aprobación, adjuntos, restricciones tras aprobación, disponibilidad y liberación al cancelar. |
| Reintentos y alternativas | Creación idempotente y confirmación de segunda fecha disponible. |
| Conflicto y revisión | Envíos concurrentes serializados, conflicto, solicitud de revisión, sugerencia y alternativa, recomendación, decisión por Secretaría y rechazo de decisión final por administrador. |
| Cambios aprobados | Bloqueo de edición directa por director, solicitud/decisión autorizada y rechazo de versión obsoleta. |
| Junta y agenda | Elegibilidad, convocatoria, agenda personal, confirmación de asistencia, permisos y cierre con acta. |
| Ministerio de la Mujer | Perfil, enlace al calendario, actividad, presupuesto, participación, retiro, inscripción, pagos parciales/completos y seguimiento. |
| Asignaciones de Mujer | Rechazo antes de escribir o avisar a usuarios ajenos e inactivos, reasignación protegida y responsable de actividad autorizado. |
| Ancianos | Rotación, programa propio, plantilla/plataforma, publicación y carácter informativo sin reservar calendario. |
| Edición de Ancianos | Rechazo de no ancianos, inactivos, duplicados y fechas invertidas, conservando los valores previos. |

Resultado final, después del restart coordinado por el agente principal: **17 pruebas HTTP aprobadas de 17, sin omitidas**. La suite unitaria existente de autorización departamental también se ejecutó: **10 pruebas aprobadas de 10**. El typecheck de servicios y el lint de los cuatro servicios modificados y la nueva suite pasan.

El cleanup verifica que cada entrada de tenant, base y directorio de archivos propio dejó de existir. La comprobación agregada adicional encontró **0 tenants `flows-*` remanentes**. Los conteos corresponden a la última ejecución completa; no suman las repeticiones ni las pruebas de exploración.

## Reproducción segura

Con servicios locales activos y configuración local habitual cargada por los paquetes:

```powershell
$env:RUN_DEPARTMENT_FLOW_API_TESTS='1'
pnpm exec vitest run tests/integration/department-flows-api.test.ts
pnpm exec vitest run tests/unit/department-authorization.test.ts
```

Sin el flag explícito, los 17 casos HTTP se omiten y no provisionan iglesias.

No usar `pnpm test` o las suites E2E genéricas como reemplazo de esta selección: varias de ellas usan cuentas de Central y pueden dejar escrituras persistentes. El resultado de esta suite debe contarse una sola vez; las ejecuciones exploratorias fallidas o parciales no aumentan el total de comprobaciones finales aprobadas.
