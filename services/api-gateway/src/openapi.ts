const json = {
	'application/json': {
		schema: { type: 'object', additionalProperties: true },
	},
};
const ok = { description: 'Operación completada.', content: json };
const created = { description: 'Recurso creado.', content: json };
const problem = {
	description: 'Error normalizado.',
	content: {
		'application/problem+json': {
			schema: { $ref: '#/components/schemas/Problem' },
		},
	},
};
const secured = [{ cookieAuth: [] }];

type Verb = 'get' | 'post' | 'patch' | 'delete';
type Route = [Verb, string, string, string, boolean?];
const routes: Route[] = [
	[
		'post',
		'/api/v1/auth/login',
		'Identidad',
		'Iniciar sesión en un tenant',
		false,
	],
	[
		'post',
		'/api/v1/auth/global/login',
		'Identidad',
		'Iniciar sesión como administrador global',
		false,
	],
	['post', '/api/v1/auth/logout', 'Identidad', 'Cerrar sesión'],
	[
		'post',
		'/api/v1/auth/password/forgot',
		'Identidad',
		'Solicitar restablecimiento',
		false,
	],
	[
		'post',
		'/api/v1/auth/password/reset',
		'Identidad',
		'Restablecer contraseña',
		false,
	],
	['patch', '/api/v1/auth/password', 'Identidad', 'Cambiar contraseña'],
  ['get', '/api/v1/auth/password/outbox/dead-letter', 'Identidad', 'Consultar metadatos de avisos de recuperación agotados o retirados (users.manage)'],
  ['post', '/api/v1/auth/password/outbox/{id}/retry', 'Identidad', 'Reprogramar aviso de recuperación agotado con token vigente y reason auditado (users.manage)'],
	['post', '/api/v1/auth/sessions/revoke-all', 'Identidad', 'Revocar sesiones'],
	['get', '/api/v1/me', 'Identidad', 'Consultar sesión'],
	['get', '/api/v1/users', 'Identidad', 'Listar usuarios'],
	['post', '/api/v1/users', 'Identidad', 'Crear usuario'],
	['patch', '/api/v1/users/{id}', 'Identidad', 'Actualizar usuario'],
	['get', '/api/v1/roles', 'Identidad', 'Listar roles y permisos'],
	[
		'get',
		'/api/v1/department-memberships',
		'Identidad',
		'Listar membresías departamentales',
	],
	[
		'post',
		'/api/v1/department-memberships',
		'Identidad',
		'Asignar o actualizar rol departamental',
	],
	[
		'delete',
		'/api/v1/department-memberships/{userId}/{departmentId}',
		'Identidad',
		'Retirar una membresía departamental',
	],
	[
		'get',
		'/api/v1/roster/context',
		'Padrón',
		'Consultar el padrón maestro aislado del tenant',
	],
	[
		'post',
		'/api/v1/roster/imports/preview',
		'Padrón',
		'Validar y previsualizar una importación de padrón',
	],
	[
		'post',
		'/api/v1/roster/imports/{id}/commit',
		'Padrón',
		'Confirmar las filas válidas de una importación',
	],
	['get', '/api/v1/global/tenants', 'Tenants', 'Listar tenants'],
	['post', '/api/v1/global/tenants', 'Tenants', 'Provisionar tenant'],
	[
		'patch',
		'/api/v1/global/tenants/{id}/status',
		'Tenants',
		'Cambiar estado del tenant',
	],
	[
		'get',
		'/api/v1/global/audit/events',
		'Auditoría',
		'Consultar eventos globales o de un tenant autorizado',
	],
	[
		'get',
		'/api/v1/global/audit/events.csv',
		'Auditoría',
		'Exportar auditoría global o de un tenant',
	],
	['get', '/api/v1/tenant/settings', 'Tenants', 'Consultar configuración'],
	['patch', '/api/v1/tenant/settings', 'Tenants', 'Actualizar configuración'],
	['get', '/api/v1/departments', 'Calendario', 'Listar departamentos'],
	['post', '/api/v1/departments', 'Calendario', 'Crear departamento'],
	[
		'patch',
		'/api/v1/departments/{id}',
		'Calendario',
		'Actualizar departamento',
	],
	['get', '/api/v1/venues', 'Calendario', 'Listar lugares'],
	['post', '/api/v1/venues', 'Calendario', 'Crear lugar'],
	['get', '/api/v1/resources', 'Calendario', 'Listar recursos'],
	['post', '/api/v1/resources', 'Calendario', 'Crear recurso'],
  ['get', '/api/v1/calendar/outbox/dead-letter', 'Calendario', 'Consultar metadatos de publicaciones agotadas (users.manage)'],
  ['post', '/api/v1/calendar/outbox/{id}/retry', 'Calendario', 'Reprogramar publicación agotada con reason auditado (users.manage)'],
  ['get', '/api/v1/department-operations/outbox/dead-letter', 'Operaciones departamentales', 'Consultar metadatos de avisos departamentales agotados (users.manage)'],
  ['post', '/api/v1/department-operations/outbox/{id}/retry', 'Operaciones departamentales', 'Reprogramar aviso departamental agotado con reason auditado (users.manage)'],
	[
		'get',
		'/api/v1/calendar/settings',
		'Calendario',
		'Consultar reglas del calendario',
	],
	[
		'patch',
		'/api/v1/calendar/settings',
		'Calendario',
		'Actualizar reglas del calendario',
	],
	[
		'get',
		'/api/v1/activity-form/template',
		'Formularios',
		'Consultar formulario de actividades publicado y borrador autorizado',
	],
	[
		'patch',
		'/api/v1/activity-form/template/draft',
		'Formularios',
		'Guardar borrador del formulario de actividades',
	],
	[
		'post',
		'/api/v1/activity-form/template/publish',
		'Formularios',
		'Publicar formulario de actividades',
	],
	['get', '/api/v1/activities', 'Actividades', 'Buscar actividades'],
	['post', '/api/v1/activities', 'Actividades', 'Crear actividad'],
	['get', '/api/v1/activities/{id}', 'Actividades', 'Consultar actividad'],
	[
		'patch',
		'/api/v1/activities/{id}',
		'Actividades',
		'Editar actividad con control de versión',
	],
	['post', '/api/v1/activities/{id}/submit', 'Actividades', 'Enviar actividad'],
	[
		'post',
		'/api/v1/activities/{id}/options/{optionId}/confirm',
		'Actividades',
		'Confirmar alternativa',
	],
	[
		'post',
		'/api/v1/activities/{id}/approve',
		'Actividades',
		'Aprobar actividad sin conflicto',
	],
	[
		'post',
		'/api/v1/activities/{id}/cancel',
		'Actividades',
		'Cancelar actividad',
	],
	[
		'post',
		'/api/v1/activities/{id}/complete',
		'Actividades',
		'Marcar una actividad finalizada como completada',
	],
	[
		'post',
		'/api/v1/activities/{id}/change-requests',
		'Actividades',
		'Solicitar cambios en una actividad aprobada',
	],
	[
		'get',
		'/api/v1/activity-change-requests',
		'Revisión',
		'Listar solicitudes de cambio de actividades aprobadas',
	],
	[
		'post',
		'/api/v1/activity-change-requests/{id}/decision',
		'Revisión',
		'Autorizar o rechazar una solicitud de cambio',
	],
	[
		'post',
		'/api/v1/activities/{id}/request-review',
		'Revisión',
		'Solicitar revisión de conflicto',
	],
	['get', '/api/v1/availability', 'Calendario', 'Detectar conflictos'],
	[
		'get',
		'/api/v1/availability/suggestions',
		'Calendario',
		'Sugerir intervalos libres',
	],
	['get', '/api/v1/review-requests', 'Revisión', 'Listar solicitudes'],
	[
		'get',
		'/api/v1/review-requests/{id}/alternative-suggestions',
		'Revisión',
		'Sugerir alternativas libres para un caso',
	],
	[
		'post',
		'/api/v1/review-requests/{id}/alternatives',
		'Revisión',
		'Crear alternativa para un caso',
	],
	[
		'post',
		'/api/v1/review-requests/{id}/recommendations',
		'Revisión',
		'Registrar recomendación',
	],
	[
		'post',
		'/api/v1/review-requests/{id}/decision',
		'Revisión',
		'Registrar decisión final',
	],
	[
		'get',
		'/api/v1/review-sessions/eligible-participants',
		'Revisión',
		'Listar usuarios convocables y disponibilidad de WhatsApp',
	],
	[
		'get',
		'/api/v1/review-sessions/my-agenda',
		'Revisión',
		'Consultar juntas en el calendario personal',
	],
	['get', '/api/v1/review-sessions', 'Revisión', 'Listar juntas de revisión'],
	[
		'post',
		'/api/v1/review-sessions',
		'Revisión',
		'Programar junta de revisión',
	],
	[
		'patch',
		'/api/v1/review-sessions/{id}',
		'Revisión',
		'Actualizar junta de revisión',
	],
	[
		'patch',
		'/api/v1/review-sessions/{id}/response',
		'Revisión',
		'Confirmar o declinar asistencia',
	],
	['get', '/api/v1/dashboard', 'Analítica', 'Consultar métricas'],
	[
		'get',
		'/api/v1/reports/overview',
		'Reportes',
		'Consultar reporte analítico filtrable',
	],
	[
		'get',
		'/api/v1/reports/activities.csv',
		'Reportes',
		'Exportar detalle analítico CSV',
	],
	[
		'get',
		'/api/v1/reports/executive.pdf',
		'Reportes',
		'Exportar reporte ejecutivo PDF',
	],
	[
		'get',
		'/api/v1/audit/events',
		'Auditoría',
		'Consultar la bitácora inmutable del tenant',
	],
	[
		'get',
		'/api/v1/audit/events.csv',
		'Auditoría',
		'Exportar la bitácora inmutable del tenant',
	],
	[
		'get',
		'/api/v1/elders/context',
		'Ancianos',
		'Consultar centro operativo de ancianos',
	],
	[
		'get',
		'/api/v1/elders/department-assignments',
		'Ancianos',
		'Consultar cobertura de ancianos por departamento',
	],
	[
		'post',
		'/api/v1/elders/department-assignments',
		'Ancianos',
		'Asignar un anciano a uno o más departamentos',
	],
	[
		'patch',
		'/api/v1/elders/department-assignments/{id}',
		'Ancianos',
		'Actualizar cobertura departamental',
	],
	['get', '/api/v1/elders/rotations', 'Ancianos', 'Consultar turnos anuales'],
	[
		'post',
		'/api/v1/elders/rotations/annual-plan',
		'Ancianos',
		'Generar el calendario anual de turnos',
	],
	[
		'post',
		'/api/v1/elders/rotations',
		'Ancianos',
		'Programar uno o más ancianos',
	],
	[
		'patch',
		'/api/v1/elders/rotations/{id}',
		'Ancianos',
		'Actualizar un turno de ancianos',
	],
	[
		'get',
		'/api/v1/elders/platform/templates',
		'Ancianos',
		'Consultar plantillas de orden de culto',
	],
	[
		'post',
		'/api/v1/elders/platform/templates',
		'Ancianos',
		'Crear plantilla personalizada de culto',
	],
	[
		'get',
		'/api/v1/elders/programs',
		'Ancianos',
		'Consultar programas de cultos',
	],
	['post', '/api/v1/elders/programs', 'Ancianos', 'Crear programa de culto'],
	[
		'patch',
		'/api/v1/elders/programs/{id}',
		'Ancianos',
		'Actualizar programa de culto',
	],
	[
		'get',
		'/api/v1/elders/programs/{id}/platform',
		'Ancianos',
		'Consultar plataforma y orden minuto a minuto',
	],
	[
		'patch',
		'/api/v1/elders/programs/{id}/platform',
		'Ancianos',
		'Guardar plataforma y participantes del culto',
	],
	[
		'post',
		'/api/v1/elders/programs/{id}/platform/apply-template',
		'Ancianos',
		'Aplicar plantilla al orden del culto',
	],
	[
		'post',
		'/api/v1/elders/programs/{id}/media',
		'Ancianos',
		'Cargar fotografía de predicador o artista',
	],
	[
		'get',
		'/api/v1/elders/media/{id}',
		'Ancianos',
		'Consultar fotografía autorizada',
	],
	[
		'get',
		'/api/v1/elders/calendar',
		'Ancianos',
		'Consultar asignaciones visibles para el calendario',
	],
	[
		'get',
		'/api/v1/elders/dashboard',
		'Ancianos',
		'Consultar resumen para el centro de control',
	],
	[
		'get',
		'/api/v1/personal-ministries/context',
		'Ministerios Personales',
		'Consultar centro misionero, equipo, estrategia y seguimiento',
	],
	[
		'get',
		'/api/v1/personal-ministries/calendar',
		'Ministerios Personales',
		'Consultar iniciativas, campañas y minutos misioneros para el calendario',
	],
	[
		'post',
		'/api/v1/personal-ministries/strategic-plans',
		'Ministerios Personales',
		'Crear plan estratégico',
	],
	[
		'post',
		'/api/v1/personal-ministries/initiatives',
		'Ministerios Personales',
		'Crear iniciativa y asignar responsable',
	],
	[
		'patch',
		'/api/v1/personal-ministries/initiatives/{id}',
		'Ministerios Personales',
		'Actualizar progreso de iniciativa',
	],
	[
		'post',
		'/api/v1/personal-ministries/initiatives/{id}/assignments',
		'Ministerios Personales',
		'Asignar responsabilidad al equipo',
	],
	[
		'post',
		'/api/v1/personal-ministries/initiatives/{id}/budget-entries',
		'Ministerios Personales',
		'Registrar compromiso, gasto o ingreso presupuestario',
	],
	[
		'patch',
		'/api/v1/personal-ministries/budget-entries/{id}',
		'Ministerios Personales',
		'Aprobar, pagar o anular una partida presupuestaria',
	],
	[
		'post',
		'/api/v1/personal-ministries/contacts',
		'Ministerios Personales',
		'Registrar interesado',
	],
	[
		'patch',
		'/api/v1/personal-ministries/contacts/{id}',
		'Ministerios Personales',
		'Actualizar recorrido de interesado',
	],
	[
		'post',
		'/api/v1/personal-ministries/bible-studies',
		'Ministerios Personales',
		'Registrar estudio bíblico',
	],
	[
		'patch',
		'/api/v1/personal-ministries/bible-studies/{id}',
		'Ministerios Personales',
		'Actualizar estudio bíblico',
	],
	[
		'post',
		'/api/v1/personal-ministries/small-groups',
		'Ministerios Personales',
		'Crear grupo pequeño',
	],
	[
		'patch',
		'/api/v1/personal-ministries/small-groups/{id}',
		'Ministerios Personales',
		'Actualizar grupo pequeño',
	],
	[
		'post',
		'/api/v1/personal-ministries/missionary-minutes',
		'Ministerios Personales',
		'Calendarizar minuto misionero',
	],
	[
		'patch',
		'/api/v1/personal-ministries/missionary-minutes/{id}',
		'Ministerios Personales',
		'Actualizar minuto misionero',
	],
	[
		'post',
		'/api/v1/personal-ministries/campaigns',
		'Ministerios Personales',
		'Planificar campaña evangelística',
	],
	[
		'patch',
		'/api/v1/personal-ministries/campaigns/{id}',
		'Ministerios Personales',
		'Actualizar resultados de campaña',
	],
	[
		'get',
		'/api/v1/womens-ministry/context',
		'Ministerio de la Mujer',
		'Consultar centro operativo, roster, actividades, retiro y seguimiento',
	],
	[
		'post',
		'/api/v1/womens-ministry/women',
		'Ministerio de la Mujer',
		'Agregar o enlazar una mujer al roster ministerial',
	],
	[
		'post',
		'/api/v1/womens-ministry/activities',
		'Ministerio de la Mujer',
		'Enlazar actividad calendarizada con planificación y presupuesto',
	],
	[
		'patch',
		'/api/v1/womens-ministry/activities/{id}',
		'Ministerio de la Mujer',
		'Actualizar ejecución y resultado de actividad',
	],
	[
		'post',
		'/api/v1/womens-ministry/activities/{id}/budget',
		'Ministerio de la Mujer',
		'Registrar partida presupuestaria, gasto o ingreso',
	],
	[
		'post',
		'/api/v1/womens-ministry/activities/{id}/participation',
		'Ministerio de la Mujer',
		'Registrar participación individual',
	],
	[
		'post',
		'/api/v1/womens-ministry/retreats',
		'Ministerio de la Mujer',
		'Crear retiro espiritual anual',
	],
	[
		'post',
		'/api/v1/womens-ministry/retreats/{id}/registrations',
		'Ministerio de la Mujer',
		'Registrar participante del retiro',
	],
	[
		'patch',
		'/api/v1/womens-ministry/retreat-registrations/{id}',
		'Ministerio de la Mujer',
		'Actualizar asistencia y logística del retiro',
	],
	[
		'post',
		'/api/v1/womens-ministry/retreat-registrations/{id}/payments',
		'Ministerio de la Mujer',
		'Registrar pago del retiro con trazabilidad',
	],
	[
		'post',
		'/api/v1/womens-ministry/follow-ups',
		'Ministerio de la Mujer',
		'Crear seguimiento de inclusión o participación',
	],
	[
		'patch',
		'/api/v1/womens-ministry/follow-ups/{id}',
		'Ministerio de la Mujer',
		'Actualizar seguimiento individual',
	],
	[
		'get',
		'/api/v1/department-operations/context',
		'Operaciones departamentales',
		'Consultar el centro operativo del departamento autorizado',
	],
	[
		'get',
		'/api/v1/department-operations/reports/executive.pdf',
		'Operaciones departamentales',
		'Generar reporte ejecutivo departamental en PDF',
	],
	[
		'get',
		'/api/v1/department-operations/reports/executive.csv',
		'Operaciones departamentales',
		'Exportar datos operativos departamentales en CSV',
	],
	[
		'post',
		'/api/v1/department-operations/plans',
		'Operaciones departamentales',
		'Crear un plan anual',
	],
	[
		'post',
		'/api/v1/department-operations/plans/{id}/approve',
		'Operaciones departamentales',
		'Aprobar y activar un plan anual',
	],
	[
		'post',
		'/api/v1/department-operations/objectives',
		'Operaciones departamentales',
		'Crear un objetivo medible',
	],
	[
		'post',
		'/api/v1/department-operations/initiatives',
		'Operaciones departamentales',
		'Crear un programa, campaña, proyecto o actividad',
	],
	[
		'patch',
		'/api/v1/department-operations/initiatives/{id}',
		'Operaciones departamentales',
		'Actualizar ejecución y resultados',
	],
	[
		'post',
		'/api/v1/department-operations/initiatives/{id}/assignments',
		'Operaciones departamentales',
		'Asignar responsabilidad a un integrante',
	],
	[
		'post',
		'/api/v1/department-operations/budget',
		'Operaciones departamentales',
		'Registrar una partida presupuestaria',
	],
	[
		'patch',
		'/api/v1/department-operations/budget/{id}',
		'Operaciones departamentales',
		'Aprobar, pagar o rechazar una partida',
	],
	[
		'post',
		'/api/v1/department-operations/tasks',
		'Operaciones departamentales',
		'Crear y asignar una tarea',
	],
	[
		'patch',
		'/api/v1/department-operations/tasks/{id}',
		'Operaciones departamentales',
		'Actualizar el estado de una tarea',
	],
	[
		'post',
		'/api/v1/department-operations/meetings',
		'Operaciones departamentales',
		'Programar una reunión y notificar participantes',
	],
	[
		'patch',
		'/api/v1/department-operations/meetings/{id}',
		'Operaciones departamentales',
		'Guardar acta y cerrar una reunión',
	],
	[
		'post',
		'/api/v1/department-operations/decisions',
		'Operaciones departamentales',
		'Registrar un acuerdo con autoridad y evidencia',
	],
	[
		'post',
		'/api/v1/department-operations/comments',
		'Operaciones departamentales',
		'Colaborar y mencionar integrantes',
	],
	[
		'post',
		'/api/v1/department-operations/kpis',
		'Operaciones departamentales',
		'Crear un indicador medible',
	],
	[
		'post',
		'/api/v1/department-operations/records',
		'Operaciones departamentales',
		'Crear un registro especializado del ministerio',
	],
	[
		'post',
		'/api/v1/files/activity/{activityId}',
		'Archivos',
		'Cargar programa de actividad',
	],
	[
		'post',
		'/api/v1/files/member-photos/{memberId}',
		'Padrón',
		'Cargar o reemplazar la fotografía de una persona',
	],
	[
		'get',
		'/api/v1/files/member-photos/{memberId}',
		'Padrón',
		'Consultar la fotografía autorizada de una persona',
	],
	[
		'get',
		'/api/v1/files/activity/{activityId}',
		'Archivos',
		'Listar versiones de programas',
	],
	[
		'get',
		'/api/v1/files/department-documents/context',
		'Archivos',
		'Consultar permisos y departamentos de la biblioteca',
	],
	[
		'get',
		'/api/v1/files/department-documents',
		'Archivos',
		'Buscar documentos departamentales',
	],
	[
		'post',
		'/api/v1/files/department-documents',
		'Archivos',
		'Cargar documento departamental',
	],
	[
		'get',
		'/api/v1/files/department-documents/{id}/preview',
		'Archivos',
		'Visualizar documento departamental de forma segura',
	],
	[
		'patch',
		'/api/v1/files/department-documents/{id}/alignment',
		'Archivos',
		'Revisar alineación ministerial del documento',
	],
	[
		'delete',
		'/api/v1/files/department-documents/{id}',
		'Archivos',
		'Eliminar documento departamental con auditoría',
	],
	[
		'get',
		'/api/v1/files/{id}/download',
		'Archivos',
		'Descargar archivo autorizado',
	],
	[
		'post',
		'/api/v1/files/{id}/access-token',
		'Archivos',
		'Crear enlace temporal',
	],
	[
		'delete',
		'/api/v1/files/{id}',
		'Archivos',
		'Eliminar lógicamente un archivo',
	],
	['get', '/api/v1/notifications', 'Notificaciones', 'Consultar bandeja'],
	[
		'patch',
		'/api/v1/notifications/{id}/read',
		'Notificaciones',
		'Marcar notificación leída',
	],
	[
		'get',
		'/api/v1/notifications/preferences',
		'Notificaciones',
		'Consultar preferencias',
	],
	[
		'patch',
		'/api/v1/notifications/preferences',
		'Notificaciones',
		'Actualizar preferencias',
	],
	[
		'get',
		'/api/v1/notifications/channels/settings',
		'Notificaciones',
		'Consultar configuración de canales',
	],
	[
		'patch',
		'/api/v1/notifications/channels/settings',
		'Notificaciones',
		'Configurar correo y WhatsApp',
	],
	[
		'post',
		'/api/v1/notifications/channels/verify/email',
		'Notificaciones',
		'Verificar conexión, TLS y autenticación SMTP',
	],
	[
		'post',
		'/api/v1/notifications/channels/verify/whatsapp',
		'Notificaciones',
		'Verificar credenciales y número en Meta Cloud API',
	],
	[
		'post',
		'/api/v1/notifications/channels/test/email',
		'Notificaciones',
		'Probar entrega por correo',
	],
	[
		'post',
		'/api/v1/notifications/channels/test/whatsapp',
		'Notificaciones',
		'Probar entrega por WhatsApp',
	],
	[
		'get',
		'/api/v1/notifications/dead-letter',
		'Notificaciones',
		'Consultar entregas agotadas',
	],
	[
		'post',
		'/api/v1/notifications/deliveries/{id}/retry',
		'Notificaciones',
		'Reintentar una entrega agotada',
	],
	[
		'get',
		'/api/v1/exports/calendar.ics',
		'Exportaciones',
		'Exportar calendario iCalendar',
	],
	[
		'get',
		'/api/v1/exports/calendar.csv',
		'Exportaciones',
		'Exportar calendario CSV',
	],
	[
		'get',
		'/api/v1/exports/calendar.pdf',
		'Exportaciones',
		'Exportar calendario PDF',
	],
	[
		'get',
		'/api/v1/exports/audit.csv',
		'Exportaciones',
		'Exportar auditoría CSV',
	],
	[
		'get',
		'/api/v1/webhooks/meta',
		'Webhooks',
		'Verificar webhook de Meta',
		false,
	],
	[
		'post',
		'/api/v1/webhooks/meta',
		'Webhooks',
		'Recibir estados de Meta',
		false,
	],
];

