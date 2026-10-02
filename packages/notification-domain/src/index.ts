import { createHmac, timingSafeEqual } from 'node:crypto';
import { localizedNotification, notificationPayload, type NotificationLocale } from './localization.js';

type NotificationTemplate = {
	title: string;
	body: (payload: Record<string, unknown>) => string;
};

const templates: Record<string, NotificationTemplate> = {
	'activity.submitted': {
		title: 'Actividad enviada',
		body: (p) => `${p.title ?? 'La actividad'} fue enviada para aprobación.`,
	},
	'reservation.provisional_created': {
		title: 'Fecha reservada provisionalmente',
		body: (p) =>
			`${p.title ?? 'La actividad'} conserva provisionalmente el horario seleccionado.`,
	},
	'activity.conflict_detected': {
		title: 'Conflicto de calendario',
		body: (p) =>
			`${p.title ?? 'Una actividad'} presenta un conflicto ${p.severity ?? ''}.`,
	},
	'activity.approved': {
		title: 'Actividad aprobada',
		body: (p) =>
			`${p.title ?? 'La actividad'} fue aprobada y ya forma parte del calendario.`,
	},
	'activity.cancelled': {
		title: 'Actividad cancelada',
		body: (p) =>
			`${p.title ?? 'La actividad'} fue cancelada y liberó su horario.`,
	},
	'activity.changed': {
		title: 'Actividad actualizada',
		body: (p) =>
			`${p.title ?? 'La actividad'} recibió cambios en su planificación.`,
	},
	'review.requested': {
		title: 'Nueva solicitud de revisión',
		body: () => 'Hay un conflicto que requiere revisión de la junta.',
	},
	'review.recommendation_added': {
		title: 'Nueva recomendación',
		body: (p) =>
			`${p.title ?? 'Una solicitud'} recibió una recomendación de la junta.`,
	},
	'review.decided': {
		title: 'Decisión registrada',
		body: (p) =>
			`${p.title ?? 'La solicitud'}: ${p.decision ?? 'decisión registrada'}.`,
	},
	'review.session_invited': {
		title: 'Convocatoria a junta de revisión',
		body: (p) =>
			`${p.title ?? 'Junta de revisión'} · ${p.when ?? 'fecha programada'}${p.location ? ` · ${p.location}` : ''}. Confirma tu participación en GestionChurch.`,
	},
	'review.session_updated': {
		title: 'Junta de revisión actualizada',
		body: (p) =>
			`${p.title ?? 'La junta de revisión'} fue actualizada. ${p.when ?? ''}`.trim(),
	},
	'review.session_cancelled': {
		title: 'Junta de revisión cancelada',
		body: (p) => `${p.title ?? 'La junta de revisión'} fue cancelada.`,
	},
	'review.session_response': {
		title: 'Respuesta a convocatoria',
		body: (p) =>
			`${p.participant ?? 'Un participante'} respondió ${p.response === 'CONFIRMED' ? 'que asistirá' : 'que no podrá asistir'} a ${p.title ?? 'la junta'}.`,
	},
	'review.session_reminder_24_hours': {
		title: 'Junta de revisión mañana',
		body: (p) =>
			`${p.title ?? 'Tu junta de revisión'} será en 24 horas${p.location ? ` · ${p.location}` : ''}.`,
	},
	'review.session_reminder_2_hours': {
		title: 'Junta de revisión en 2 horas',
		body: (p) =>
			`${p.title ?? 'Tu junta de revisión'} comenzará en 2 horas${p.location ? ` · ${p.location}` : ''}.`,
	},
	'review.session_reminder_1_hour': {
		title: 'Junta de revisión en 1 hora',
		body: (p) =>
			`${p.title ?? 'Tu junta de revisión'} comenzará en una hora${p.location ? ` · ${p.location}` : ''}.`,
	},
	'review.session_reminder_30_minutes': {
		title: 'Junta de revisión en 30 minutos',
		body: (p) =>
			`${p.title ?? 'Tu junta de revisión'} comenzará en 30 minutos${p.location ? ` · ${p.location}` : ''}.`,
	},
	'review.session_reminder_15_minutes': {
		title: 'Junta de revisión en 15 minutos',
		body: (p) =>
			`${p.title ?? 'Tu junta de revisión'} comenzará en 15 minutos${p.location ? ` · ${p.location}` : ''}.`,
	},
	'activity.alternative_available': {
		title: 'Existe una alternativa',
		body: (p) =>
			`${p.title ?? 'La actividad'} tiene otra fecha disponible para confirmar.`,
	},
	'activity.reminder_7_days': {
		title: 'Actividad en 7 días',
		body: (p) => `${p.title ?? 'Tu actividad'} se realizará en una semana.`,
	},
	'activity.reminder_24_hours': {
		title: 'Actividad mañana',
		body: (p) =>
			`${p.title ?? 'Tu actividad'} se realizará en las próximas 24 horas.`,
	},
	'delivery.dead_letter': {
		title: 'Entrega pendiente de atención',
		body: () =>
			'Una alerta agotó sus reintentos y requiere revisión administrativa.',
	},
	'department_operations.initiative': {
		title: 'Nueva iniciativa departamental',
		body: (p) =>
			String(
				p.body ??
					'Se te ha asignado una iniciativa en tu espacio departamental.',
			),
	},
	'department_operations.assignment': {
		title: 'Responsabilidad departamental asignada',
		body: (p) =>
			String(p.body ?? 'Tienes una nueva responsabilidad departamental.'),
	},
	'department_operations.task': {
		title: 'Nueva tarea departamental',
		body: (p) => String(p.body ?? 'Tienes una nueva tarea departamental.'),
	},
	'department_operations.meeting': {
		title: 'Reunión departamental programada',
		body: (p) => String(p.body ?? 'Tienes una nueva reunión departamental.'),
	},
	'department_operations.mention': {
		title: 'Mención en un espacio departamental',
		body: (p) =>
			String(p.body ?? 'Un integrante te mencionó en un comentario.'),
	},
	'auth.password_reset_requested': {
		title: 'Restablecer contraseña',
		body: (p) =>
			`Recibimos una solicitud para restablecer tu contraseña. El enlace vence en 30 minutos.${typeof p.resetUrl === 'string' ? ` ${p.resetUrl}` : ''}`,
	},
};

