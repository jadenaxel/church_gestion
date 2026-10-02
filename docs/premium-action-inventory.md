# Inventario de acciones: GestionChurch

1–2 de octubre de 2026; inventario conservado y ampliado durante la ejecución. Baseline: 27 archivos page.tsx y 268 etiquetas button en páginas; corte anterior 27/287. Recuento de fuente m3K6: **27 páginas / 288 etiquetas button**, incluye guardado explícito y cola Identidad. Los counts estáticos no certifican preservación o cobertura; loops, componentes y permisos cambian el número runtime. API Gateway es la entrada GC; persistencia se verifica dentro de la base del tenant autenticado. OpenAPI valida 153 rutas; no equivale a 153 pruebas de comportamiento.

| Área/ruta | Acciones conservadas | Actor/servicio, evidencia pendiente |
|---|---|---|
| Login local/global, forgot/reset | Ingresar, mostrar clave local, solicitar recuperación, restablecer | Identidad/Global; origen/sesión/entrega; no credenciales precargadas |
| Global, global/audit | Buscar/crear tenant, canales, SSO, filtros/CSV/detalle | G; Tenancy/Identidad/Audit; tenant nuevo sintético |
| Dashboard | 6 KPI, atención, forecast, gráficos, agenda, ancianos, drill-down | Permisos efectivos; Calendar/Elders; datos y fuente de cada cifra |
| Calendar | Mes/agenda, anterior/siguiente/hoy, buscar/limpiar, filtros, actividad/junta/PM/ancianos | Lectura autorizada; Calendar; informativos no reservan |
| Activities/new | Plantilla, datos, opciones/sesiones, recursos, disponibilidad, archivo, guardar borrador, envío, alternativa, revisión | Director/planificador; Calendar/File; guardado completo sin envío/reserva, atomicidad, múltiples fechas |
| Activities/[id]/edit y detalle | Editar/proponer, customData/snapshot histórico, enviar/cancelar/completar, archivo/descarga, motivo/fecha/lugar | Actor/estado; Calendar/File; director no elimina aprobado, campos retirados/ocultos no alterables |
| Reviews | Crear/seguir junta, participantes/casos, RSVP/asistencia/iniciar/cerrar/acta; aprobar actividad; autorizar/rechazar cambio; crear/seleccionar alternativa, recomendar, posponer/coexistencia | Secretaría/administración según política; Calendar/Notifications; no enviado=confirmado |
| Reports | Fecha/departamento/estado/búsqueda, KPI/gráficos/lista/detalle, PDF/CSV/limpiar | Reports + permiso por recurso; filtro/export iguales |
| Audit | 6 filtros, buscar/limpiar/actualizar/excepciones/CSV/expandir/paginar | A/G según alcance; lectura protegida |
| Documents | Filtros, carga, versión, visor, descarga, retiro, revisión de alineación | File; privacidad, tipo, cuota y AV |
| Notifications | Buscar, leído/no leído/todos, preferencias, consentimiento, reintentar | Identity/Notification; no éxito antes de persistir |
| Team | Crear usuario, perfil, varias membresías/roles, agregar/quitar | A/Identidad; roles acumulados, revocación |
| Settings/departments | Crear/buscar/seleccionar departamento, integrante nuevo/existente, cambiar rol/retirar | A/Identity; referencias del tenant |
| Settings/roster | Plantilla, archivo, preview/commit, duplicados, foto, sexo/estado/search, KPI filtros | A/Identity/File; filas y fotos privadas |
| Settings/activity-form | Built-in/custom/secciones/required/tipos/opciones/reordenar, borrador, preview desktop/móvil, publicar | A/Calendar; preview no publica |
| Settings/channels | Proveedores/credenciales/configguardar, verificación/prueba email/WA, copiar webhook | Solo admins vigentes; Notification; estado proveedor honesto |
| Ministry-hub | Control/Estrategia/Programas/Tareas/Presupuesto/Reuniones/Operación/Equipo; 12 tipos de modal y transiciones, menciones, PDF/CSV | Membresías/cargos; Department Operations; registros especializados por pack |
| Personal-ministries | 8 pestañas; 11 tipos de modal: plan/iniciativa/asignación/partida/contacto/estudio/grupo/minuto/campaña/proyección/presupuesto y transiciones | Equipo PM; Personal Ministries; presupuesto y privacidad |
| Womens-ministry | 5 pestañas; perfil/actividad/partida/participación/retiro/inscripción/pago/seguimiento; cumpleaños | Equipo Mujer; Women's Ministry; pagos y deduplicación |
| Elders | Agenda/cobertura/turnos/programas/plataforma/publicación; anual, rotación, fotos, publicar/HTML, plantilla/orden/participantes | E/primera ancianía/A/S según permiso; Elders/File |
| Nominations | Lanzar SSO, reintentar, retornar | Permiso módulo; federación sesión origen; inventario propio Nombramientos |
| Compartidos | Menú permisado/retráctil/móvil/logout, ES/EN/FR/preferencias, modal/foco/Escape, tabs/teclado, buscadores/orden | Mantener capacidades y foco; estado desconocido no cero |

Para cada fila, R01–R36 incluyen positivos/negativos, estados y persistencia. El inventario se amplía al descubrir acciones; no se convierte este conteo estático en aceptación automática.

## Acciones nuevas y conexiones verificadas