const paths: Record<string, Record<string, unknown>> = {};
for (const [verb, path, tag, summary, auth = true] of routes) {
	const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
		name: match[1],
		in: 'path',
		required: true,
		schema: { type: 'string', format: 'uuid' },
	}));
	paths[path] ??= {};
	paths[path]![verb] = {
		tags: [tag],
		summary,
		operationId: `${verb}_${path.replaceAll(/[^a-zA-Z0-9]+/g, '_')}`,
		...(auth ? { security: secured } : {}),
		...(parameters.length ? { parameters } : {}),
		...(['post', 'patch'].includes(verb) &&
		!path.includes('/files/activity/') &&
		!path.includes('/files/member-photos/') &&
		path !== '/api/v1/files/department-documents' &&
		path !== '/api/v1/roster/imports/preview'
			? {
					requestBody: { required: true, content: json },
				}
			: {}),
		responses: {
			'200': ok,
			...(verb === 'post' ? { '201': created } : {}),
			'400': problem,
			'401': problem,
			'403': problem,
			'409': problem,
		},
	};
}

paths['/api/v1/calendar/outbox/dead-letter']!.get = {
  ...(paths['/api/v1/calendar/outbox/dead-letter']!.get as Record<string, unknown>),
  responses: {
    '200': { description: 'Metadatos de publicaciones agotadas; nunca incluye payload o destinatarios.', content: { 'application/json': { schema: {
      type: 'object', required: ['items'], additionalProperties: false, properties: { items: { type: 'array', maxItems: 200, items: {
        type: 'object', required: ['id', 'eventType', 'aggregateId', 'attempts', 'createdAt'], additionalProperties: false,
        properties: { id: { type: 'string', format: 'uuid' }, eventType: { type: 'string' }, aggregateId: { type: 'string', format: 'uuid' }, attempts: { type: 'integer', minimum: 8 }, createdAt: { type: 'string', format: 'date-time' } },
      } } },
    } } } },
    '401': problem, '403': problem, '500': problem,
  },
};
paths['/api/v1/calendar/outbox/{id}/retry']!.post = {
  ...(paths['/api/v1/calendar/outbox/{id}/retry']!.post as Record<string, unknown>),
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 10, maxLength: 500 } } } } } },
  responses: { '201': { description: 'El mismo evento queda programado para su worker; no confirma entrega externa.', content: { 'application/json': { schema: { type: 'object', required: ['id', 'retryScheduled'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, retryScheduled: { const: true } } } } } }, '400': problem, '401': problem, '403': problem, '404': problem, '409': problem, '500': problem },
};
for (const [method, suffix] of [['get', 'dead-letter'], ['post', '{id}/retry']] as const) {
  const calendar = paths[`/api/v1/calendar/outbox/${suffix}`]![method] as Record<string, unknown>;
  const department = paths[`/api/v1/department-operations/outbox/${suffix}`]![method] as Record<string, unknown>;
  paths[`/api/v1/department-operations/outbox/${suffix}`]![method] = { ...department, responses: calendar.responses, ...(method === 'post' ? { requestBody: calendar.requestBody } : {}) };
}

