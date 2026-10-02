# Revisión de experiencia, seguridad y flujos — GestionChurch y Nombramientos

Fecha local: 1 de octubre de 2026. Entorno: Windows, servicios locales y PostgreSQL aislado. Estado: revisión completada para el alcance detallado abajo; no es certificación productiva ni evaluación comparativa del mercado.

## Resultado disponible y procedencia

Se corrigieron defectos reproducidos en autorización departamental, gobierno financiero, asignaciones, privacidad de documentos y validación de ancianos, además de problemas de interacción, errores, cancelación de peticiones y presentación responsive. La corrida final de GestionChurch aprobó 205 pruebas en 16 archivos: 171 unitarias, 17 HTTP de seguridad/aislamiento y 17 HTTP departamentales. En Nombramientos las selecciones documentadas suman 1.094 aprobadas y 1 omitida.

Este documento consolida la evidencia de hoy sin sustituir ni modificar el [informe de flujos departamentales](department-flows-audit-2026-10-01.md) y la [auditoría de seguridad del 30 de septiembre](security-audit-2026-09-30.md). Los resultados del 30 de septiembre son antecedentes; no se suman como nuevas pruebas del 1 de octubre.

No se presenta una certificación de funcionamiento de cada opción, de accesibilidad, de ausencia de vulnerabilidades o de preparación productiva. Abrir una ruta o pestaña permite revisar su presentación y navegación, pero no demuestra por sí solo que todos sus formularios, permisos, estados y operaciones persistentes funcionen.

## Protecciones sobre los datos de iglesia

La suite departamental crea dos tenants `flows-*` con UUID nuevos y bases propias por ejecución. Las escrituras se limitan a esos datos sintéticos y sus entradas de enrutamiento en la base de control. Su cleanup comprueba propiedad, slug, nombre de base y ruta antes de eliminar sus fixtures; al finalizar comprueba que las entradas de tenant, las bases y los directorios propios dejaron de existir. La consulta adicional encontró **0 tenants `flows-*` remanentes**.

La selección HTTP de seguridad y aislamiento también utiliza fixtures aislados. No se ejecutaron las suites departamentales `tests/e2e`, porque sus fixtures actuales escriben en Central. En Nombramientos se seleccionaron pruebas sin suites live contra datos existentes. No se enviaron mensajes a personas reales, no se rotaron credenciales reales y no se publicaron cambios en Internet.

Las correcciones departamentales no modifican registros existentes de Ozama ni requieren migraciones. El reinicio oficial sí ejecutó las migraciones y sincronizaciones aditivas previstas por el launcher; no se insertaron actividades, convocatorias ni participantes de prueba en Ozama. La base vacía sin registro cuya propiedad no pudo acreditarse en la auditoría anterior conserva el tratamiento documentado allí: no forma parte del cleanup de estos fixtures.

## Correcciones backend reproducidas

| Problema confirmado | Antes | Comportamiento corregido y evidencia |
|---|---|---|
| Referencias entre espacios departamentales | Cinco solicitudes aceptaban con HTTP 201 un plan, iniciativa o reunión de otro workspace. Un presupuesto podía alterar el costo agregado de otra iniciativa y una tarea podía revelar su título. | Iniciativas, partidas, tareas y acuerdos comprueban pertenencia de cada referencia al workspace seleccionado antes de escribir. Las cinco solicitudes reciben HTTP 400, sin costos ni títulos ajenos en los contextos. |
| Aprobación financiera evadible en creación | Un director recibía HTTP 403 al aprobar una partida existente, pero podía crear directamente partidas `APPROVED` o `PAID` con HTTP 201, sin aprobador ni fecha. | Los estados iniciales aprobados/pagados exigen `canApprove` y registran usuario/fecha. La creación normal `PLANNED` sigue disponible al responsable financiero. |
| Seguimientos de Mujer hacia usuarios sin acceso | Una directora creó con HTTP 201 un seguimiento para un `VIEWER` ajeno al equipo; la lógica generaba un aviso con el motivo del seguimiento. | Responsables y destinatarios deben estar activos y poder leer Mujer. Se comprueba antes de crear, reasignar o avisar. Las pruebas rechazan usuarios ajenos e inactivos sin guardar el seguimiento indebido. |
| Perfiles de Ancianos sin revalidación al editar | Editar una rotación aceptaba con HTTP 200 un usuario `VIEWER`; la edición de programas tenía la misma omisión respecto de la creación. | Se revalida el perfil activo al cambiar personas. También se rechazan duplicados y rangos parciales invertidos antes de escribir, conservando el valor anterior. |
| Documentos de liderazgo visibles a consulta | Un documento `LEADERSHIP` aparecía para un `VIEWER` por su simple membresía departamental; preview, descarga y enlace temporal compartían esa política. | Acceso de liderazgo, autor o dirección/secretaría del departamento. Un `VIEWER` y un `PLANNER` no leen documentos de liderazgo ajenos; el autor conserva acceso. Los documentos `DEPARTMENT` siguen disponibles al equipo. |