export function renderNotification(
	eventType: string,
	payload: Record<string, unknown>,
  locale: NotificationLocale = 'es',
  timezone = 'America/La_Paz',
): { title: string; body: string } {
	payload = notificationPayload(payload, locale, timezone);
  if (locale !== 'es') return localizedNotification(eventType, payload, locale);
	const template = templates[eventType] ?? {
		title: 'Actualización de GestionChurch',
		body: () => 'Hay una actualización en el calendario.',
	};
	return { title: template.title, body: template.body(payload) };
}

export function escapeNotificationHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

export function validProviderSignature(
	rawBody: Buffer | undefined,
	signature: string | undefined,
	secret: string | undefined,
): boolean {
	if (!secret || !rawBody || !signature?.startsWith('sha256=')) return false;
	const expected = Buffer.from(
		createHmac('sha256', secret).update(rawBody).digest('hex'),
		'utf8',
	);
	const actual = Buffer.from(signature.slice(7), 'utf8');
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type ProviderStatus = {
	providerMessageId: string;
	status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
	error?: string;
};

export function extractMetaStatuses(
	body: Record<string, unknown>,
): ProviderStatus[] {
	const mapped: ProviderStatus[] = [];
	const entries = Array.isArray(body.entry) ? body.entry : [];
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') continue;
		const changes = Array.isArray((entry as Record<string, unknown>).changes)
			? ((entry as Record<string, unknown>).changes as unknown[])
			: [];
		for (const change of changes) {
			if (!change || typeof change !== 'object') continue;
			const value = (change as Record<string, unknown>).value;
			if (!value || typeof value !== 'object') continue;
			const statuses = Array.isArray(
				(value as Record<string, unknown>).statuses,
			)
				? ((value as Record<string, unknown>).statuses as unknown[])
				: [];
			for (const candidate of statuses) {
				if (!candidate || typeof candidate !== 'object') continue;
				const status = candidate as Record<string, unknown>;
				if (typeof status.id !== 'string' || typeof status.status !== 'string')
					continue;
				const state = (
					{
						sent: 'SENT',
						delivered: 'DELIVERED',
						read: 'READ',
						failed: 'FAILED',
					} as const
				)[status.status as 'sent' | 'delivered' | 'read' | 'failed'];
				if (!state) continue;
				const errors = Array.isArray(status.errors) ? status.errors : [];
				const firstError =
					errors[0] && typeof errors[0] === 'object'
						? (errors[0] as Record<string, unknown>)
						: undefined;
				mapped.push({
					providerMessageId: status.id,
					status: state,
					...(firstError
						? {
								error: String(
									firstError.title ??
										firstError.message ??
										'Meta informó un fallo.',
								),
							}
						: {}),
				});
			}
		}
	}
	return mapped;
}