paths['/api/v1/auth/password/outbox/dead-letter']!.get = {
  ...(paths['/api/v1/auth/password/outbox/dead-letter']!.get as Record<string, unknown>),
  responses: {
    '200': { description: 'Metadatos sin token, email, URL ni ciphertext. Vencidos/usados/inactivos permanecen visibles sin permitir retry.', content: { 'application/json': { schema: {
      type: 'object', required: ['items'], additionalProperties: false, properties: { items: { type: 'array', maxItems: 200, items: {
        type: 'object', required: ['id', 'eventType', 'aggregateId', 'attempts', 'createdAt', 'expiresAt', 'retryable', 'lastError'], additionalProperties: false,
        properties: { id: { type: 'string', format: 'uuid' }, eventType: { const: 'auth.password_reset_requested' }, aggregateId: { type: 'string', format: 'uuid' }, attempts: { type: 'integer', minimum: 0, maximum: 8 }, createdAt: { type: 'string', format: 'date-time' }, expiresAt: { type: 'string', format: 'date-time' }, retryable: { type: 'boolean' }, lastError: { type: ['string', 'null'], enum: ['TOKEN_EXPIRED', 'TOKEN_USED', 'ACCOUNT_INACTIVE', null] } },
      } } },
    } } } }, '401': problem, '403': problem, '500': problem,
  },
};
paths['/api/v1/auth/password/outbox/{id}/retry']!.post = {
  ...(paths['/api/v1/auth/password/outbox/{id}/retry']!.post as Record<string, unknown>),
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string', minLength: 10, maxLength: 500 } } } } } },
  responses: { '201': { description: 'Mismo evento reprogramado, solo mientras el token sigue vigente. No confirma SMTP ni entrega externa.', content: { 'application/json': { schema: { type: 'object', required: ['id', 'retryScheduled'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, retryScheduled: { const: true } } } } } }, '400': problem, '401': problem, '403': problem, '404': problem, '409': problem, '500': problem },
};