Los cambios están en los servicios de operaciones departamentales, Mujer, Ancianos y archivos. La validación de responsables departamentales también excluye usuarios inactivos. Se conservaron las políticas anteriores de privacidad de actividades, fotografías, comentarios restringidos y sesiones federadas.

## Matriz de módulos y alcance demostrado

| Módulo o área | Evidencia disponible hoy | Alcance pendiente o no demostrado |
|---|---|---|
| Login, login global y recuperación | Login local inicialmente vacío, conserva usuario al volver al foco, acceso y cierre con dos roles demostrativos comprobados. Pruebas de sesión/recuperación y estado sin token. | Login global no completado en navegador; entrega de recuperación mediante proveedores reales. |
| Panel y navegación | 23 entradas de GestionChurch alcanzadas; KPIs de tres columnas en escritorio, marcador de salud sin cubrir el texto móvil y ancho final de página 1.265/1.265 px, sin desbordamiento. | No equivale a todas las rutas del repositorio ni a cada combinación de rol, idioma, dispositivo y estado. |
| Calendario y actividades | HTTP: creación, envío, aprobación, adjuntos, disponibilidad, cancelación y liberación de reserva; reintento idempotente y segunda fecha libre. | Todas las variantes de recurrencia, zonas horarias, recursos y capacidad con usuarios simultáneos a escala productiva. |
| Conflictos, revisión y juntas | HTTP: reservas concurrentes, conflicto, solicitud, sugerencia/alternativa, recomendación y decisión por Secretaría; cambio autorizado con versión y rechazo de versión obsoleta; convocatoria, agenda, asistencia y acta. UI: departamento, fecha y envío previo visibles en el conflicto; creación de junta cancelada. Contadores y estado de juntas traducidos comprobados tras el build final. | Una creación cancelada no demuestra persistencia desde navegador. Todas las decisiones por rol, recordatorios y entrega externa efectiva. |
| Operaciones departamentales | HTTP: plan/aprobación, objetivo, iniciativa/asignación, finanzas, tarea, reunión/acta, acuerdo, comentario/mención, KPI, registro, contexto y PDF/CSV; cinco referencias cruzadas rechazadas. UI: 48 pestañas de los seis espacios disponibles en Central, sin errores visibles. | Departamentos no presentes en Central, cada registro especializado y todas las combinaciones de roles en navegador. |
| Gobierno financiero | HTTP: autoridad coherente de aprobación y trazabilidad del aprobador; aislamiento de referencias y agregado de gastos. | No es auditoría contable, conciliación bancaria ni validación de reglas financieras de cada iglesia. |
| Ministerios Personales | HTTP: plan, iniciativa, compromiso/gasto/ingreso/anulación, interesado, estudio bíblico, grupo pequeño, minuto misionero, campaña y calendario. UI: ocho pestañas revisadas; etiquetas observadas y presupuesto aprobado comprobados en francés. | Cada opción de edición y transición de estado con todos los roles; revisión lingüística completa. |
| Ministerio de la Mujer | HTTP: perfil, actividad enlazada al calendario, presupuesto, participación, retiro, inscripción, pagos y seguimiento; responsables protegidos. UI informó cinco pestañas revisadas. | Todas las combinaciones de capacidad, listas de espera, cumpleaños y contacto externo real. |
| Ancianos | HTTP: rotación, programa propio, plantilla/plataforma, publicación informativa sin reserva de calendario; edición protege roles activos y fechas. UI: cinco pestañas revisadas y asignaciones/programas enlazados desde el calendario. | Todas las variantes del plan anual, medios y cobertura departamental. |
| Padrón y fotografías | HTTP: preview con filas válidas/inválidas, commit, rechazo de segundo commit, sincronización de mujeres, foto y aislamiento de lectura. | Importación de todos los formatos/tamaños posibles; confirmación de flujos UI persistentes sin usar datos reales. |
| Documentos | HTTP: cargas, versiones secuenciales, preview, alineación, retirada de una versión y permanencia de otra; privacidad de liderazgo en listado, preview, descarga y enlaces temporales. | Versionado concurrente y todos los formatos admitidos. Escaneo antivirus y almacenamiento productivos. |
| Reportes, exportaciones y auditoría | PDF/CSV departamentales verificados; controles de permisos en exportación, CSV de excepciones y consistencia de auditoría informados por el agente principal; se mantienen las protecciones CSV/ICS previas. | Todas las combinaciones de filtros y reportes; verificación de herramientas consumidoras y retención productiva. |
| Notificaciones y configuración de canales | Confirmación de lectura después de respuesta del servidor informada; controles de roles y aislamiento; las asignaciones sintéticas generan flujos internos. | SMTP/Meta, consentimiento, webhooks y entrega con credenciales reales. No se enviaron mensajes a personas. |
| Usuarios y departamentos | Catálogo derivado de membresías/roles; rechazo de accesos ajenos, perfiles inactivos y cruces de tenants. | Revisión visual completa de alta/edición/baja y todos los permisos administrativos desde navegador. |
| Diseñador de formulario de actividad | Desbordamiento corregido; preview de escritorio/móvil revisado y cancelado. | Publicación y aplicación persistente del diseño desde navegador con todos los tipos de campo. |
| Nombramientos | SSO desde GestionChurch y retorno comprobados; 13 secciones alcanzadas; roles/permisos/asignaciones cargan sin los 401/403 anteriores. Asistente de tres pasos revisado y cancelado antes de crear período. API, web, DB, dominio, E2EE y verificación automatizados. | Central no tiene contenido cifrado accesible en esta sesión: miembros, junta, sesión, resultados y reportes requieren concesión/clave válida. No se creó un ciclo ni se ejecutó votación desde navegador. Crear borrador no inicializa E2EE ni importa el padrón. |

