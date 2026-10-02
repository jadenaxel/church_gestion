# Prompt de consolidación premium de GestionChurch y Nombramientos

Este documento contiene las instrucciones para una ejecución futura. Prepararlo, leerlo o guardarlo no autoriza por sí solo a ejecutar cambios, desplegar la aplicación ni intervenir datos de iglesias. Al recibir la orden expresa de ejecutar este prompt, inicia el trabajo de implementación y validación descrito abajo, no te limites a entregar otro plan.

## 1 Misión y significado de completado

Actúa como un equipo sénior de arquitectura de producto y microservicios, diseño UI/UX, frontend accesible, backend, ciberseguridad, QA y operación. Consolida GestionChurch y su módulo integrado Nombramientos como una solución ejecutable de extremo a extremo, fácil de utilizar y verificablemente confiable. Conserva la línea gráfica, todas las funcionalidades existentes, los botones autorizados, los datos y las reglas de negocio.

La meta es una entrega consolidada y exhaustiva del alcance aprobado, no un prototipo ni una nueva colección de pantallas. Cada mejora debe estar conectada desde la interacción real del navegador hasta autorización, API gateway, servicio propietario, persistencia, notificación, reporte y auditoría cuando corresponda. No entregues botones decorativos, acciones vacías, datos ficticios de producción, endpoints de relleno ni éxitos simulados.

Interpreta «100%» como el cumplimiento demostrado de todos los requisitos aplicables del inventario aprobado: implementados, conectados, probados y documentados. No significa ausencia absoluta de vulnerabilidades, cobertura de todas las combinaciones imaginables, una certificación de terceros ni garantía de superioridad mundial. No ajustes el denominador, omitas pruebas necesarias ni reclasifiques un requisito fallido para alcanzar ese porcentaje.

«Ultra premium» significa claridad, legibilidad, coherencia, pocos pasos innecesarios, prevención de errores, recuperación del trabajo, accesibilidad, privacidad, rendimiento y operación confiable. No significa añadir efectos, módulos o complejidad sin necesidad.

Busca cerrar esta etapa en una entrega integral, pero no prometas que el software nunca necesitará mantenimiento, actualizaciones de seguridad o mejoras posteriores.

## 2 Contexto y lectura inicial

Los proyectos existentes son:

- GestionChurch: `X:\CODE\GestionChurch`.
- Nombramientos: `X:\CODE\NOMBRAMIENTOS`.
- Dominio previsto: `gestionchurch.com`; no publicar ni cambiar DNS por esta instrucción.
- Idiomas de interfaz: español principal, inglés y francés.
- Aislamiento: una base de datos por tenant, con controles adicionales por servicio, recurso y permiso.
- Ozama contiene usuarios y cargos reales; no utilizarlo como ambiente de pruebas.

Antes de editar, lee las instrucciones `AGENTS.md` aplicables en cada proyecto, sus README, scripts, manifiestos, contratos y documentación relevante. Revisa especialmente:

- `docs/experience-audit-2026-10-01.md`.
- `docs/security-audit-2026-09-30.md`.
- `docs/department-flows-audit-2026-10-01.md`.
- `docs/architecture.md`.
- `docs/department-operations-architecture.md`.
- El `prompt.md` original como contexto histórico; no sobrescribirlo.

Estos informes describen evidencia anterior, no la aprobación automática del código que encuentres. Reproduce los resultados pertinentes sobre la versión actual. No sumes repeticiones ni presentes conteos históricos como nuevas pruebas.

Consulta fuentes oficiales para estándares y APIs que puedan haber cambiado. Para funciones eclesiásticas, verifica la edición oficial vigente del Manual de Iglesia y registra fuente, edición y sección utilizada. No sustituyas la autoridad de la junta, la reunión administrativa, Secretaría ni el pastor por decisiones automáticas del software.

## 3 Límites de preservación y autorización

### 3.1 Funcionalidad y flujo

1. No eliminar módulos, funcionalidades, botones, campos, opciones, reportes, rutas ni capacidades autorizadas existentes.
2. Conservar las transiciones de negocio y quién tiene autoridad para realizarlas. No convertir una recomendación en aprobación ni una invitación en confirmación de asistencia.
3. Mantener los accesos actuales. Las mejoras de inicio y los asistentes son vías más fáciles sobre la misma lógica; no un reemplazo que invalide la vía anterior.
4. Puedes mejorar agrupación, espaciado, mensajes, accesos directos y presentación responsive. No ocultes una acción autorizada ni traslades una función existente a un nuevo paso difícil de descubrir.
5. No ampliar permisos para hacer pasar una prueba. Respetar roles acumulados, membresías departamentales y restricciones de privacidad en backend.
6. No rehacer la aplicación ni sustituir el stack por conveniencia. Usar los patrones y bibliotecas actuales; cambios de dependencia focalizados, con compatibilidad y regresiones comprobadas.
7. No convertir los espacios departamentales en copias indiferenciadas: conservar su operación específica y sus conexiones al núcleo.

### 3.2 Cambios que requieren decisión específica

El dueño debe aprobar por separado cualquier cambio que altere el resultado, la autoridad, el acceso o los pasos obligatorios del proceso. En particular:

- Activar MFA obligatorio o cambiar la política de autenticación. MFA sigue diferido para GestionChurch y su acceso federado a Nombramientos; no habilitarlo silenciosamente ni introducir MFA local adicional en ese acceso. Si existe un modo autónomo de Nombramientos fuera de esta integración, conservar sus controles vigentes: esta instrucción no autoriza retirar ni recrear MFA en él.
- Exigir un aprobador distinto del registrador, cambiar umbrales financieros o alterar autoridades de junta.
- Cambiar roles de usuarios reales, conceder acceso nuevo a módulos o redefinir privilegios del administrador global.
- Retirar una vía de inicio, fusionar botones, eliminar campos o modificar contratos incompatibles.
- Crear acceso de soporte excepcional, nuevas retenciones obligatorias o enviar datos a proveedores adicionales.