| ID estable | Entrada y efecto | Servicio/persistencia/permiso | Evidencia y límite |
|---|---|---|---|
| GC-TEAM-ROLE-EDIT | Editar asignaciones; seleccionar comisión/custodio; guardar o cancelar | Identidad PATCH/users/:id, roles actuales+expectedRoles bajo lock, audit; users.manage | Team browser y NI4; conserva perfil/cargos/membresías, retira solo delta explícito; ninguna cuenta real modificada |
| GC-QUEUE-CALENDAR-LIST | Consultar publicaciones agotadas sin revelar payload | Calendar GET/calendar/outbox/dead-letter; users.manage | REC7 y browser; error no se presenta como lista vacía |
| GC-QUEUE-CALENDAR-RETRY | Seleccionar, explicar razón, confirmar, reprogramar mismoID | Calendar POST/calendar/outbox/:id/retry; reset+auditTX | REC7/browser; entregado/intentos restantes/repetición409, concurrencia1ganador; no equivale a envío recibido |
| GC-QUEUE-DEPARTMENT-LIST | Consultar cola departamental independiente | DepartmentOperations GET/department-operations/outbox/dead-letter; users.manage | HUB y unit UI; browser calendario no acredita esta segunda fuente |
| GC-QUEUE-DEPARTMENT-RETRY | Confirmación+razón10–500, recuperación del mismo evento | DepartmentOperations POST/department-operations/outbox/:id/retry; auditTX | HUB6 recuperación+DB4; falta recorrido browser específico por error parcial |
| GC-SESSION-OPEN-LOGIN | Abrir acceso en otra pestaña por decisión humana | Ruta login; formulario anterior sigue montado en memoria | Browser expiración+File; sin login automático ni MFA nuevo |
| GC-SESSION-VERIFY | Comprobar sesión y continuar; refrescar permisos | Identidad GET/me, compara sub/scope/tenant, bloquea API privada mientras no se verifica | Browser misma cuenta conserva File; no reenvía automáticamente comando |
| GC-SESSION-DISCARD | Cambió identidad/iglesia: purgar contexto y abrir Inicio | Desmonta árbol/aborta solicitudes, no comparte borrador ni File con nueva identidad | Browser cuenta distinta; abortar cliente no revierte una escritura ya recibida por servidor |
| GC-NAV-DIRTY-CONFIRM | Cancelar o confirmar salida, Back y logout con cambios | Provider de navegación y beforeunload; conserva índices Next | Browser link/Back y unit reglas; cierre/recarga no restaura archivo/borrador persistente |
| GC-ACTIVITY-ACK-RETRY | Reintentar confirmación tras respuesta perdida | Actividad+adjunto mantienen cuerpo/key/draftID/File/uploadKey en memoria; recibos de servidor | Browser pierde ACK real después de ambos commits; una actividad/archivo y claves iguales |
| GC-ACTIVITY-DRAFT-SAVE | Guardar formulario completo válido y programa confirmado, abrir detalle y editar | POST actividad DRAFT + File autorizados; no /submit ni reserva; mismos recibos/keys | Browser final21: create/upload ACK perdido, una actividad/archivo, detalle después de recarga/nueva pestaña. Incompletos/pendientes sin ACK siguen RAM |
| GC-ACTIVITY-SNAPSHOT-EDIT | Editar respuestas visibles de la versión persistida | PATCH customData/expectedVersion, validación snapshot; propuesta autorizada para aprobado | CAL9/unit/browser finales incluidos; ocultos/retirados preservados y cambio rechazado. No todas las recurrencias/tipos |
| GC-QUEUE-IDENTITY-LIST | Consultar metadata, vigencia y causa de retiro | GET/auth/password/outbox/dead-letter; users.manage; no token/email/URL/payload | RESET8 y browser final21; usado/vencido/inactivo no reprogramable |
| GC-QUEUE-IDENTITY-RETRY | Razón/confirmación, mismoID y audit atómicos | POST/auth/password/outbox/:id/retry; users.manage; válida/exhausta/no lease activa | RESET8/DB17/browser, ya incluidos en103/66/21;201 significa reprogramado, no enviado |
| GC-DASHBOARD-RETRY | Carga fallida muestra error y acción Reintentar | DashboardAPI/permisos; no KPI0 inventado | Browser503→respuesta real y unit evidencia; no todas las próximas acciones por rol |
| GC-FORM-PROVENANCE | Texto SYSTEM localizado, CUSTOM/legacy preservado | Metadata por propiedad sin backfill; draft/version/preview/publicación existentes | Unit/backend y browser formulario; no inferir traducción por coincidencia de nombre |
| GC-REPORT-LOCALE | CSV/PDF y UI con lang es/en/fr, timezone del tenant | Reports y export Hub, filtros/privacidad existentes | LOC6/browser/PDF revisados por separado; native review pendiente |
| NOM-CYCLE-GUIDED-START | Dos accesos válidos a Iniciar proceso → mismo asistente | Nom API/cycles y custodia existentes; período draft no activation | Browser: fechas2027, guardar y recarga; no ciclo cifrado completo browser |

## Cobertura y preservación: lectura correcta

Los resultados exactos están en `premium-requirements-matrix.md` y `premium-evidence/2026-10-01/`. Las pruebas API verifican numerosas mutaciones de dominio y negativas; las de navegador realizan21 escenarios (18GC+3Nom), no todas las acciones del inventario. La navegación16 rutas×7anchos prueba carga/reflow inicial, no todas las pestañas, datos extensos, modales, campos, transiciones ni mensajes de cada rol. El ciclo cifrado Nom del arnés API tampoco equivale a recorrer todos sus botones.

No se retiraron intencionalmente capacidades del inventario ni se sustituyó el stack/plantilla. Se conservan vías previas, campos, opciones, roles acumulados y controles de autoridad. Sin una matriz positiva/negativa por cada acción y estado no se declara preservación funcional universal comprobada. Pendientes: ampliar cobertura por acción/rol/idioma, estados y datos extensos, reportes Nom, zoom/lectores/dispositivos físicos y piloto. Son requisitos abiertos, no exclusiones aprobadas.