## Cambios de interacción

Se corrigió la conservación de lo escrito al enfocar el login, se muestran errores de modales dentro de su contexto y las peticiones permiten timeout/cancelación sin reintentos automáticos. La creación de actividades mantiene una clave de reintento estable y la lectura de avisos se confirma después de que el servidor la guarda. También se corrigió la consistencia entre el filtro de excepciones de auditoría y su CSV, los controles de permisos en exportaciones, el estado de recuperación sin token y los títulos de ruta.

Estos cambios buscan reducir pérdida de información, duplicados y señales de éxito prematuras. La inspección técnica no sustituye pruebas de uso con personas mayores, usuarios con distintas capacidades o herramientas de asistencia; no se afirma que esa evaluación haya ocurrido.

## Recorrido de navegador y correcciones de experiencia

Se recorrieron 23 entradas de GestionChurch en escritorio, celular 390×844 y tablet 820×1180: panel, alertas, calendario, nueva actividad, revisión, reportes, directorio ministerial, Adoración, Ancianos, Jóvenes, Mayordomía, Mujer, Infantil, Ministerios Personales, Música, Publicidad, documentos, departamentos, padrón, equipo, diseñador, canales y auditoría. La entrada adicional de Nombramientos se comprobó mediante SSO. Las 23 pantallas en celular cargaron sin alertas de error ni desbordamiento horizontal de la página; las tablas/listas mantienen scroll local.

Se comprobaron las ocho pestañas de Adoración, Jóvenes, Mayordomía, Infantil, Música y Publicidad: Control, Estrategia, Programas, Tareas, Presupuesto, Reuniones, Operación y Equipo. También las ocho de Ministerios Personales y cinco de Mujer y Ancianos. Eso comprueba acceso, presentación y navegación, no todas las variantes de alta/edición/baja de cada formulario.

Interacciones comprobadas:

- El login no trae valores precargados y conserva el usuario escrito después de mover el foco. El director de Jóvenes ve solo su workspace y recursos autorizados; acceder directamente a canales muestra rechazo por `tenant.settings.manage`, sin exponer contraseñas.
- Calendario cambia a Agenda con enlaces a actividades y a asignaciones/programas de ancianos. La lectura del caso DEMO-1004 muestra departamentos, intervalo disputado, quién presentó primero y por qué tiene preferencia. No se aprobó ni cambió ese caso.
- El menú móvil cierra con Escape y devuelve el foco al botón de apertura. El modal de junta cabe en celular; se canceló sin convocatoria real. Vista previa del diseñador y cambio escritorio/móvil funcionan sin publicar.
- Excepciones de auditoría selecciona `EXCEPTIONS` y muestra rechazos/fallos, consistente con la prueba HTTP de CSV. Los títulos de ruta son específicos y cambian con el idioma.
- ES/EN/FR se seleccionan en el panel móvil; los cambios dinámicos revelaron y motivaron correcciones de etiquetas, estados y contadores. No se traduce contenido redactado por usuarios, nombres personales ni identificadores.
- GestionChurch → Nombramientos identifica la misma iglesia y usuario, sin otra contraseña. Las 13 entradas del menú se alcanzaron en tablet; la consola de acceso también cabe en celular 360×800. El asistente llega a confirmación y se canceló. El botón de retorno abre GestionChurch.