Documenta estas decisiones y su impacto en `docs/premium-authorization-decisions.md`. Continúa el trabajo independiente que sea seguro; no implementes la parte dependiente hasta recibir autorización. Una decisión pendiente no equivale a requisito completado.

### 3.3 Datos y operaciones

- Preservar usuarios, cargos múltiples, membresías, archivos, claves, actividades, nombramientos y configuraciones de Ozama y de todas las iglesias existentes.
- No crear datos de prueba en Ozama ni Central. Los seeds demostrativos no deben intervenir tenants reales ni ejecutarse en producción.
- Las mutaciones de QA utilizan tenants sintéticos propios, bases separadas, destinatarios controlados y almacenamiento aislado.
- Antes de borrar fixtures, verificar propietario, identificador de ejecución, base, registro y ruta absoluta. Nunca eliminar bases o carpetas de origen desconocido.
- No limpiar archivos o cambios del usuario, hacer resets destructivos ni sobrescribir trabajo ajeno. Examinar los cambios existentes y trabajar sobre ellos con cuidado.
- No modificar credenciales reales, enviar mensajes a personas, publicar ni abrir servicios a Internet sin autorización específica.
- No imprimir secretos, contraseñas, claves privadas o información personal en herramientas, capturas, reportes o logs.

## 4 Inventario y línea base antes de cambiar

Crea un inventario trazable que incluya rutas, módulos, pestañas, botones, formularios, estados, permisos, llamadas API, servicios propietarios y dependencias. Derívalo del código y del navegador: no limitarlo a las pantallas ya recorridas en una auditoría.

Como mínimo, incluir:

- Login local y global, recuperación, preferencias y sesiones.
- Panel, navegación y espacios por cargo.
- Calendario, actividades, recurrencias, opciones de fecha, recursos y disponibilidad.
- Conflictos, alternativas, solicitudes de cambios, juntas, invitaciones, actas y decisiones.
- Todos los espacios departamentales y sus operaciones específicas.
- Ancianos, Ministerios Personales y Ministerio de la Mujer.
- Presupuestos, tareas, reuniones, acuerdos, comentarios y menciones.
- Padrón, importaciones, fotografías, equipo, usuarios, cargos y departamentos.
- Documentos, programas, versiones, visor y permisos.
- Reportes, filtros, gráficos, exportaciones y auditoría.
- Diseñador del formulario con borrador, vista previa y publicación.
- Notificaciones, correo, WhatsApp, preferencias, configuración y seguimiento.
- Nombramientos: resumen, conducción del ciclo, sesión, resultados, miembros, catálogo, junta, organigrama, reportes, historial, biblioteca, acceso y configuración; incorporar cualquier otra sección encontrada.
- Provisionamiento, arranque, apagado, estado, diagnóstico y operación del sistema.

Registra capturas iniciales con datos sintéticos en escritorio, tablet y móvil, además de tiempos y resultados de tareas representativas. Identifica qué es defecto observado, qué no está validado y qué es mejora nueva. Las tres categorías no deben confundirse.

Genera `docs/premium-delivery-plan.md` y `docs/premium-requirements-matrix.md` antes de implementar. Cada entrada debe tener identificador estable, actor/permiso, estado inicial, resultado esperado, impacto visual, persistencia, evidencia, prueba negativa y estado de cumplimiento.

No reducir el inventario al camino feliz. Incluir vacío, carga, error, sin permiso, datos extensos, cancelación, cambios sin guardar, concurrencia y resultado incierto. Las exclusiones justificadas se registran antes de ejecutar y no pueden utilizarse para esconder un fallo.

## 5 Experiencia por responsabilidades y próxima acción

Conserva el dashboard y añade o perfecciona su orientación por permisos efectivos. Una sola identidad puede acumular varios cargos. No exigir cuentas separadas, logout ni un rol global que haga perder autoridad departamental válida.

| Perfil | Información prioritaria | Acción directa esperada |
|---|---|---|
| Director o planificador | Trabajo de sus departamentos, fechas, tareas, presupuesto y solicitudes | Continuar borrador, corregir, enviar o abrir detalle autorizado |
| Integrante | Participaciones y tareas asignadas, documentos y acuerdos accesibles | Completar lo asignado o consultar evidencia |
| Anciano | Turno, cultos, plataforma y participantes por confirmar | Preparar su programación y gestionar su agenda |
| Primera ancianía | Cobertura anual, turnos y vacíos de asignación | Programar y revisar cobertura según permiso |
| Secretaría | Conflictos, cambios, juntas, actas y decisiones | Coordinar revisión y registrar decisiones autorizadas |
| Administrador tenant | Excepciones operativas, configuración, equipo y permisos | Resolver o delegar usando capacidades actuales |
| Administrador global | Salud de tenants y administración global autorizada | Gestionar sin exposiciones de datos fuera de su política vigente |

Cada pendiente muestra motivo, responsable, plazo, estado y próxima acción. Si faltan datos, distinguir «no informado», «sin pendientes» y «no se pudo cargar». No fabricar cifras ni recomendaciones para llenar un dashboard.

Todo indicador accionable abre su conjunto exacto de registros con filtros coherentes, permisos y contexto. Volver conserva filtros, posición razonable y departamento seleccionado. Los gráficos ofrecen detalle y alternativa textual; un número decorativo no debe aparentar una acción.

No convertir todo texto en enlace. Mantener affordances claras: botones para ejecutar, enlaces para navegar y texto para explicar. El acceso directo no puede saltar confirmaciones sensibles ni la autoridad del backend.

## 6 Diseño consistente sin cambiar la línea gráfica

Conserva marca, familia de colores, tipografía Advent Sans donde exista licencia/asset válido, iconografía, tono y composición reconocible. Se permiten ajustes focalizados de contraste en tokens, tonos y estados dentro de la misma identidad visual, con comparación antes/después; preservar la línea gráfica no significa conservar un contraste inaccesible. No introducir otra plantilla visual ni efectos que distraigan del trabajo.

