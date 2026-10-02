export type WriteIntent = {
	body: string | null;
	key: string | null;
	running: boolean;
};
export const newWriteIntent = (): WriteIntent => ({
	body: null,
	key: null,
	running: false,
});

export function definitiveWriteRejection(reason: unknown) {
	return Boolean(
		reason &&
			typeof reason === 'object' &&
			'status' in reason &&
			[400, 401, 403, 404, 422].includes(Number(reason.status)),
	);
}

/** Keep the same key/body after uncertainty. An acknowledged write ends this intent. */
export async function resumableWrite<T>(
	intent: WriteIntent,
	body: string,
	createKey: () => string,
	write: (body: string, key: string) => Promise<T>,
) {
	if (intent.running) return null;
	if (intent.body !== null && intent.body !== body)
		throw new Error(
			'Hay una solicitud sin confirmar. Reintenta con los mismos datos antes de iniciar otra.',
		);
	intent.body ??= body;
	intent.key ??= createKey();
	intent.running = true;
	try {
		const result = await write(intent.body, intent.key);
		intent.body = null;
		intent.key = null;
		return { result };
	} catch (reason) {
		if (definitiveWriteRejection(reason)) {
			intent.body = null;
			intent.key = null;
		}
		throw reason;
	} finally {
		intent.running = false;
	}
}

export type LinkedActivityProgress = {
	calendarBody: string | null;
	moduleBody: string | null;
	calendarKey: string | null;
	moduleKey: string | null;
	calendarId: string | null;
	submitted: boolean;
	running: boolean;
};
export const newLinkedActivityProgress = (): LinkedActivityProgress => ({
	calendarBody: null,
	moduleBody: null,
	calendarKey: null,
	moduleKey: null,
	calendarId: null,
	submitted: false,
	running: false,
});

export async function resumeLinkedActivity<T>(
	progress: LinkedActivityProgress,
	calendarBody: string,
	moduleBody: string,
	operations: {
		createKey: () => string;
		create: (body: string, key: string) => Promise<{ id: string }>;
		read: (id: string) => Promise<{ status: string }>;
		submit: (id: string) => Promise<{ status: string }>;
		link: (body: string, key: string) => Promise<T>;
	},
) {
	if (progress.running) return null;
	progress.running = true;
	try {
		progress.calendarBody ??= calendarBody;
		progress.moduleBody ??= moduleBody;
		progress.calendarKey ??= operations.createKey();
		progress.moduleKey ??= operations.createKey();
		const resuming = Boolean(progress.calendarId);
		if (!progress.calendarId)
			progress.calendarId = (
				await operations.create(progress.calendarBody, progress.calendarKey)
			).id;
		if (!progress.submitted) {
			const state = resuming
				? await operations.read(progress.calendarId)
				: { status: 'DRAFT' };
			const next = ['DRAFT', 'CHANGES_REQUESTED'].includes(state.status)
				? await operations.submit(progress.calendarId)
				: state;
			if (!['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(next.status))
				throw new Error(
					'La actividad del calendario necesita coordinación antes de enlazarse al ministerio. Abre su detalle para continuar.',
				);
			progress.submitted = true;
		}
		const payload = JSON.stringify({
			...JSON.parse(progress.moduleBody),
			calendarActivityId: progress.calendarId,
		});
		return await operations.link(payload, progress.moduleKey);
	} finally {
		progress.running = false;
	}
}