Correcciones de esta revisión: conservación del login; permisos de navegación/exportación/adjuntos; errores dentro de modales y recuperación de fallos de carga; timeout/cancelación de API; reintento estable de creación y continuidad sobre el borrador guardado; paginación del directorio de Nombramientos; contador total paginado; bloqueo de dobles envíos; títulos específicos; nombres accesibles en seis filtros de auditoría; estados técnicos legibles; traducciones observadas; confirmación de preferencias después del servidor; recuperación sin token; indicadores de panel que responden al ancho disponible; diseñador sin desbordamiento; marcador de salud fuera del texto móvil; filtros del padrón ajustados al ancho de tablet.

Limitaciones del recorrido: la automatización no confirmó el archivo descargado tras pulsar CSV (evento de descarga expiró sin error visible de aplicación); PDF/CSV sí se verificaron por HTTP sobre fixtures. La edición automatizada de `datetime-local` no permaneció en el estado React, por lo que esa alerta específica de navegador no se acredita; disponibilidad/conflictos se probaron por HTTP y el detalle existente sí se leyó. No se publicaron períodos, plantillas, convocatorias ni actividades de prueba dentro de iglesias existentes. Las mutaciones end-to-end documentadas se realizaron por API en bases temporales aisladas.

Se detectaron textos sin traducir que se corrigieron, pero no se ha realizado revisión lingüística humana completa de cada pantalla/estado de la suite. La última comprobación de Revisión en inglés confirmó `INVITATIONS`, `CLOSED` y `Scheduled`, pero también mostró residuos en otros elementos: «Preferencia», «resultados visibles», «CONFLICTOS» y fechas largas con conectores españoles. Estos pendientes son reales; el idioma no puede considerarse completo ni certificado al 100% por esta inspección. La sesión de prueba se dejó nuevamente en español.

Evidencia visual guardada: [panel escritorio](evidence-2026-10-01/dashboard-desktop.jpg) y [panel celular](evidence-2026-10-01/dashboard-mobile.jpg). Son capturas del tenant demostrativo Central, no de Ozama.

## Conteos y comprobaciones automatizadas

Conteos de la última ejecución relevante por suite; las repeticiones no se suman y las rutas/pestañas navegadas no se cuentan como tests. La última corrida conjunta de GestionChurch se ejecutó después de que el launcher confirmó `UP`, aproximadamente a las 17:09 locales.

| Comprobación | Último resultado |
|---|---|
| GestionChurch, unitarias | 171 aprobadas en 13 suites. Las 10 de autorización departamental son un subconjunto y no se suman de nuevo. |
| GestionChurch, HTTP de seguridad/aislamiento | 17 aprobadas en la corrida conjunta final; fixtures aislados. |
| GestionChurch, HTTP de flujos departamentales | 17/17 aprobadas, 0 omitidas en la corrida conjunta final. Cleanup de tenants, bases y archivos propios verificado. |
| GestionChurch, total seleccionado | 205 aprobadas en 16 archivos, sin fallos ni omisiones. |
| GestionChurch, typecheck/lint/OpenAPI | Aprobados; lint de 137 archivos y OpenAPI válido con 147 rutas. |
| GestionChurch, dependencias | Auditoría final con 0 avisos y 700 dependencias. |
| Nombramientos, API | 405 aprobadas, incluida repetición después del parche; no se cuentan dos veces. |
| Nombramientos, web | 243 aprobadas, incluidas las últimas regresiones de contador/copy federado. |
| Nombramientos, base de datos | 335 aprobadas, 1 omitida; selección sin suites live. |
| Nombramientos, dominio | 41 aprobadas. |
| Nombramientos, E2EE | 31 aprobadas. |
| Nombramientos, verificación | 39 aprobadas. |
| Nombramientos, selecciones sin suites live | 1.094 aprobadas y 1 omitida, sumando los últimos conteos de las suites indicadas; no significa 1.094 pruebas de seguridad ni una corrida de votación en navegador. |
| Nombramientos, dependencia/parche | Fastify 5.12.5 aplicado según el agente principal; resuelve los cuatro avisos altos y uno moderado informados. La selección API volvió a pasar. Auditoría final informada: 0 avisos, 933 dependencias. |
| Builds y arranque | Compilaciones completas optimizadas y typecheck/lint de ambos proyectos aprobados. Reinicio oficial completado con `UP`; GestionChurch 3000, gateway 4000, Nombramientos 3300 y su API 4100. Los últimos cambios de títulos, copy, permisos y responsive están incluidos. Verificador de integración de Nombramientos: `pass=true`, 0 discrepancias. |