Consolida patrones compartidos o equivalentes en ambos proyectos: botones, inputs, selectores, buscadores, filtros, tablas, tarjetas, modales, estados vacíos, carga, errores, confirmaciones, breadcrumbs y notificaciones. Compartir un patrón no exige un paquete común que acople despliegues independientes.

Las acciones equivalentes deben tener nombre y comportamiento consistentes. Una acción no disponible debe explicar el motivo cuando sea útil, sin revelar datos privados. Evitar bloqueos silenciosos y códigos técnicos como único lenguaje del usuario.

Los formularios conservan todos sus campos. Ordenar por contexto y utilizar secciones progresivas sin impedir el acceso a las opciones existentes. Mostrar obligatorios, ejemplos breves, validación de campo y resumen final. Reutilizar información ya confirmada sin repetir su ingreso, pero no inferir decisiones sensibles.

Proponer como objetivo de diseño texto de lectura habitual de 16 px y auxiliar útil de al menos 14 px, con escalado y verificación en la fuente real. No es una regla textual de WCAG ni autorización para cambiar el logotipo institucional. No reducir texto para forzarlo dentro de un espacio; adaptar el layout.

Mantener visibles búsqueda, filtros activos, cantidad de resultados y limpieza de filtros. Las listas extensas requieren paginación/carga incremental o scroll local comprensible, sin ocultar los controles ni crear múltiples zonas de desplazamiento difíciles de usar.

## 7 Experiencia móvil y accesibilidad

Diseñar los mismos procesos para celular, tablet y escritorio. No aceptar únicamente que las pantallas «quepan».

Probar como mínimo anchos de 320, 360, 390, 768, 820, 1280 y 1440 px, orientación vertical/horizontal, teclado virtual y ampliación. Los viewports simulados complementan, no sustituyen, pruebas en Android e iOS físicos y sus navegadores.

Requisitos:

- Sin desbordamiento horizontal global. Tablas o calendarios que lo necesiten usan desplazamiento local identificado y una presentación alternativa útil cuando proceda.
- Formularios, modales y acciones accesibles sin superposición del teclado, cabecera fija o barra inferior.
- Menú retráctil utilizable, etiquetas reconocibles, acceso a todos los módulos autorizados, Escape y retorno de foco.
- Objetivo de diseño de controles táctiles de 44×44 px cuando sea viable; verificar por separado las condiciones y excepciones normativas de WCAG.
- No depender de hover, color, arrastrar, gestos complejos o iconos sin nombre como único medio de operación.
- Texto ampliado y textos largos en francés/inglés sin cortar acciones o esconder información esencial.
- Contraste, foco visible no oculto, orden lógico, etiquetas, errores asociados, anuncios de estado y movimiento reducido.
- Recorrido por teclado y lectura con herramientas de asistencia, incluyendo NVDA y VoiceOver cuando estén disponibles.

La meta de conformidad es [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) para páginas y procesos completos, con matriz de criterios aplicables y evidencia humana/automatizada. Un scanner o un panel de preferencias no bastan para declarar conformidad. Si falta la evaluación manual necesaria, registrarla como pendiente.

## 8 Traducción integral y localización

Completar español, inglés y francés en toda la interfaz de ambos proyectos: menús, formularios, títulos, botones, tooltips, estados, errores, validaciones, diálogos, gráficos, tablas, indicadores, reportes, PDFs, plantillas de avisos y correos del sistema.

1. Usar claves semánticas y catálogos versionados o un mecanismo declarativo equivalente. Migrar progresivamente los textos heredados; al cierre, toda la interfaz incluida en el inventario debe estar cubierta. No depender del observador DOM ni de traducción parcial como solución final o evidencia de completado.
2. No mutar fragmentos del DOM que produzcan frases mixtas, interfieran con React o alteren contenido escrito por personas.
3. Backend devuelve códigos/datos estructurados; el idioma de la sesión o destinatario determina la presentación. Mantener compatibilidad de respuestas existentes durante la migración.
4. Usar pluralización, interpolación y formatos de fecha, hora, número y moneda apropiados. Idioma no cambia zona horaria de la iglesia ni moneda contable configurada.
5. Preferencia persistida por usuario, aislamiento al cambiar sesión y propagación autorizada a Nombramientos. No usar un valor global del navegador para filtrar preferencias de otro usuario.
6. No traducir automáticamente nombres, contenidos de documentos, observaciones, cargos personalizados ni datos redactados por usuarios. Los nombres estándar de interfaz pueden tener etiquetas localizadas sin cambiar identificadores.
7. Verificar claves faltantes, placeholders, plurales, estados dinámicos y textos después de navegación/recarga. Registrar excepciones explícitas de contenido de usuario.
8. Exigir revisión lingüística humana competente en ES/EN/FR antes de marcarla completa. No inventar aprobación humana.

Cerrar específicamente los residuos documentados en Revisión: «Preferencia», «resultados visibles», «CONFLICTOS», conectores españoles en fechas largas y cualquier otro localizado en el inventario actual.

## 9 Procesos conectados y confiables

### 9.1 Actividades y calendario

Preservar creación, borrador, múltiples opciones/sesiones, recurrencia, montaje/desmontaje, recursos, envío, revisión, alternativas, aprobación, cambios autorizados, cancelación y cierre.

Disponibilidad preventiva en la UI y revalidación transaccional del servidor deben concordar. Mostrar fecha/intervalo disputado, motivo, actividad y departamento accesibles, quién envió primero y fundamento de preferencia. La prioridad se determina con datos persistidos del servidor, no con el reloj del cliente.

Un conflicto privado conserva información suficiente de ocupación sin filtrar título, persona, documento o identificador restringido. Las asignaciones informativas de ancianos no deben reservar recursos ni generar conflictos por error.