paths['/api/v1/files/activity/{activityId}']!.post = {
	...(paths['/api/v1/files/activity/{activityId}']!.post as Record<
		string,
		unknown
	>),
	requestBody: {
		required: true,
		content: {
			'multipart/form-data': {
				schema: {
					type: 'object',
					required: ['file'],
					properties: { file: { type: 'string', format: 'binary' } },
				},
			},
		},
	},
};
for (const multipartPath of [
	'/api/v1/roster/imports/preview',
	'/api/v1/files/member-photos/{memberId}',
] as const) {
	paths[multipartPath]!.post = {
		...(paths[multipartPath]!.post as Record<string, unknown>),
		requestBody: {
			required: true,
			content: {
				'multipart/form-data': {
					schema: {
						type: 'object',
						required: ['file'],
						properties: { file: { type: 'string', format: 'binary' } },
					},
				},
			},
		},
	};
}
paths['/api/v1/files/department-documents']!.post = {
	...(paths['/api/v1/files/department-documents']!.post as Record<
		string,
		unknown
	>),
	requestBody: {
		required: true,
		content: {
			'multipart/form-data': {
				schema: {
					type: 'object',
					required: [
						'file',
						'departmentId',
						'title',
						'documentType',
						'ministryYear',
						'alignmentBasis',
						'alignmentReference',
						'visibility',
						'alignmentConfirmed',
					],
					properties: {
						file: { type: 'string', format: 'binary' },
						departmentId: { type: 'string', format: 'uuid' },
						title: { type: 'string' },
						description: { type: 'string' },
						documentType: {
							type: 'string',
							enum: [
								'PROGRAM',
								'GUIDE',
								'MINUTES',
								'BUDGET',
								'REPORT',
								'TEMPLATE',
								'OTHER',
							],
						},
						ministryYear: { type: 'integer' },
						alignmentBasis: { type: 'string' },
						alignmentReference: { type: 'string' },
						alignmentNotes: { type: 'string' },
						visibility: {
							type: 'string',
							enum: ['DEPARTMENT', 'LEADERSHIP', 'TENANT'],
						},
						alignmentConfirmed: { type: 'boolean' },
					},
				},
			},
		},
	},
};

export const openApiDocument = {
	openapi: '3.1.0',
	info: {
		title: 'GestionChurch API',
		version: '1.0.0',
		description:
			'Contrato público del núcleo multi-tenant de calendario, identidad, archivos y notificaciones.',
	},
	servers: [
		{ url: 'http://localhost:4000', description: 'Desarrollo local' },
		{ url: 'https://gestionchurch.com', description: 'Producción' },
	],
	tags: [...new Set(routes.map((route) => route[2]))].map((name) => ({ name })),
	paths,
	components: {
		securitySchemes: {
			cookieAuth: { type: 'apiKey', in: 'cookie', name: 'gc_session' },
		},
		schemas: {
			Problem: {
				type: 'object',
				required: ['status', 'code', 'detail'],
				properties: {
					status: { type: 'integer' },
					code: { type: 'string' },
					detail: { type: 'string' },
					correlationId: { type: 'string' },
				},
			},
		},
	},
} as const;