Las repeticiones no se suman. «0 avisos» corresponde al resultado de la consulta de dependencias del 1 de octubre; no garantiza ausencia de vulnerabilidades desconocidas. Las suites incluyen comportamiento, permisos y guards de cableado; no todas son pruebas E2E.

Incidencia de ejecución: un intento conjunto iniciado antes de que el gateway terminara de arrancar produjo 32 fallos HTTP por `ECONNREFUSED`. Tras esperar el estado `UP`, la misma selección aprobó las 205 pruebas. No se ocultó ni se atribuyó ese intento a un defecto funcional; confirma que la disponibilidad del runtime es una precondición de estas suites.

## Criterios de experiencia y límites de la comparación

La revisión usa como referencias de diseño la visibilidad del estado, prevención de errores, consistencia y recuperación descritas en las [heurísticas de usabilidad de Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/) y los criterios de accesibilidad de [WCAG 2.2](https://www.w3.org/TR/WCAG22/), incluyendo [tamaño mínimo de objetivos de interacción](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). Son referencias para orientar correcciones, no una certificación emitida por esas organizaciones.

No se realizó un benchmark competitivo ni estudio con usuarios finales. Por tanto, no hay evidencia para afirmar que GestionChurch sea superior a todas las herramientas del mercado. La apariencia «premium» no sustituye pruebas de permisos, recuperación, accesibilidad, comprensión y operación bajo carga.

## Condiciones antes de producción

Se mantienen las condiciones de la auditoría del 30 de septiembre. El arranque local y Compose de desarrollo no constituyen un despliegue productivo, aunque los frontends compilen optimizados. La revisión no configura ni certifica infraestructura pública.

Antes de abrir acceso público se requiere un despliegue productivo con secretos separados y controlados, HTTPS, TLS verificado de PostgreSQL, redes privadas y logins de runtime con permisos mínimos por servicio/base. Las cuentas y contraseñas públicas de demostración no deben habilitar el despliegue; el archivo local de distribución de credenciales debe mantenerse fuera de los artefactos publicados.

También se requiere antivirus operativo, almacenamiento privado con retención, validación de SMTP/Meta con consentimiento y webhooks, restauración de backups, pruebas de carga/agotamiento, observabilidad, rotación/revocación y revisión externa en staging. La validación de firmas/ZIP no equivale a antivirus o a saneamiento completo de documentos.

MFA continúa diferido por el alcance previo del proyecto. La CSP mantiene compatibilidad y no es una política estricta con nonces. No se realizaron pruebas exhaustivas de fuzzing, cada ruta/rol, todos los dispositivos ni entregas a proveedores reales. Estas limitaciones siguen abiertas y deben formar parte de la aprobación de salida.

El runtime nativo usa adaptadores locales/degradados cuando Docker no está disponible: Redis, NATS, MinIO, ClamAV, Mailpit y Jaeger no constituyen aquí una infraestructura productiva validada. Nombramientos necesita un piloto con custodia E2EE válida que recorra alta de período, personal, comité, sesión, votación, resultados y reportes; el asistente de inicio no elimina ni inicializa por sí solo esas claves. Tampoco debe confundirse el directorio de Nombramientos con una importación automática del padrón de GestionChurch.

Orden de cierre recomendado: primero los controles e infraestructura productivos y el piloto cifrado de Nombramientos; después completar residuos de traducción y pruebas de cada formulario con roles reales en staging; finalmente pruebas con personas, lectores de pantalla, celulares físicos, restauración de backups, carga y revisión independiente. Son criterios verificables, no una promesa de «NASA level».

## Reproducción seleccionada y segura

Con los servicios locales activos, estas selecciones evitan ejecutar indiscriminadamente las suites E2E que escriben en Central:

```powershell
pnpm exec vitest run tests/unit
$env:RUN_SECURITY_API_TESTS='1'
pnpm exec vitest run tests/integration/security-api.test.ts tests/integration/tenant-isolation.test.ts
$env:RUN_DEPARTMENT_FLOW_API_TESTS='1'
pnpm exec vitest run tests/integration/department-flows-api.test.ts
pnpm typecheck
pnpm lint
pnpm validate:openapi
pnpm audit --json
```

Cada selección HTTP debe conservar sus guardas de propiedad y cleanup. No reemplazar esta selección por `pnpm test`, `test:e2e` o suites live de otro proyecto sin revisar antes sus fixtures y destino de escritura.