El formulario ofrece alternativas y la solicitud de revisión ya autorizada. Mantener la decisión final de Secretaría/junta según las reglas actuales. Directores no eliminan actividades aprobadas y sus modificaciones requieren el flujo de autorización existente.

### 9.2 Juntas y coordinación

La convocatoria conecta agenda, casos, participantes, calendario personal, invitaciones, respuesta, recordatorios, asistencia, acuerdos y acta. Mostrar claramente programado, invitado, enviado, entregado, confirmado, asistió y cerrado: no son equivalentes.

Alternativas creadas por autoridad válida deben persistir, quedar seleccionables y revalidarse antes de aprobar. Cambios de horario conservan historia, control de versión y avisos apropiados.

### 9.3 Espacios departamentales

Todos los departamentos del inventario conservan planes, objetivos, programas, campañas, calendario, tareas, equipo, reuniones, acuerdos, documentos, presupuesto, colaboración, indicadores y capacidades especializadas existentes.

Cada referencia debe pertenecer al tenant y workspace correcto. Una persona responsable debe estar activa y autorizada para el trabajo asignado. Comentarios, menciones, dashboard, avisos y reportes heredan privacidad.

Probar en especial: Escuela Sabática, Música/Adoración, Diáconos/Diaconisas, Infantil/Jóvenes, Familia, Comunicación/Publicidad, Salud, Tesorería/Mayordomía y cualquier departamento presente. No afirmar operación especializada porque aparezca una pestaña: verificar sus registros y transiciones existentes. Si falta una capacidad exigida por el alcance histórico, registrarla y resolverla sin inventar otro módulo ajeno a esta consolidación.

Conservar las operaciones particulares de Ancianos, Ministerios Personales y Mujer: turnos y plataforma; planes misioneros, interesados, estudios, grupos/campañas y presupuesto; padrón segmentado, actividades, retiros, pagos, seguimiento y cumpleaños. Respetar minimización de datos y privacidad de menores/seguimientos.

### 9.4 Padrón y documentos

Importar mediante plantilla descargable, preview, errores por fila, deduplicación y confirmación; verificar resultados después de recarga. La foto y las sincronizaciones autorizadas deben corresponder a la persona correcta sin duplicar identidades.

Mantener controles de tipo/tamaño, cuota, antivirus, visibilidad, versiones, retirada, visor, enlaces temporales y descarga. La vista previa no puede ejecutar contenido activo ni convertir una ruta privada en pública.

### 9.5 Reportes y auditoría

Mismos filtros y permisos para KPI, listado, detalle, PDF, CSV e ICS. Conservar fuente, período, moneda, denominador, zona horaria y fecha de generación. Distinguir cero de dato desconocido. Descargar y abrir el archivo final: pulsar Exportar no demuestra entrega.

Toda operación relevante conserva actor, tenant, recurso, acción, resultado, fecha, versión y correlación; rechazos y fallos con información suficiente sin secretos. Las consultas/exportaciones sensibles tienen trazabilidad acorde con su riesgo. No registrar cada render como un acto de negocio ni multiplicar eventos por reintentos.

Auditoría accesible solo por políticas vigentes, sin edición/borrado ordinario. Definir y comprobar protección y retención en infraestructura productiva, sin prometer inmutabilidad física por una tabla que un superusuario puede modificar.

## 10 Nombramientos integrado sin debilitar protección

GestionChurch continúa siendo entrada y fuente de identidad/autorización. Conservar SSO, contexto de iglesia, permiso de módulo, sesión de origen, retorno a GestionChurch y comportamiento al expirar o revocar.

Simplificar la preparación con una guía contextual sobre el flujo existente:

1. Definir período y fechas.
2. Confirmar estado de preparación cifrada.
3. Preparar directorio, catálogo y junta.
4. Continuar sesiones y el proceso vigente.
5. Revisar resultados, organigrama y reportes.

Cada paso informa qué falta, quién puede resolverlo y la siguiente acción. Preservar las pantallas técnicas y vías existentes como acceso disponible; no obligar al usuario a usarlas si la guía puede conducir a la misma operación autorizada.

Reglas de seguridad y veracidad:

- Crear un borrador de período no inicializa E2EE, no concede acceso criptográfico y no importa personas de GestionChurch.
- Mostrar la fuente real del directorio y catálogo. Si hace falta sincronización adicional, documentar contrato, privacidad y autorización; no inventarla ni extraer contenido cifrado al servidor.
- Diferenciar sin inicializar, dispositivo pendiente, bloqueado, autorizado, revocado, recuperación y fallo de servicio. Un error no es una lista vacía.
- Mantener claves privadas y datos que el diseño actual protege exclusivamente en el cliente autorizado. No almacenar claves en logs, backend o caché compartida para simplificar el inicio.
- No crear criptografía propia ni modificar primitivas/envelopes sin revisión específica. No saltar concesiones ni habilitar recuperación por una puerta trasera.
- Autorizar un segundo dispositivo únicamente con el procedimiento existente y autoridad válida. La guía puede automatizar pasos mecánicos no sensibles, no una concesión de acceso silenciosa.
- Logout, expiración, cambio de permisos y revocación deben propagarse entre módulos sin sesiones huérfanas ni bucles. Distinguir revocación de sesión de origen, permiso de aplicación y concesión criptográfica: comprobar la vinculación mediante `sourceSessionId`, invalidar las sesiones dependientes afectadas y no revocar indebidamente otros dispositivos/sesiones legítimos.
- No añadir un segundo login o MFA local al acceso federado. La eventual MFA de GestionChurch requiere decisión específica; no alterar por esta instrucción controles vigentes de un modo autónomo fuera del alcance integrado.

Prueba obligatoria en tenant sintético: dispositivo A prepara la custodia; B solicita y recibe acceso autorizado; ambos realizan las funciones pertinentes; revocar B impide acceso nuevo y se invalidan sus sesiones afectadas, sin afectar indebidamente a A; la recuperación autorizada demuestra lectura del mismo contenido cifrado previo, incluidas las generaciones históricas aplicables, no solo recuperar login. Completar período, junta, sesión, votación/proceso vigente, resultados y exportación. Comprobar negativas de concesión pendiente/revocada, tenant equivocado y envelope/contexto alterado. Revocar no debe prometer borrar retrospectivamente plaintext ya visto, capturas o copias legítimas de un dispositivo.

## 11 Seguridad y arquitectura de servicio

Mantener microservicios reales por dominio, API gateway y ownership existente. No permitir al frontend conectarse directamente a bases ni escribir en servicios saltando autorización. No introducir bases compartidas entre tenants ni escrituras cruzadas informales entre dominios.

Implementar o completar dentro del alcance los controles necesarios y demostrar que no regresan los ya auditados:

- Tenant derivado de identidad/sesión verificada, nunca del cuerpo, query o encabezado del cliente por sí solos.
- Autorización por recurso y estado en cada operación, incluidos búsquedas, agregados, dashboards, fotos, documentos, enlaces, avisos y exportaciones.
- Aislamiento por tenant en base, almacenamiento, colas, caché, búsquedas y sesiones; no basta una comprobación en el gateway.
- Matriz rol/recurso/acción para lectura, creación, modificación, aprobación, eliminación, exportación y configuración; cubrir usuarios con múltiples cargos y permisos revocados.
- Identidad de runtime y permisos mínimos por servicio/base. Probar que la credencial del tenant A no conecta ni accede a B en staging productivo; separar la autoridad de provisionamiento/migración.
- Sesiones, CSRF, validación de origen, límites de abuso, control de concurrencia, protección SSRF en proveedores, enlaces temporales y cargas acotadas.
- TLS verificado, secretos separados, rotación/revocación, exclusión de archivos sensibles en artefactos y cuentas demostrativas bloqueadas en producción.
- CSP endurecida de manera compatible; evaluar primero y probar antes de exigir una política que rompa scripts legítimos. No retirar protecciones por un error de configuración.
- Escaneo de dependencias y secretos, inventario/SBOM actual y revisión de cambios. No usar «0 avisos» como garantía de ausencia de brechas.

Documentar un modelo de amenazas enfocado en aislamiento, autorización lateral, cuentas administrativas, federación, archivos, finanzas, información pastoral/menores y disponibilidad. Usar [OWASP ASVS 5.0 nivel 2](https://owasp.org/projects/asvs) como objetivo de verificación, con requisitos adicionales según riesgo. Registrar cada control aplicable, prueba y evidencia; no declarar una certificación que nadie emitió.

MFA, segregación nueva y privilegios globales que cambien el flujo se proponen por separado. Ninguna pantalla puede anunciar MFA activa cuando no lo esté. Si el propietario mantiene un riesgo residual, registrarlo explícitamente; no llamarlo control satisfecho.

## 12 Persistencia y recuperación ante fallos

Para cada acción de escritura:

1. Validación accesible en UI y validación autoritativa en backend.
2. Estado de envío visible y protección de doble clic sin bloquear definitivamente la pantalla.
3. Persistencia transaccional cuando corresponda, versión esperada y error de concurrencia recuperable.
4. Idempotencia en operaciones que puedan repetirse, ligada a tenant, actor y contenido; no reutilizar una clave para otra operación distinta.
5. Timeout y cancelación con significado claro. Cancelar una petición del navegador no implica revertir la escritura del servidor.
6. Si el resultado es incierto, consultar/reconciliar la operación antes de reenviar. Resolver también cargas parciales de adjuntos y versiones, no solamente el alta de actividad.
7. Mostrar «guardado» solo con confirmación del servidor y permitir comprobarlo después de recarga y otra sesión autorizada.
8. Preservar borradores de forma segura. Al cerrar un modal, navegar, pulsar Atrás, recargar o expirar sesión, detectar cambios no guardados y ofrecer guardar/descartar/continuar cuando sea técnicamente posible, o recuperación segura y explicación del estado. No prometer interceptar toda salida del navegador. No persistir plaintext pastoral, de menores o E2EE en localStorage/caché sin un diseño autorizado. Limpiar contexto al cambiar usuario/tenant y controlar retención.
9. Estado de error contextual, mensaje útil, identificador de diagnóstico y reintento seguro; no imprimir detalles internos de base ni stack al usuario.

Simular caída de API, red lenta, respuesta perdida después de commit, sesión expirada, conflicto de versiones, almacenamiento/antivirus no disponible y desconexión de base. Confirmar que no hay éxitos prematuros, duplicados, datos ajenos ni pérdida silenciosa del trabajo.

## 13 Notificaciones y configuración real

Conservar configuración por tenant, acceso solo para los permisos administrativos vigentes, correo y Meta WhatsApp, consentimiento y pruebas controladas.

Mostrar configuración válida/incompleta, canal disponible, última prueba, cola, resultado y razón de fallo. En modo simulado, decir claramente que no se envió un mensaje real. En modo real, distinguir encolado, aceptado por proveedor, entregado, leído cuando aplique, fallido y reintentable.

Backend debe demostrar persistencia de avisos, reintentos acotados, recuperación después de reinicio, tratamiento de fallos definitivos y deduplicación. Verificar las colas/outbox existentes y completar sus garantías sin duplicar infraestructura. Webhooks firmados, tenant y evento correctos, protección contra replay y recepción repetida sin repetir acciones.

No incluir contenido confidencial en WhatsApp/correo cuando basta un aviso y enlace autenticado. Enlaces de retorno deben validar destino y autorización; no enviar tokens sensibles en URLs públicas.

Las pruebas automáticas pueden usar adaptadores controlados, pero no acreditan entrega productiva. Antes de cerrar esa aceptación se necesita un remitente y destinatario de prueba autorizados, credenciales correctas y evidencia de entrega/estado real. No enviar mensajes a miembros reales para conseguir la evidencia.

## 14 Indicadores y pronóstico explicable

Mantener dashboard y gráficos actuales, mejorando comprensión y detalle. Cada valor debe tener definición, fuente, período y conjunto de registros coherente. Permisos también se aplican al agregado.

El pronóstico actual es una señal basada en reglas y las tres actividades recientes. Conservar esa referencia útil, pero no mostrar el score heurístico como una probabilidad estadística calibrada ni afirmar confianza «media» solamente porque hay tres registros.

Presentar nivel orientativo, motivos, tamaño de muestra, fecha de cálculo y limitaciones. Con muestra insuficiente decirlo. Mantener contratos compatibles mediante campos aditivos y transición documentada de etiquetas; no romper consumidores actuales.

No introducir IA externa, transferir datos a terceros o comprar servicios para dar apariencia predictiva. Un modelo nuevo requiere hipótesis, muestra adecuada, validación histórica, calibración, controles de privacidad y aprobación de su uso. No es condición para una interfaz premium.

## 15 Rendimiento y operación productiva

### 15.1 Rendimiento medido

Medir la línea base y el resultado bajo condiciones reproducibles. Revisar payloads, paginación, consultas, índices, N+1, cargas de archivos y tamaño de bundles. Evitar optimizaciones que cambien privacidad, resultados o consistencia.

Usar como objetivos de experiencia LCP ≤ 2,5 s, INP ≤ 200 ms y CLS ≤ 0,1 en el percentil 75 de mediciones de campo cuando exista muestra suficiente. Estos objetivos siguen la referencia de [Web Vitals](https://web.dev/articles/vitals); una medición de laboratorio no equivale a ese resultado de campo.

Definir y publicar dispositivo, red, datos, concurrencia, duración y presupuesto de API antes del ensayo. Hasta disponer de mediciones de campo, reportar resultados de laboratorio y la validación pendiente sin inventar percentiles. No añadir analítica externa ni registrar información personal sin autorización.

### 15.2 Despliegue y recuperación

Preparar configuración productiva reproducible con secretos inyectados, TLS, redes privadas, permisos mínimos, almacenamiento privado, antivirus, colas durables y observabilidad. No publicar el stack de desarrollo ni cambiar a `development` para evadir guardas.

Mantener el arranque local y scripts existentes. Estado y diagnóstico deben comprobar los servicios y dependencias necesarios, no solo el proceso padre. Explicar modo degradado, puertos, falla concreta y recuperación. No instalar otro PostgreSQL ni reemplazar una instancia existente sin autorización específica.

Antes de ejecutar un script oficial de arranque/reinicio, leer sus efectos de migración, seed, sincronización y provisionamiento. No permitir que una verificación reinserte demostraciones, cambie cargos o sobrescriba configuración de iglesias reales. Ensayar primero los efectos de escritura en fixtures propios y conservar el comportamiento legítimo de arranque.

El diseño productivo debe permitir fallas parciales controladas, límites de recursos, alertas y trazabilidad por correlación sin secretos. Definir con el dueño carga esperada, disponibilidad, pérdida máxima de datos y tiempo de recuperación; no inventar cifras contractuales.

Probar backup/restauración completa de un tenant sintético en entorno vacío, con archivos, configuración y custodia criptográfica conforme a su diseño. Verificar integridad, aislamiento y funcionamiento después de restaurar. No basta «el backup se generó».

Preparar procedimientos de despliegue, migración, smoke test y rollback compatible. Las migraciones son aditivas siempre que sea posible; no prometer rollback de esquema destructivo sin respaldo y ensayo. La publicación real, rotación de secretos reales y cambios de infraestructura requieren autorización específica.

## 16 Matriz mínima de recorridos de aceptación

Estos escenarios son obligatorios y se amplían con el inventario. Cada uno se prueba con las variantes de rol y permiso pertinentes, usando datos sintéticos.

| Identificador | Recorrido | Evidencia necesaria |
|---|---|---|
| R01 | Login, recuperación, expiración y logout local/global | Sesión válida, estados de fallo, entrega controlada y revocación; sin credenciales de prueba precargadas |
| R02 | Usuario con dos o más cargos | Accede a capacidades legítimas acumuladas, sin privilegios ajenos |
| R03 | Alta/configuración de tenant sintético | Base propia, admin válido, ausencia de datos de otra iglesia y estado operativo |
| R04 | Alta de usuario, departamento y membresías | Selección enlazada, permiso persistido, edición y revocación efectivos |
| R05 | Inicio por responsabilidades | Pendientes correctos y accesos directos con contexto y permisos |
| R06 | Crear actividad con programa adjunto | Borrador persistente, archivo seguro, envío, detalle y auditoría después de recarga |
| R07 | Dos envíos simultáneos al mismo intervalo | Reserva/conflicto consistente y preferencia temporal del servidor |
| R08 | Conflicto y solicitud de coexistencia | Datos suficientes y privacidad, justificación, revisión, decisión y avisos |
| R09 | Crear/seleccionar alternativa | Alternativa persistida, disponibilidad revalidada y aprobación legítima |
| R10 | Modificar actividad aprobada | Director propone; autoridad decide; versión y trazabilidad conservadas |
| R11 | Cancelar/cerrar actividad | Autoridad correcta, reserva liberada según regla, indicadores/reportes actualizados |
| R12 | Crear y seguir junta | Agenda, casos, invitaciones, calendario, RSVP, asistencia y acta conectados |
| R13 | Operación de cada departamento | Plan, objetivo, programa, tarea, reunión, acuerdo y registro específico persistentes |
| R14 | Presupuesto y colaboración | Agregados coherentes, aprobación vigente, referencia correcta y menciones privadas |
| R15 | Turnos y plataforma de Ancianos | Varias personas válidas, plantilla/orden, medios y calendario informativo sin choque |
| R16 | Ministerios Personales | Plan/campaña, interesado, estudio, grupo, minuto misionero y presupuesto conectados |
| R17 | Ministerio de la Mujer | Padrón/segmentación, actividad, retiro, inscripción, pago, seguimiento y cumpleaños |
| R18 | Importar padrón y foto | Plantilla, preview, filas erróneas, duplicados, confirmación y acceso por permiso |
| R19 | Documentos y versiones | Visor, descarga, visibilidad, enlaces temporales, retiro e integridad |
| R20 | Diseñador del formulario | Borrador, preview móvil/escritorio, publicación por autoridad y uso real conservando campos esenciales |
| R21 | Reporte y exportación | Filtros y cifras coherentes; archivos descargados, abiertos y revisados |
| R22 | Auditoría | Actos y excepciones consultables por autoridad; privacidad y protección contra modificación |
| R23 | Canales y recordatorios | Configuración aislada, pruebas autorizadas, seguimiento real y fallos recuperables |
| R24 | SSO hacia Nombramientos y regreso | Mismo usuario/tenant, permiso vigente, logout/expiración/revocación en ambos módulos |
| R25 | Ciclo completo de Nombramientos | Período, preparación, directorio, junta, sesión, resultados, organigrama y reporte reales |
| R26 | E2EE entre dos dispositivos | Concesión, desbloqueo, revocación vinculada y recuperación del mismo contenido histórico, con negativas y sin claves privadas en servidor |
| R27 | Idiomas completos | Interfaz, errores, estados, documentos/avisos de sistema y formatos en ES/EN/FR |
| R28 | Accesibilidad y dispositivos | Recorridos por teclado/lector y en móvil/tablet/PC con formularios y errores |
| R29 | Resultado incierto, doble envío y salida con cambios | Reconciliación sin duplicados ni falso éxito; protección/recuperación de borradores al navegar/cerrar/recargar/expirar, incluidos adjuntos |
| R30 | Ataques de acceso entre tenants/workspaces | Listados, búsquedas, IDs, documentos, colas, caché, reportes y APIs rechazan cruces |
| R31 | Aislamiento con credenciales productivas | Identidad de A no accede a B; roles y redes por servicio comprobados |
| R32 | Fallas parciales y concurrencia | Servicios sobreviven o fallan de forma controlada sin perder integridad |
| R33 | Arranque, estado y recuperación | Dependencias comprobadas y diagnóstico preciso, sin éxito engañoso |
| R34 | Restaurar y operar un tenant | Backup íntegro, archivos y configuración, custodia adecuada y funcionamiento posterior |
| R35 | Rendimiento reproducible | Línea base, carga/red declaradas, medición final y presupuestos justificados |
| R36 | Piloto de uso y revisión independiente | Tareas reales por perfiles, hallazgos cerrados y límites de evaluación documentados |

## 17 Estrategia de pruebas y evidencia

Construye primero fixtures y ejecución aislada para las pruebas que hoy escriben en Central. No ejecutar `pnpm test`, suites live o `test:e2e` indiscriminadamente hasta leer sus destinos y condiciones. Mantener opt-in y limpieza segura de fixtures.

La suite debe combinar:

- Unitarias de reglas y componentes; comprobar comportamiento, no solo búsqueda de cadenas en el código.
- Contratos/API e integración entre servicios con persistencia real.
- E2E de navegador con roles diferentes y verificación después de recarga y nueva sesión autorizada.
- Autorización negativa, privacidad, aislamiento, revocación y concurrencia.
- Estados de error, timeout, reintento, proveedor no disponible y recuperación.
- Regresiones visuales en anchos e idiomas del alcance, sin aprobar snapshots cambiados automáticamente.
- Accesibilidad automatizada y manual, rendimiento y restauración.
- Pruebas específicas de E2EE/federación y recorrido final de Nombramientos.

Ejecutar typecheck, lint, compilaciones completas de ambos proyectos, contratos/OpenAPI, auditoría de dependencias y scanner de secretos. Usar las versiones reales instaladas y registrar configuración. Los tests HTTP empiezan únicamente cuando los health checks confirman disponibilidad.

Ninguna prueba necesaria omitida, saltada, en TODO, exclusivamente mock o fallida puede acreditarse como aceptación completa. Si una prueba es legítimamente no aplicable, documentar razón y aprobación antes del cierre; no usar esta categoría para una dependencia faltante.

Para casos principales, guardar evidencia visual, resultado del backend/persistencia, archivo exportado cuando aplique, evento de auditoría y comandos reproducibles, sin datos sensibles. Los logs completos se custodian de manera restringida; el reporte distribuible se sanitiza.

Organizar la matriz por módulo, actor, permiso, estado, idioma, dispositivo y variantes críticas. Cubrir las combinaciones de riesgo y justificar la estrategia, no prometer todas las permutaciones posibles. Cada botón autorizado y cada resultado visible deben tener evidencia de comportamiento o prueba explícita.

## 18 Validación con personas y evaluación externa

Preparar un piloto en staging aislado con directores, integrantes, Secretaría, ancianos y personas mayores, incluyendo usuarios con cargos múltiples. Medir finalización sin ayuda, tiempo, errores, recuperación y comprensión de estados. Acordar tareas y umbrales de aceptación con el dueño antes de ejecutar.

Preparar revisión lingüística y accesibilidad con participantes competentes, y una evaluación de seguridad independiente proporcional al riesgo. No contratar, contactar ni compartir datos con terceros sin autorización. Si no hay participantes o evaluador, dejar la aceptación correspondiente pendiente; la simulación técnica no los reemplaza.

La referencia al mercado se limita a patrones y tareas comparables. No afirmar que la aplicación supera a todas las herramientas sin un benchmark independiente y reproducible.

## 19 Secuencia de ejecución obligatoria

1. Diagnosticar entorno, instrucciones, datos y contratos; proteger el trabajo existente.
2. Levantar inventario, línea base, matriz y decisiones de autorización. Priorizar seguridad e integridad antes de apariencia.
3. Preparar fixtures/staging aislados, baseline de regresiones y ruta de recuperación.
4. Implementar consistencia visual, inicio por responsabilidades, recuperación y accesos directos sin perder funcionalidad.
5. Completar i18n/localización, accesibilidad y responsive por proceso, no solo por pantalla.
6. Cerrar contratos, permisos, persistencia, idempotencia, notificaciones, reportes y auditoría de cada mejora.
7. Completar la experiencia guiada y el ciclo real cifrado de Nombramientos, sin retirar controles.
8. Completar endurecimiento autorizado, configuración productiva reproducible y ensayos de fallos/restauración.
9. Ejecutar la matriz completa, revisar resultados, corregir causa y repetir regresiones afectadas y globales.
10. Realizar las validaciones externas/humanas disponibles y registrar las que necesitan coordinación.
11. Verificar compilación final, reinicio oficial con sus efectos de escritura previamente revisados, servicios/dependencias y smoke tests sobre los artefactos finales; no usar evidencias de una compilación anterior.
12. Entregar informe, guía corta por rol, procedimientos y evidencia verificable. Restaurar preferencias de prueba, cerrar sesiones temporales y limpiar solo fixtures propios.

Paralelizar tareas independientes con límites claros de archivos/contratos; integrar y validar el conjunto. Informar avances breves, defectos encontrados y evidencia. No pedir autorización para cada ajuste visual menor ya incluido; sí para cambios materiales y acciones externas descritas.

No terminar porque compiló, se abrió una ruta o pasó el camino feliz. Continuar sobre defectos corregibles dentro del alcance. Si falta una credencial, equipo físico, decisión o evaluación humana externa, agotar alternativas seguras, informar exactamente qué falta y detener solamente la parte dependiente. No crear autorizaciones, simulaciones o atajos para fingir el cierre.

## 20 Entregables y condición de cierre

Entregar:

- Código funcional integrado de ambos proyectos, sin placeholders productivos ni pérdida de capacidades.
- `docs/premium-delivery-plan.md` actualizado al resultado real.
- `docs/premium-requirements-matrix.md` con trazabilidad de cada requisito y escenario.
- `docs/premium-authorization-decisions.md` con decisiones aprobadas, diferidas y sus impactos.
- Evidencias sanitizadas en `docs/premium-evidence/`, separadas por versión/ejecución.
- `docs/premium-release-report.md` con correcciones, pruebas, exclusiones, riesgos, gates y resultados finales.
- Guía breve por rol e idioma, notas de configuración, despliegue, restauración, diagnóstico y rollback.
- Registro antes/después de botones, rutas, capacidades y reglas; demostrar que siguen disponibles y funcionales.

En el informe distinguir dos estados, sin mezclarlos:

1. **Consolidación implementada y verificada:** todos los cambios autorizados y sus regresiones pasan sobre los artefactos finales; sin pendientes obligatorios de esa categoría.
2. **Salida productiva aprobada:** además están demostrados infraestructura real, aislamiento de credenciales, entregas autorizadas, restauración, custodia E2EE, carga y validaciones humanas/independientes necesarias; las decisiones de riesgo cuentan con aprobación expresa.

Si el primero está completo y el segundo no, decirlo. No declarar «100% de toda la propuesta», «lista para producción», «WCAG certificada», «NASA level» o «seguridad absoluta» mientras queden gates obligatorios pendientes. Una aceptación de riesgo documentada no transforma un control ausente en uno implementado.

Para declarar completado el 100% del alcance aprobado se requiere:

- Inventario y requisitos aplicables cerrados, sin funcionalidades eliminadas ni cambios de autoridad no autorizados.
- UI, gateway, servicios, persistencia, permisos y resultados conectados y comprobados por escenario.
- ES/EN/FR y accesibilidad evaluados conforme al alcance, no solo presentes como opciones.
- Procesos persistentes completos, incluido Nombramientos cifrado y recuperación.
- Regresiones, builds y comprobaciones finales aprobadas, con conteos sin duplicar y sin omisiones necesarias.
- Datos reales preservados; ningún mensaje, privilegio, despliegue o cambio sensible no autorizado.
- Gates externos y productivos exigidos satisfechos o estado global explícitamente incompleto, nunca ocultos.

La respuesta final debe resumir resultado, enlaces a evidencias, estado real de servicios, cobertura, riesgos y cualquier bloqueo. No reproducir contraseñas ni padrones. La entrega debe permitir que otro técnico reproduzca las comprobaciones y que un usuario autorizado complete sus tareas sin instrucciones técnicas externas.

## 21 Referencias verificables

Usar las fuentes oficiales y verificar su versión al ejecutar. Estas referencias orientan requisitos; no certifican por sí mismas la aplicación:

- [WCAG 2.2 de W3C](https://www.w3.org/TR/WCAG22/) para accesibilidad de páginas y procesos.
- [OWASP ASVS](https://owasp.org/projects/asvs) para controles verificables de seguridad.
- [Heurísticas de usabilidad de Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/) para claridad, consistencia y prevención/recuperación de errores.
- [Web Vitals](https://web.dev/articles/vitals) para objetivos de rendimiento de experiencia y distinción entre laboratorio/campo.
- Manual oficial de Iglesia Adventista vigente, cuya fuente y edición deben verificarse en la ejecución cuando corresponda validar funciones departamentales.

**Orden final de ejecución:** cuando el propietario autorice ejecutar este prompt, inicia la implementación sobre la aplicación existente, verifica backend y frontend de extremo a extremo y continúa hasta cerrar todos los requisitos autorizados y demostrables. No elimines capacidades, no cambies la línea gráfica ni debilites seguridad. Si una dependencia real impide el cierre, reporta el estado incompleto con precisión; nunca sustituyas evidencia por la frase «100%». Finaliza solo con entrega verificable y una declaración honesta de su alcance y gates.
