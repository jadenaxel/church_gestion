'use client';

import { Modal } from '@/components/modal';

import {
	ArrowRight,
	BadgeDollarSign,
	CakeSlice,
	CalendarDays,
	Check,
	ChevronRight,
	CircleAlert,
	ClipboardList,
	HeartHandshake,
	Hotel,
	PiggyBank,
	Plus,
	Search,
	Sparkles,
	TrendingUp,
	UserPlus,
	UsersRound,
	WalletCards,
	X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from '@/components/shell';
import { SectionTabs } from '@/components/section-tabs';
import { Empty, Notice, Spinner } from '@/components/ui';
import { API_URL, api, dateTimeLocal, formatDate } from '@/lib/api';
import {
	definitiveWriteRejection,
	newLinkedActivityProgress,
	newWriteIntent,
	resumableWrite,
	resumeLinkedActivity,
} from '@/components/resumable-write';
import { useExperience } from '@/components/experience-provider';
import { currentLocale, localeTag } from '@/lib/i18n';
import { groupedBudgetText, type CurrencyBudget } from '@/components/currency-evidence';

type Woman = {
	id: string;
	userId: string | null;
	churchMemberId: string | null;
	name: string;
	email: string;
	phone: string;
	dateOfBirth: string | null;
	membershipStatus: string;
	preferredContact: string;
	interests: string[];
	inclusionNotes: string;
	active: boolean;
	age: number | null;
	ageBand: string;
	attendedCount: number;
	noShowCount: number;
	lastAttended: string | null;
	engagementStatus: 'ENGAGED' | 'FOLLOW_UP' | 'NEEDS_CONNECTION';
};
type TeamMember = { id: string; name: string; email: string; role: string };
type Participant = {
	womanId: string;
	name: string;
	status: string;
	notes: string;
};
type BudgetEntry = {
	id: string;
	entryType: string;
	category: string;
	description: string;
	amount: number;
	occurredOn: string;
	receiptReference: string;
};
type Activity = {
	id: string;
	calendarActivityId: string;
	title: string;
	activityType: string;
	objective: string;
	startsAt: string;
	endsAt: string;
	venue: string;
	responsibleId: string | null;
	responsibleName: string | null;
	targetAgeBands: string[];
	plannedBudget: number;
	spentBudget: number;
	income: number;
	currency: string;
	status: string;
	outcome: string;
	participants: Participant[];
	participantCount: number;
	attendedCount: number;
	budgetEntries: BudgetEntry[];
};
type Registration = {
	id: string;
	womanId: string;
	name: string;
	attendanceStatus: string;
	amountDue: number;
	amountPaid: number;
	paymentStatus: string;
	roomAssignment: string;
	transportRequired: boolean;
	dietaryNotes: string;
	notes: string;
};
type Retreat = {
	id: string;
	title: string;
	year: number;
	resort: string;
	startsOn: string;
	endsOn: string;
	capacity: number;
	costPerPerson: number;
	totalBudget: number;
	depositDeadline: string | null;
	currency: string;
	status: string;
	notes: string;
	registrations: Registration[];
	registered: number;
	confirmed: number;
	collected: number;
	expected: number;
};
type FollowUp = {
	id: string;
	womanId: string;
	womanName: string;
	activityId: string | null;
	activityTitle: string | null;
	reason: string;
	dueOn: string;
	assignedTo: string | null;
	assignedName: string | null;
	status: string;
	notes: string;
};
type Birthday = {
	id: string;
	name: string;
	email: string;
	phone: string;
	dateOfBirth: string;
	preferredContact: string;
	nextBirthday: string;
	daysUntil: number;
	turningAge: number;
	isToday: boolean;
};
type Context = {
	access: {
		canRead: boolean;
		canManage: boolean;
		canFinance: boolean;
		departmentRole: string | null;
	};
	department: { id: string; name: string; color: string } | null;
	team: TeamMember[];
	availableUsers: Array<{
		id: string;
		name: string;
		email: string;
		phone: string;
	}>;
	women: Woman[];
	birthdays: Birthday[];
	activities: Activity[];
	retreats: Retreat[];
	followUps: FollowUp[];
	metrics: {
		roster: number;
		needsConnection: number;
		upcomingActivities: number;
		completedActivities: number;
		openFollowUps: number;
		plannedBudget: number;
		spentBudget: number;
		birthdaysNext30: number;
		budgetsByCurrency?: Array<CurrencyBudget & {income:number}>;
		budgetAggregationComparable?: boolean;
		birthdaysThisWeek: number;
		ageBands: Record<string, number>;
	};
};
type Tab = 'control' | 'activities' | 'roster' | 'retreat' | 'followup';
type ModalKind =
	| ''
	| 'woman'
	| 'activity'
	| 'budget'
	| 'participation'
	| 'retreat'
	| 'registration'
	| 'payment'
	| 'followup';

const ageLabels: Record<string, string> = {
	UNDER_18: 'Menores de 18',
	'18_25': '18–25 años',
	'26_39': '26–39 años',
	'40_59': '40–59 años',
	'60_PLUS': '60 años o más',
	UNSPECIFIED: 'Edad por completar',
};
const statusLabels: Record<string, string> = {
	DRAFT: 'Borrador',
	PLANNED: 'Planificada',
	IN_PROGRESS: 'En ejecución',
	COMPLETED: 'Completada',
	CANCELLED: 'Cancelada',
	INTERESTED: 'Interesada',
	CONFIRMED: 'Confirmada',
	DECLINED: 'No participará',
	WAITLIST: 'Lista de espera',
	ATTENDED: 'Asistió',
	NO_SHOW: 'No asistió',
	INVITED: 'Invitada',
	OPEN: 'Pendiente',
	PARTIAL: 'Pago parcial',
	PAID: 'Pagado',
	UNPAID: 'Pendiente de pago',
};
const money = (value: number, currency = 'DOP') =>
	new Intl.NumberFormat(localeTag(currentLocale()), {
		style: 'currency',
		currency,
		maximumFractionDigits: 0,
	}).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);
function initialActivity() {
	const start = new Date();
	start.setDate(start.getDate() + 14);
	start.setHours(18, 0, 0, 0);
	const end = new Date(start.getTime() + 2 * 60 * 60_000);
	return {
		title: '',
		activityType: 'SPIRITUAL',
		objective: '',
		startsAt: dateTimeLocal(start),
		endsAt: dateTimeLocal(end),
		venue: '',
		responsibleId: '',
		plannedBudget: 0,
		targetAgeBands: [] as string[],
	};
}

export default function WomensMinistryPage() {
	const { tr, tenantTimezone } = useExperience();

	const [data, setData] = useState<Context | null>(null);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [tab, setTab] = useState<Tab>('control');
	const [modal, setModal] = useState<ModalKind>('');
	const [busy, setBusy] = useState(false);
	const [search, setSearch] = useState('');
	const [ageFilter, setAgeFilter] = useState('ALL');
	const [selectedActivityId, setSelectedActivityId] = useState('');
	const [selectedRetreatId, setSelectedRetreatId] = useState('');
	const [womanForm, setWomanForm] = useState({
		userId: '',
		name: '',
		email: '',
		phone: '',
		dateOfBirth: '',
		membershipStatus: 'MEMBER',
		preferredContact: 'WHATSAPP',
		interests: '',
		inclusionNotes: '',
	});
	const [activityForm, setActivityForm] = useState(initialActivity());
	const [budgetForm, setBudgetForm] = useState({
		entryType: 'EXPENSE',
		category: '',
		description: '',
		amount: 0,
		occurredOn: today(),
		receiptReference: '',
	});
	const [participationForm, setParticipationForm] = useState({
		womanId: '',
		status: 'INVITED',
		notes: '',
	});
	const [retreatForm, setRetreatForm] = useState({
		title: 'Retiro espiritual anual',
		year: new Date().getFullYear() + 1,
		resort: '',
		startsOn: '',
		endsOn: '',
		capacity: 50,
		costPerPerson: 0,
		totalBudget: 0,
		depositDeadline: '',
		status: 'REGISTRATION_OPEN',
		notes: '',
	});
	const [registrationForm, setRegistrationForm] = useState({
		womanId: '',
		attendanceStatus: 'INTERESTED',
		amountDue: 0,
		roomAssignment: '',
		transportRequired: false,
		dietaryNotes: '',
		notes: '',
	});
	const [paymentForm, setPaymentForm] = useState({
		registrationId: '',
		name: '',
		amount: 0,
		paidOn: today(),
		method: 'TRANSFER',
		reference: '',
	});
	const [followForm, setFollowForm] = useState({
		womanId: '',
		activityId: '',
		reason: '',
		dueOn: today(),
		assignedTo: '',
		notes: '',
	});
	const activityProgress = useRef(newLinkedActivityProgress());
	const paymentIntent = useRef(newWriteIntent());
	const [activityPending, setActivityPending] = useState(false);
	const [paymentPending, setPaymentPending] = useState(false);
	const load = useCallback(async () => {
		try {
			const result = await api<Context>('/womens-ministry/context');
			setData(result);
			setSelectedActivityId(
				(current) => current || result.activities[0]?.id || '',
			);
			setSelectedRetreatId(
				(current) => current || result.retreats[0]?.id || '',
			);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: 'No fue posible abrir el Ministerio de la Mujer.',
			);
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	const selectedActivity =
		data?.activities.find((item) => item.id === selectedActivityId) ?? null;
	const selectedRetreat =
		data?.retreats.find((item) => item.id === selectedRetreatId) ?? null;
	const visibleWomen = useMemo(
		() =>
			data?.women.filter(
				(woman) =>
					(ageFilter === 'ALL' || woman.ageBand === ageFilter) &&
					`${woman.name} ${woman.email} ${woman.phone}`
						.toLocaleLowerCase('es')
						.includes(search.toLocaleLowerCase('es')),
			) ?? [],
		[ageFilter, data, search],
	);
	const unengaged = useMemo(
		() =>
			data?.women.filter(
				(woman) => woman.active && woman.engagementStatus !== 'ENGAGED',
			) ?? [],
		[data],
	);
	function openModal(next: ModalKind) {
		if (next === 'payment' && paymentPending && paymentIntent.current.body) {
			const saved = JSON.parse(paymentIntent.current.body);
			setPaymentForm({ ...saved, name: data?.retreats.flatMap((item) => item.registrations).find((item) => item.id === saved.registrationId)?.name ?? paymentForm.name });
		}
		setError('');
		setSuccess('');
		setModal(next);
	}
	async function act(work: () => Promise<void>, message: string) {
		setBusy(true);
		setError('');
		try {
			await work();
			setModal('');
			setSuccess(message);
			await load();
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: 'No fue posible completar la acción.',
			);
		} finally {
			setBusy(false);
		}
	}
	async function saveWoman(event: React.FormEvent) {
		event.preventDefault();
		await act(async () => {
			await api('/womens-ministry/women', {
				method: 'POST',
				body: JSON.stringify({
					...womanForm,
					userId: womanForm.userId || null,
					dateOfBirth: womanForm.dateOfBirth || null,
					interests: womanForm.interests
						.split(',')
						.map((item) => item.trim())
						.filter(Boolean),
				}),
			});
		}, 'Perfil agregado al roster ministerial.');
	}
	async function saveActivity(event: React.FormEvent) {
		event.preventDefault();
		if (!data?.department || busy) return;
		setActivityPending(true);
		await act(async () => {
			const responsible = data.team.find(
				(member) => member.id === activityForm.responsibleId,
			);
			const calendarBody = JSON.stringify({
				title: activityForm.title,
				description: activityForm.objective,
				objective: activityForm.objective,
				departmentId: data.department!.id,
				venueId: null,
				responsibleName: responsible?.name || 'Ministerio de la Mujer',
				audience: 'Mujeres de la iglesia y comunidad',
				estimatedAttendance: 0,
				category: 'Ministerio de la Mujer',
				tags: ['mujeres', activityForm.activityType.toLocaleLowerCase()],
				contactInfo: responsible?.email || '',
				modality: 'PRESENTIAL',
				visibility: 'INTERNAL',
				priority: 3,
				internalNotes: `Presupuesto planificado: ${activityForm.plannedBudget} DOP`,
				customData: {
					women_ministry: true,
					planned_budget: activityForm.plannedBudget,
				},
				timezone:
					tenantTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
				options: [
					{
						label: 'Fecha principal',
						preference: 1,
						sessions: [
							{
								startsAt: new Date(activityForm.startsAt).toISOString(),
								endsAt: new Date(activityForm.endsAt).toISOString(),
								setupMinutes: 0,
								teardownMinutes: 0,
							},
						],
					},
				],
			});
			const moduleBody = JSON.stringify({
				title: activityForm.title,
				activityType: activityForm.activityType,
				objective: activityForm.objective,
				startsAt: new Date(activityForm.startsAt).toISOString(),
				endsAt: new Date(activityForm.endsAt).toISOString(),
				venue: activityForm.venue,
				responsibleId: activityForm.responsibleId || null,
				targetAgeBands: activityForm.targetAgeBands,
				plannedBudget: Number(activityForm.plannedBudget),
				currency: 'DOP',
				status: 'PLANNED',
			});
			try {
				await resumeLinkedActivity(
					activityProgress.current,
					calendarBody,
					moduleBody,
					{
						createKey: () => `women-${crypto.randomUUID()}`,
						create: (body, key) =>
							api<{ id: string }>('/activities', {
								method: 'POST',
								headers: { 'idempotency-key': key },
								body,
							}),
						read: (id) => api<{ status: string }>(`/activities/${id}`),
						submit: (id) =>
							api<{ status: string }>(`/activities/${id}/submit`, {
								method: 'POST',
							}),
						link: (body) =>
							api('/womens-ministry/activities', { method: 'POST', body }),
					},
				);
				activityProgress.current = newLinkedActivityProgress();
				setActivityPending(false);
			} catch (reason) {
				if (
					!activityProgress.current.calendarId &&
					definitiveWriteRejection(reason)
				) {
					activityProgress.current = newLinkedActivityProgress();
					setActivityPending(false);
				}
				throw reason;
			}
		}, 'Actividad planificada, presupuestada y enlazada al calendario central.');
	}
	async function saveBudget(event: React.FormEvent) {
		event.preventDefault();
		if (!selectedActivity) return;
		await act(async () => {
			await api(`/womens-ministry/activities/${selectedActivity.id}/budget`, {
				method: 'POST',
				body: JSON.stringify({
					...budgetForm,
					amount: Number(budgetForm.amount),
				}),
			});
		}, 'Movimiento presupuestario registrado con trazabilidad.');
	}
	async function saveParticipation(event: React.FormEvent) {
		event.preventDefault();
		if (!selectedActivity) return;
		await act(async () => {
			await api(
				`/womens-ministry/activities/${selectedActivity.id}/participation`,
				{ method: 'POST', body: JSON.stringify(participationForm) },
			);
		}, 'Participación actualizada.');
	}
	async function completeActivity() {
		if (!selectedActivity) return;
		await act(async () => {
			await api(`/womens-ministry/activities/${selectedActivity.id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					status: 'COMPLETED',
					outcome:
						selectedActivity.outcome ||
						'Actividad completada y lista para evaluación de participación.',
				}),
			});
		}, 'Actividad marcada como completada.');
	}
	async function saveRetreat(event: React.FormEvent) {
		event.preventDefault();
		await act(async () => {
			await api('/womens-ministry/retreats', {
				method: 'POST',
				body: JSON.stringify({
					...retreatForm,
					costPerPerson: Number(retreatForm.costPerPerson),
					totalBudget: Number(retreatForm.totalBudget),
					depositDeadline: retreatForm.depositDeadline || null,
				}),
			});
		}, 'Retiro anual creado y listo para gestionar inscripciones.');
	}
	async function saveRegistration(event: React.FormEvent) {
		event.preventDefault();
		if (!selectedRetreat) return;
		await act(async () => {
			await api(
				`/womens-ministry/retreats/${selectedRetreat.id}/registrations`,
				{
					method: 'POST',
					body: JSON.stringify({
						...registrationForm,
						amountDue: Number(registrationForm.amountDue),
					}),
				},
			);
		}, 'Participante agregada al retiro.');
	}
	async function savePayment(event: React.FormEvent) {
		event.preventDefault();
		if (busy) return;
		setPaymentPending(true);
		await act(async () => {
			const body = JSON.stringify({
				registrationId: paymentForm.registrationId,
				amount: Number(paymentForm.amount),
				paidOn: paymentForm.paidOn,
				method: paymentForm.method,
				reference: paymentForm.reference,
			});
			try {
				await resumableWrite(
					paymentIntent.current,
					body,
					() => `payment-${crypto.randomUUID()}`,
					(saved, key) => {
						const { registrationId, ...payload } = JSON.parse(saved);
						return api(
							`/womens-ministry/retreat-registrations/${registrationId}/payments`,
							{
								method: 'POST',
								headers: { 'idempotency-key': key },
								body: JSON.stringify(payload),
							},
						);
					},
				);
				setPaymentPending(false);
			} catch (reason) {
				if (definitiveWriteRejection(reason)) setPaymentPending(false);
				throw reason;
			}
		}, 'Pago registrado correctamente.');
	}
	async function saveFollow(event: React.FormEvent) {
		event.preventDefault();
		await act(async () => {
			await api('/womens-ministry/follow-ups', {
				method: 'POST',
				body: JSON.stringify({
					...followForm,
					activityId: followForm.activityId || null,
					assignedTo: followForm.assignedTo || null,
				}),
			});
		}, 'Seguimiento creado y asignado.');
	}
	async function closeFollow(id: string) {
		await act(async () => {
			await api(`/womens-ministry/follow-ups/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: 'COMPLETED' }),
			});
		}, 'Seguimiento completado.');
	}
	if (!data && !error)
		return (
			<Shell
				title={tr('Ministerio de la Mujer')}
				eyebrow={tr('Cuidado, crecimiento y misión')}
			>
				<Spinner />
			</Shell>
		);
	if (!data)
		return (
			<Shell
				title={tr('Ministerio de la Mujer')}
				eyebrow={tr('Cuidado, crecimiento y misión')}
			>
				<Notice tone="danger" title={tr('Acceso no disponible')}>
					{error}
				</Notice>
			</Shell>
		);
	const maxAge = Math.max(1, ...Object.values(data.metrics.ageBands));
	return (
		<Shell
			title={tr('Ministerio de la Mujer')}
			eyebrow={tr('Cuidado, crecimiento y misión')}
			actions={
				<Link href="/calendar" className="button button-ghost desktop-action">
					<CalendarDays />
					{tr(' Ver calendario')}
				</Link>
			}
		>
			{error && (
				<Notice tone="danger" title={tr('No fue posible completar la acción')}>
					{error}
				</Notice>
			)}
			{success && (
				<Notice tone="success" title={tr('Actualización completada')}>
					{success}
				</Notice>
			)}
			{!data.department && (
				<Notice tone="warning" title={tr('Departamento pendiente')}>
					{tr(
						'Crea o activa “Ministerio de la Mujer” en Departamentos para enlazar actividades y roles.',
					)}
				</Notice>
			)}
			<section className="wm-hero">
				<div>
					<span>
						<Sparkles />
						{tr(' Coordinación con propósito')}
					</span>
					<h2>{tr('Cada mujer vista, incluida y acompañada.')}</h2>
					<p>
						{tr(
							'Planificación, presupuesto, participación, retiro espiritual y seguimiento en un solo centro de misión.',
						)}
					</p>
					<div>
						<b>
							{data.team.find((member) => member.role === 'DIRECTOR')?.name ||
								tr('Dirección por asignar')}
						</b>
						<small>
							{data.department?.name || tr('Ministerio de la Mujer')}
						</small>
					</div>
				</div>
				<aside>
					<HeartHandshake />
					<small>{tr('Salud ministerial')}</small>
					<strong>
						{Math.max(0, data.metrics.roster - data.metrics.needsConnection)}/
						{data.metrics.roster}
					</strong>
					<span>{tr('mujeres conectadas')}</span>
				</aside>
			</section>
			<SectionTabs
				tabs={(
					[
						['control', 'Centro de control', TrendingUp],
						['activities', 'Actividades y presupuesto', WalletCards],
						['roster', 'Roster de mujeres', UsersRound],
						['retreat', 'Retiro espiritual', Hotel],
						['followup', 'Inclusión y seguimiento', HeartHandshake],
					] as const
				).map(([value, label, Icon]) =>
					value === 'followup'
						? ([value, tr(label), Icon, data.metrics.openFollowUps] as const)
						: ([value, tr(label), Icon] as const),
				)}
				value={tab}
				onChange={setTab}
				label={tr('Secciones del Ministerio de la Mujer')}
				className="wm-tabs"
				prefix="wm"
			/>
			<div
				role="tabpanel"
				id="wm-panel"
				aria-labelledby={`wm-tab-${tab}`}
				tabIndex={-1}
			>
				{tab === 'control' && (
					<>
						<section className="wm-kpis">
							<button type="button" onClick={() => setTab('roster')}>
								<UsersRound />
								<span>
									<b>{data.metrics.roster}</b>
									<small>{tr('Roster activo')}</small>
								</span>
								<ArrowRight />
							</button>
							<button type="button" onClick={() => setTab('activities')}>
								<CalendarDays />
								<span>
									<b>{data.metrics.upcomingActivities}</b>
									<small>{tr('Próximas actividades')}</small>
								</span>
								<ArrowRight />
							</button>
							<button type="button" onClick={() => setTab('followup')}>
								<HeartHandshake />
								<span>
									<b>{data.metrics.needsConnection}</b>
									<small>{tr('Necesitan conexión')}</small>
								</span>
								<ArrowRight />
							</button>
							<button type="button" onClick={() => setTab('roster')}>
								<CakeSlice />
								<span>
									<b>{data.metrics.birthdaysNext30}</b>
									<small>{tr('Cumpleaños próximos')}</small>
								</span>
								<ArrowRight />
							</button>
							<button type="button" onClick={() => setTab('activities')}>
								<PiggyBank />
								<span>
									<b>{groupedBudgetText(data.metrics.budgetsByCurrency,'spentBudget',money)}</b>
									<small>{tr('Ejecutado')}</small>
								</span>
								<ArrowRight />
							</button>
						</section>
						<section
							className={`panel wm-birthday-center ${data.metrics.birthdaysThisWeek ? 'attention' : ''}`}
						>
							<div className="panel-heading">
								<div>
									<span className="eyebrow">{tr('Celebrar y acompañar')}</span>
									<h2>{tr('Cumpleaños de los próximos 30 días')}</h2>
									<p>
										{tr(
											'La directora y su directiva reciben avisos sin duplicados: uno durante la semana previa y otro el día del cumpleaños.',
										)}
									</p>
								</div>
								<span className="wm-birthday-count">
									<CakeSlice />
									<b>{data.metrics.birthdaysThisWeek}</b>
									<small>{tr('esta semana')}</small>
								</span>
							</div>
							{data.birthdays.length ? (
								<div className="wm-birthday-list premium-scroll-list">
									{data.birthdays.map((birthday) => (
										<button
											type="button"
											key={birthday.id}
											className={birthday.isToday ? 'today' : ''}
											onClick={() => {
												setFollowForm({
													...followForm,
													womanId: birthday.id,
													reason: birthday.isToday
														? 'Saludo y acompañamiento de cumpleaños'
														: `Preparar saludo de cumpleaños para ${birthday.nextBirthday}`,
												});
												openModal('followup');
											}}
										>
											<time dateTime={birthday.nextBirthday}>
												<b>
													{birthday.isToday ? tr('HOY') : birthday.daysUntil}
												</b>
												{!birthday.isToday && <small>{tr('DÍAS')}</small>}
											</time>
											<span>
												<em>
													{birthday.isToday
														? tr('Cumpleaños de hoy')
														: formatDate(birthday.nextBirthday)}
												</em>
												<strong title={birthday.name}>{birthday.name}</strong>
												<small>
													{tr('Cumple ')}
													{birthday.turningAge}
													{tr(' años · ')}
													{birthday.preferredContact}
												</small>
											</span>
											<HeartHandshake aria-hidden="true" />
										</button>
									))}
								</div>
							) : (
								<Empty
									icon={<CakeSlice />}
									title={tr('Sin cumpleaños próximos')}
									text={tr(
										'No hay cumpleaños registrados para los próximos 30 días.',
									)}
								/>
							)}
						</section>
						<div className="wm-control-grid">
							<section className="panel wm-age-panel">
								<div className="panel-heading">
									<div>
										<span className="eyebrow">
											{tr('Cobertura generacional')}
										</span>
										<h2>{tr('Todas tienen un lugar')}</h2>
										<p>
											{tr(
												'Segmentación para enfocar programas sin excluir ninguna edad.',
											)}
										</p>
									</div>
								</div>
								<div className="wm-age-chart">
									{Object.entries(data.metrics.ageBands).map(
										([band, count]) => (
											<button
												type="button"
												key={band}
												onClick={() => {
													setAgeFilter(band);
													setTab('roster');
												}}
											>
												<span>
													<b>{ageLabels[band]}</b>
													<small>
														{count}
														{tr(' mujeres')}
													</small>
												</span>
												<i>
													<em
														style={{
															width: `${Math.max(4, (count / maxAge) * 100)}%`,
														}}
													/>
												</i>
											</button>
										),
									)}
								</div>
							</section>
							<section className="panel wm-attention">
								<div className="panel-heading">
									<div>
										<span className="eyebrow">{tr('Cuidado proactivo')}</span>
										<h2>{tr('Oportunidades de inclusión')}</h2>
									</div>
									<button type="button" onClick={() => setTab('followup')}>
										{tr('Ver seguimiento ')}
										<ArrowRight />
									</button>
								</div>
								<div className="premium-scroll-list">
									{unengaged.slice(0, 8).map((woman) => (
										<button
											type="button"
											key={woman.id}
											onClick={() => {
												setFollowForm({
													...followForm,
													womanId: woman.id,
													reason: 'Contacto de inclusión y acompañamiento',
												});
												openModal('followup');
											}}
										>
											<span>
												{woman.name
													.split(' ')
													.map((part) => part[0])
													.slice(0, 2)
													.join('')}
											</span>
											<div>
												<strong>{woman.name}</strong>
												<small>
													{woman.lastAttended
														? [
																tr('Última participación: '),
																formatDate(woman.lastAttended),
															].join('')
														: tr('Sin participación registrada')}
												</small>
											</div>
											<CircleAlert />
										</button>
									))}
								</div>
								{!unengaged.length && (
									<Empty
										icon={<Check />}
										title={tr('Todas están conectadas')}
										text={tr(
											'No hay señales de participación pendientes de seguimiento.',
										)}
									/>
								)}
							</section>
						</div>
					</>
				)}

				{tab === 'activities' && (
					<div className="wm-workspace">
						<section className="panel wm-list-panel">
							<div className="panel-heading">
								<div>
									<span className="eyebrow">{tr('Plan anual')}</span>
									<h2>{tr('Actividades')}</h2>
								</div>
								{data.access.canManage && (
									<button
										type="button"
										className="button button-primary"
										onClick={() => {
											if (!activityPending) setActivityForm(initialActivity());
											openModal('activity');
										}}
									>
										<Plus />
										{tr(' Planificar')}
									</button>
								)}
							</div>
							<div className="premium-scroll-list">
								{data.activities.map((item) => (
									<button
										type="button"
										key={item.id}
										className={selectedActivityId === item.id ? 'active' : ''}
										onClick={() => setSelectedActivityId(item.id)}
									>
										<span>
											<b>{new Date(item.startsAt).getDate()}</b>
											<small>
												{new Intl.DateTimeFormat(localeTag(currentLocale()), {
													month: 'short',
												}).format(new Date(item.startsAt))}
											</small>
										</span>
										<div>
											<em>{statusLabels[item.status] || item.status}</em>
											<strong>{item.title}</strong>
											<small>
												{item.responsibleName || tr('Responsable por asignar')}{' '}
												· {money(item.plannedBudget, item.currency)}
											</small>
										</div>
										<ChevronRight />
									</button>
								))}
							</div>
							{!data.activities.length && (
								<Empty
									icon={<CalendarDays />}
									title={tr('Planificación lista')}
									text={tr(
										'Crea la primera actividad del Ministerio de la Mujer.',
									)}
								/>
							)}
						</section>
						<section className="panel wm-detail">
							{selectedActivity ? (
								<>
									<header>
										<div>
											<span className="eyebrow">
												{statusLabels[selectedActivity.status] ||
													selectedActivity.status}
											</span>
											<h2>{selectedActivity.title}</h2>
											<p>
												{formatDate(selectedActivity.startsAt)} ·{' '}
												{selectedActivity.venue || tr('Lugar por definir')}
											</p>
										</div>
										<Link
											href={`/activities/${selectedActivity.calendarActivityId}`}
											className="button button-ghost"
										>
											{tr('Abrir calendario ')}
											<ArrowRight />
										</Link>
									</header>
									<p className="wm-objective">{selectedActivity.objective}</p>
									<div className="wm-budget">
										<span>
											<small>{tr('Presupuesto')}</small>
											<b>
												{money(
													selectedActivity.plannedBudget,
													selectedActivity.currency,
												)}
											</b>
										</span>
										<span>
											<small>{tr('Ejecutado')}</small>
											<b>
												{money(
													selectedActivity.spentBudget,
													selectedActivity.currency,
												)}
											</b>
										</span>
										<span>
											<small>{tr('Disponible')}</small>
											<b>
												{money(
													selectedActivity.plannedBudget -
														selectedActivity.spentBudget,
													selectedActivity.currency,
												)}
											</b>
										</span>
										<i>
											<em
												style={{
													width: `${Math.min(100, selectedActivity.plannedBudget ? (selectedActivity.spentBudget / selectedActivity.plannedBudget) * 100 : 0)}%`,
												}}
											/>
										</i>
									</div>
									<div className="wm-detail-actions">
										{data.access.canFinance && (
											<button type="button" onClick={() => openModal('budget')}>
												<BadgeDollarSign />
												{tr(' Registrar movimiento')}
											</button>
										)}
										{data.access.canManage && (
											<button
												type="button"
												onClick={() => openModal('participation')}
											>
												<UserPlus />
												{tr(' Registrar participación')}
											</button>
										)}
										{data.access.canManage &&
											selectedActivity.status !== 'COMPLETED' && (
												<button
													type="button"
													onClick={() => void completeActivity()}
												>
													<Check />
													{tr(' Completar actividad')}
												</button>
											)}
									</div>
									<div className="wm-participation">
										<div>
											<strong>{tr('Participación')}</strong>
											<span>
												{selectedActivity.attendedCount}
												{tr(' asistieron de ')}
												{selectedActivity.participantCount}
												{tr(' registradas')}
											</span>
										</div>
										{selectedActivity.participants.map((item) => (
											<article key={item.womanId}>
												<span>{item.name}</span>
												<b>{statusLabels[item.status] || item.status}</b>
											</article>
										))}
									</div>
								</>
							) : (
								<Empty
									icon={<ClipboardList />}
									title={tr('Selecciona una actividad')}
									text={tr('Consulta presupuesto, ejecución y participación.')}
								/>
							)}
						</section>
					</div>
				)}

				{tab === 'roster' && (
					<section className="panel wm-roster">
						<div className="panel-heading">
							<div>
								<span className="eyebrow">
									{tr('Directorio ministerial protegido')}
								</span>
								<h2>{tr('Roster de mujeres')}</h2>
								<p>
									{tr(
										'Perfiles vinculados al tenant y visibles solo para liderazgo autorizado.',
									)}
								</p>
							</div>
							{data.access.canManage && (
								<button
									type="button"
									className="button button-primary"
									onClick={() => openModal('woman')}
								>
									<UserPlus />
									{tr(' Agregar mujer')}
								</button>
							)}
						</div>
						<div className="wm-roster-tools">
							<label>
								<Search />
								<input
									aria-label={tr('Buscar en roster')}
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder={tr('Buscar nombre, correo o teléfono…')}
								/>
							</label>
							<select
								aria-label={tr('Filtrar por edad')}
								value={ageFilter}
								onChange={(event) => setAgeFilter(event.target.value)}
							>
								<option value="ALL">{tr('Todas las edades')}</option>
								{Object.entries(ageLabels).map(([value, label]) => (
									<option value={value} key={value}>
										{label}
									</option>
								))}
							</select>
						</div>
						<div className="wm-roster-grid premium-scroll-list">
							{visibleWomen.map((woman) => (
								<article key={woman.id}>
									<span className="wm-roster-avatar">
										<i>
											{woman.name
												.split(' ')
												.map((part) => part[0])
												.slice(0, 2)
												.join('')}
										</i>
										{woman.churchMemberId && (
											<img
												src={`${API_URL}/files/member-photos/${woman.churchMemberId}`}
												alt={[tr('Foto de '), woman.name].join('')}
												loading="lazy"
												onError={(event) => event.currentTarget.remove()}
											/>
										)}
									</span>
									<div>
										<em className={woman.engagementStatus.toLocaleLowerCase()}>
											{woman.engagementStatus === 'ENGAGED'
												? tr('Conectada')
												: woman.engagementStatus === 'FOLLOW_UP'
													? tr('Dar seguimiento')
													: tr('Incluir')}
										</em>
										<h3>{woman.name}</h3>
										<p>
											{ageLabels[woman.ageBand]}
											{woman.age !== null
												? [' · ', woman.age, tr(' años')].join('')
												: ''}
										</p>
										<small>
											{woman.attendedCount}
											{tr(' participación(es) · ')}
											{woman.preferredContact}
										</small>
									</div>
									<button
										type="button"
										onClick={() => {
											setFollowForm({
												...followForm,
												womanId: woman.id,
												reason: 'Contacto de inclusión y acompañamiento',
											});
											openModal('followup');
										}}
										aria-label={[tr('Dar seguimiento a '), woman.name].join('')}
									>
										<HeartHandshake />
									</button>
								</article>
							))}
						</div>
						{!visibleWomen.length && (
							<Empty
								icon={<UsersRound />}
								title={tr('No hay perfiles en este segmento')}
								text={tr(
									'Agrega mujeres al roster o selecciona otro rango de edad.',
								)}
							/>
						)}
					</section>
				)}

				{tab === 'retreat' && (
					<div className="wm-workspace">
						<section className="panel wm-list-panel">
							<div className="panel-heading">
								<div>
									<span className="eyebrow">{tr('Encuentro anual')}</span>
									<h2>{tr('Retiros espirituales')}</h2>
								</div>
								{data.access.canManage && (
									<button
										type="button"
										className="button button-primary"
										onClick={() => openModal('retreat')}
									>
										<Plus />
										{tr(' Nuevo retiro')}
									</button>
								)}
							</div>
							<div className="premium-scroll-list">
								{data.retreats.map((item) => (
									<button
										type="button"
										key={item.id}
										className={selectedRetreatId === item.id ? 'active' : ''}
										onClick={() => setSelectedRetreatId(item.id)}
									>
										<span>
											<b>{item.year}</b>
											<small>{tr('RETIRO')}</small>
										</span>
										<div>
											<em>{statusLabels[item.status] || item.status}</em>
											<strong>{item.title}</strong>
											<small>
												{item.resort} · {item.registered}/{item.capacity}
											</small>
										</div>
										<ChevronRight />
									</button>
								))}
							</div>
						</section>
						<section className="panel wm-detail">
							{selectedRetreat ? (
								<>
									<header>
										<div>
											<span className="eyebrow">
												{selectedRetreat.year} ·{' '}
												{statusLabels[selectedRetreat.status] ||
													selectedRetreat.status}
											</span>
											<h2>{selectedRetreat.title}</h2>
											<p>
												{selectedRetreat.resort} ·{' '}
												{formatDate(selectedRetreat.startsOn)}
											</p>
										</div>
										{data.access.canManage && (
											<button
												type="button"
												className="button button-primary"
												onClick={() => {
													setRegistrationForm({
														...registrationForm,
														amountDue: selectedRetreat.costPerPerson,
													});
													openModal('registration');
												}}
											>
												<UserPlus />
												{tr(' Inscribir')}
											</button>
										)}
									</header>
									<div className="wm-retreat-kpis">
										<span>
											<b>
												{selectedRetreat.registered}/{selectedRetreat.capacity}
											</b>
											<small>{tr('Inscritas')}</small>
										</span>
										<span>
											<b>{selectedRetreat.confirmed}</b>
											<small>{tr('Confirmadas')}</small>
										</span>
										<span>
											<b>
												{money(
													selectedRetreat.collected,
													selectedRetreat.currency,
												)}
											</b>
											<small>{tr('Recaudado')}</small>
										</span>
										<span>
											<b>
												{money(
													Math.max(
														0,
														selectedRetreat.expected -
															selectedRetreat.collected,
													),
													selectedRetreat.currency,
												)}
											</b>
											<small>{tr('Por cobrar')}</small>
										</span>
									</div>
									<div className="wm-registration-list premium-scroll-list">
										{selectedRetreat.registrations.map((item) => (
											<article key={item.id}>
												<div>
													<strong>{item.name}</strong>
													<small>
														{statusLabels[item.attendanceStatus] ||
															item.attendanceStatus}{' '}
														·{' '}
														{statusLabels[item.paymentStatus] ||
															item.paymentStatus}
													</small>
												</div>
												<span>
													{money(item.amountPaid, selectedRetreat.currency)} /{' '}
													{money(item.amountDue, selectedRetreat.currency)}
												</span>
												{data.access.canFinance &&
													item.paymentStatus !== 'PAID' && (
														<button
															type="button"
															onClick={() => {
																setPaymentForm({
																	...paymentForm,
																	registrationId: item.id,
																	name: item.name,
																	amount: Math.max(
																		0,
																		item.amountDue - item.amountPaid,
																	),
																});
																openModal('payment');
															}}
														>
															<BadgeDollarSign />
															{tr(' Pago')}
														</button>
													)}
											</article>
										))}
									</div>
								</>
							) : (
								<Empty
									icon={<Hotel />}
									title={tr('Crea el retiro anual')}
									text={tr(
										'Controla resort, cupos, participantes, pagos y logística.',
									)}
								/>
							)}
						</section>
					</div>
				)}

				{tab === 'followup' && (
					<section className="panel wm-follow">
						<div className="panel-heading">
							<div>
								<span className="eyebrow">
									{tr('Acompañamiento intencional')}
								</span>
								<h2>{tr('Inclusión y seguimiento')}</h2>
								<p>
									{tr(
										'Convierte las señales de baja participación en acciones concretas de cuidado.',
									)}
								</p>
							</div>
							{data.access.canManage && (
								<button
									type="button"
									className="button button-primary"
									onClick={() => openModal('followup')}
								>
									<Plus />
									{tr(' Nuevo seguimiento')}
								</button>
							)}
						</div>
						<div className="wm-follow-grid premium-scroll-list">
							{data.followUps.map((item) => (
								<article key={item.id}>
									<span className={item.status.toLocaleLowerCase()}>
										<HeartHandshake />
									</span>
									<div>
										<em>
											{statusLabels[item.status] || item.status}
											{tr(' · vence ')}
											{formatDate(item.dueOn)}
										</em>
										<h3>{item.womanName}</h3>
										<p>{item.reason}</p>
										<small>
											{item.assignedName
												? [tr('Responsable: '), item.assignedName].join('')
												: tr('Sin responsable')}
											{item.activityTitle ? ` · ${item.activityTitle}` : ''}
										</small>
									</div>
									{data.access.canManage && item.status !== 'COMPLETED' && (
										<button
											type="button"
											onClick={() => void closeFollow(item.id)}
										>
											<Check />
											{tr(' Completar')}
										</button>
									)}
								</article>
							))}
						</div>
						{!data.followUps.length && (
							<Empty
								icon={<HeartHandshake />}
								title={tr('Seguimiento al día')}
								text={tr('No hay acciones de inclusión pendientes.')}
							/>
						)}
					</section>
				)}
			</div>
			{modal === 'woman' && (
				<Modal
					busy={busy}
					label={tr('Agregar mujer')}
					onClose={() => setModal('')}
				>
					<form
						className="modal-card premium-modal wm-modal"
						onSubmit={saveWoman}
					>
						{error && (
							<Notice
								tone="danger"
								title={tr('No fue posible completar la acción')}
							>
								{error}
							</Notice>
						)}
						<button
							data-dialog-close
							type="button"
							className="modal-close"
							onClick={() => setModal('')}
							aria-label={tr('Cerrar')}
						>
							<X />
						</button>
						<span className="modal-symbol">
							<UserPlus />
						</span>
						<span className="eyebrow">{tr('Roster protegido')}</span>
						<h2>{tr('Agregar mujer')}</h2>
						<p>
							{tr(
								'Enlaza un usuario existente o registra un perfil ministerial.',
							)}
						</p>
						<label>
							{tr('Usuario existente')}
							<select
								value={womanForm.userId}
								onChange={(event) => {
									const person = data.availableUsers.find(
										(item) => item.id === event.target.value,
									);
									setWomanForm({
										...womanForm,
										userId: event.target.value,
										name: person?.name || womanForm.name,
										email: person?.email || womanForm.email,
										phone: person?.phone || womanForm.phone,
									});
								}}
							>
								<option value="">{tr('Perfil sin usuario')}</option>
								{data.availableUsers.map((item) => (
									<option value={item.id} key={item.id}>
										{item.name} · {item.email}
									</option>
								))}
							</select>
						</label>
						<label>
							{tr('Nombre completo')}
							<input
								required
								value={womanForm.name}
								onChange={(event) =>
									setWomanForm({ ...womanForm, name: event.target.value })
								}
							/>
						</label>
						<div className="form-grid">
							<label>
								{tr('Correo')}
								<input
									type="email"
									value={womanForm.email}
									onChange={(event) =>
										setWomanForm({ ...womanForm, email: event.target.value })
									}
								/>
							</label>
							<label>
								{tr('WhatsApp / teléfono')}
								<input
									value={womanForm.phone}
									onChange={(event) =>
										setWomanForm({ ...womanForm, phone: event.target.value })
									}
								/>
							</label>
							<label>
								{tr('Fecha de nacimiento')}
								<input
									type="date"
									value={womanForm.dateOfBirth}
									onChange={(event) =>
										setWomanForm({
											...womanForm,
											dateOfBirth: event.target.value,
										})
									}
								/>
							</label>
							<label>
								{tr('Estado')}
								<select
									value={womanForm.membershipStatus}
									onChange={(event) =>
										setWomanForm({
											...womanForm,
											membershipStatus: event.target.value,
										})
									}
								>
									<option value="MEMBER">{tr('Miembro')}</option>
									<option value="VISITOR">{tr('Visitante')}</option>
									<option value="INACTIVE">{tr('Inactiva')}</option>
								</select>
							</label>
						</div>
						<label>
							{tr('Intereses')}
							<input
								value={womanForm.interests}
								onChange={(event) =>
									setWomanForm({ ...womanForm, interests: event.target.value })
								}
								placeholder={tr('Oración, salud, mentoría…')}
							/>
						</label>
						<label>
							{tr('Nota de inclusión')}
							<textarea
								rows={3}
								value={womanForm.inclusionNotes}
								onChange={(event) =>
									setWomanForm({
										...womanForm,
										inclusionNotes: event.target.value,
									})
								}
							/>
						</label>
						<ModalActions
							busy={busy}
							onCancel={() => setModal('')}
							label={tr('Guardar perfil')}
						/>
					</form>
				</Modal>
			)}
			{modal === 'activity' && (
				<Modal
					busy={busy}
					dirty={activityPending}
					label={tr('Nueva actividad')}
					onClose={() => setModal('')}
				>
					<form
						className="modal-card premium-modal wm-modal"
						onSubmit={saveActivity}
					>
						{error && (
							<Notice
								tone="danger"
								title={tr('No fue posible completar la acción')}
							>
								{error}
							</Notice>
						)}
						<button
							data-dialog-close
							type="button"
							className="modal-close"
							onClick={() => setModal('')}
							aria-label={tr('Cerrar')}
						>
							<X />
						</button>
						<span className="modal-symbol">
							<CalendarDays />
						</span>
						<span className="eyebrow">{tr('Planificación conectada')}</span>
						<h2>{tr('Nueva actividad')}</h2>
						{activityPending && <Notice tone="warning" title={tr('Solicitud pendiente de confirmar')}>{tr('Se conservarán los mismos datos al reintentar, sin crear otra actividad.')}{activityProgress.current.calendarId && <Link className="button button-ghost" href={`/activities/${activityProgress.current.calendarId}`}>{tr('Abrir actividad guardada')}</Link>}</Notice>}
						<p>
							{tr(
								'Se creará en el calendario central para validar disponibilidad y conflictos.',
							)}
						</p>
						<fieldset disabled={activityPending} className="pending-fields">
						<label>
							{tr('Nombre de la actividad')}
							<input
								required
								value={activityForm.title}
								onChange={(event) =>
									setActivityForm({
										...activityForm,
										title: event.target.value,
									})
								}
							/>
						</label>
						<label>
							{tr('Objetivo')}
							<textarea
								required
								minLength={3}
								rows={3}
								value={activityForm.objective}
								onChange={(event) =>
									setActivityForm({
										...activityForm,
										objective: event.target.value,
									})
								}
							/>
						</label>
						<div className="form-grid">
							<label>
								{tr('Tipo')}
								<select
									value={activityForm.activityType}
									onChange={(event) =>
										setActivityForm({
											...activityForm,
											activityType: event.target.value,
										})
									}
								>
									<option value="SPIRITUAL">
										{tr('Crecimiento espiritual')}
									</option>
									<option value="FELLOWSHIP">{tr('Confraternidad')}</option>
									<option value="SERVICE">{tr('Servicio comunitario')}</option>
									<option value="TRAINING">{tr('Capacitación')}</option>
									<option value="HEALTH">{tr('Salud integral')}</option>
									<option value="EVANGELISM">{tr('Evangelismo')}</option>
									<option value="OTHER">{tr('Otra')}</option>
								</select>
							</label>
							<label>
								{tr('Responsable')}
								<select
									value={activityForm.responsibleId}
									onChange={(event) =>
										setActivityForm({
											...activityForm,
											responsibleId: event.target.value,
										})
									}
								>
									<option value="">{tr('Dirección del ministerio')}</option>
									{data.team.map((item) => (
										<option value={item.id} key={item.id}>
											{item.name}
										</option>
									))}
								</select>
							</label>
							<label>
								{tr('Inicio')}
								<input
									required
									type="datetime-local"
									value={activityForm.startsAt}
									onChange={(event) =>
										setActivityForm({
											...activityForm,
											startsAt: event.target.value,
										})
									}
								/>
							</label>
							<label>
								{tr('Finaliza')}
								<input
									required
									type="datetime-local"
									value={activityForm.endsAt}
									onChange={(event) =>
										setActivityForm({
											...activityForm,
											endsAt: event.target.value,
										})
									}
								/>
							</label>
							<label>
								{tr('Lugar')}
								<input
									value={activityForm.venue}
									onChange={(event) =>
										setActivityForm({
											...activityForm,
											venue: event.target.value,
										})
									}
								/>
							</label>
							<label>
								{tr('Presupuesto DOP')}
								<input
									type="number"
									min="0"
									value={activityForm.plannedBudget}
									onChange={(event) =>
										setActivityForm({
											...activityForm,
											plannedBudget: Number(event.target.value),
										})
									}
								/>
							</label>
						</div>
						<fieldset className="wm-age-selector">
							<legend>{tr('Rangos de edad enfocados')}</legend>
							{Object.entries(ageLabels)
								.filter(([value]) => value !== 'UNSPECIFIED')
								.map(([value, label]) => (
									<label key={value}>
										<input
											type="checkbox"
											checked={activityForm.targetAgeBands.includes(value)}
											onChange={(event) =>
												setActivityForm({
													...activityForm,
													targetAgeBands: event.target.checked
														? [...activityForm.targetAgeBands, value]
														: activityForm.targetAgeBands.filter(
																(item) => item !== value,
															),
												})
											}
										/>
										<span>{label}</span>
										<Check />
									</label>
								))}
						</fieldset>
						</fieldset>
						<ModalActions
							busy={busy}
							onCancel={() => setModal('')}
							label={activityPending ? tr('Reintentar confirmación') : tr('Planificar y calendarizar')}
						/>
					</form>
				</Modal>
			)}
			{modal === 'budget' && (
				<SimpleModal
					error={error}
					title={tr('Registrar movimiento')}
					eyebrow={tr('Control presupuestario')}
					icon={<BadgeDollarSign />}
					onClose={() => setModal('')}
					onSubmit={saveBudget}
					busy={busy}
					submit={tr('Guardar movimiento')}
				>
					<div className="form-grid">
						<label>
							{tr('Tipo')}
							<select
								value={budgetForm.entryType}
								onChange={(e) =>
									setBudgetForm({ ...budgetForm, entryType: e.target.value })
								}
							>
								<option value="PLANNED_EXPENSE">
									{tr('Partida planificada')}
								</option>
								<option value="EXPENSE">{tr('Gasto realizado')}</option>
								<option value="INCOME">{tr('Ingreso recibido')}</option>
							</select>
						</label>
						<label>
							{tr('Monto')}
							<input
								required
								type="number"
								min="0.01"
								step="0.01"
								value={budgetForm.amount}
								onChange={(e) =>
									setBudgetForm({
										...budgetForm,
										amount: Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							{tr('Categoría')}
							<input
								required
								value={budgetForm.category}
								onChange={(e) =>
									setBudgetForm({ ...budgetForm, category: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Fecha')}
							<input
								required
								type="date"
								value={budgetForm.occurredOn}
								onChange={(e) =>
									setBudgetForm({ ...budgetForm, occurredOn: e.target.value })
								}
							/>
						</label>
					</div>
					<label>
						{tr('Descripción')}
						<input
							value={budgetForm.description}
							onChange={(e) =>
								setBudgetForm({ ...budgetForm, description: e.target.value })
							}
						/>
					</label>
					<label>
						{tr('Referencia / recibo')}
						<input
							value={budgetForm.receiptReference}
							onChange={(e) =>
								setBudgetForm({
									...budgetForm,
									receiptReference: e.target.value,
								})
							}
						/>
					</label>
				</SimpleModal>
			)}
			{modal === 'participation' && (
				<SimpleModal
					error={error}
					title={tr('Registrar participación')}
					eyebrow={tr('Medición de inclusión')}
					icon={<UserPlus />}
					onClose={() => setModal('')}
					onSubmit={saveParticipation}
					busy={busy}
					submit={tr('Guardar participación')}
				>
					<label>
						{tr('Mujer')}
						<select
							required
							value={participationForm.womanId}
							onChange={(e) =>
								setParticipationForm({
									...participationForm,
									womanId: e.target.value,
								})
							}
						>
							<option value="">{tr('Seleccionar…')}</option>
							{data.women
								.filter((item) => item.active)
								.map((item) => (
									<option value={item.id} key={item.id}>
										{item.name}
									</option>
								))}
						</select>
					</label>
					<label>
						{tr('Resultado')}
						<select
							value={participationForm.status}
							onChange={(e) =>
								setParticipationForm({
									...participationForm,
									status: e.target.value,
								})
							}
						>
							<option value="INVITED">{tr('Invitada')}</option>
							<option value="CONFIRMED">{tr('Confirmada')}</option>
							<option value="ATTENDED">{tr('Asistió')}</option>
							<option value="DECLINED">{tr('No participará')}</option>
							<option value="NO_SHOW">{tr('No asistió')}</option>
						</select>
					</label>
					<label>
						{tr('Nota')}
						<input
							value={participationForm.notes}
							onChange={(e) =>
								setParticipationForm({
									...participationForm,
									notes: e.target.value,
								})
							}
						/>
					</label>
				</SimpleModal>
			)}
			{modal === 'retreat' && (
				<SimpleModal
					error={error}
					title={tr('Crear retiro espiritual')}
					eyebrow={tr('Encuentro anual')}
					icon={<Hotel />}
					onClose={() => setModal('')}
					onSubmit={saveRetreat}
					busy={busy}
					submit={tr('Crear retiro')}
				>
					<label>
						{tr('Nombre')}
						<input
							required
							value={retreatForm.title}
							onChange={(e) =>
								setRetreatForm({ ...retreatForm, title: e.target.value })
							}
						/>
					</label>
					<div className="form-grid">
						<label>
							{tr('Año')}
							<input
								required
								type="number"
								min="2020"
								max="2100"
								value={retreatForm.year}
								onChange={(e) =>
									setRetreatForm({
										...retreatForm,
										year: Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							{tr('Resort')}
							<input
								required
								value={retreatForm.resort}
								onChange={(e) =>
									setRetreatForm({ ...retreatForm, resort: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Inicio')}
							<input
								required
								type="date"
								value={retreatForm.startsOn}
								onChange={(e) =>
									setRetreatForm({ ...retreatForm, startsOn: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Final')}
							<input
								required
								type="date"
								min={retreatForm.startsOn}
								value={retreatForm.endsOn}
								onChange={(e) =>
									setRetreatForm({ ...retreatForm, endsOn: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Capacidad')}
							<input
								required
								type="number"
								min="1"
								value={retreatForm.capacity}
								onChange={(e) =>
									setRetreatForm({
										...retreatForm,
										capacity: Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							{tr('Costo por persona')}
							<input
								required
								type="number"
								min="0"
								value={retreatForm.costPerPerson}
								onChange={(e) =>
									setRetreatForm({
										...retreatForm,
										costPerPerson: Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							{tr('Presupuesto total')}
							<input
								required
								type="number"
								min="0"
								value={retreatForm.totalBudget}
								onChange={(e) =>
									setRetreatForm({
										...retreatForm,
										totalBudget: Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							{tr('Fecha límite de depósito')}
							<input
								type="date"
								value={retreatForm.depositDeadline}
								onChange={(e) =>
									setRetreatForm({
										...retreatForm,
										depositDeadline: e.target.value,
									})
								}
							/>
						</label>
					</div>
					<label>
						{tr('Notas')}
						<textarea
							rows={3}
							value={retreatForm.notes}
							onChange={(e) =>
								setRetreatForm({ ...retreatForm, notes: e.target.value })
							}
						/>
					</label>
				</SimpleModal>
			)}
			{modal === 'registration' && (
				<SimpleModal
					error={error}
					title={tr('Inscribir al retiro')}
					eyebrow={tr('Participantes y logística')}
					icon={<UserPlus />}
					onClose={() => setModal('')}
					onSubmit={saveRegistration}
					busy={busy}
					submit={tr('Guardar inscripción')}
				>
					<label>
						{tr('Mujer')}
						<select
							required
							value={registrationForm.womanId}
							onChange={(e) =>
								setRegistrationForm({
									...registrationForm,
									womanId: e.target.value,
								})
							}
						>
							<option value="">{tr('Seleccionar…')}</option>
							{data.women
								.filter(
									(item) =>
										item.active &&
										!selectedRetreat?.registrations.some(
											(entry) => entry.womanId === item.id,
										),
								)
								.map((item) => (
									<option value={item.id} key={item.id}>
										{item.name}
									</option>
								))}
						</select>
					</label>
					<div className="form-grid">
						<label>
							{tr('Confirmación')}
							<select
								value={registrationForm.attendanceStatus}
								onChange={(e) =>
									setRegistrationForm({
										...registrationForm,
										attendanceStatus: e.target.value,
									})
								}
							>
								<option value="INTERESTED">{tr('Interesada')}</option>
								<option value="CONFIRMED">{tr('Confirmada')}</option>
								<option value="DECLINED">{tr('No participará')}</option>
								<option value="WAITLIST">{tr('Lista de espera')}</option>
							</select>
						</label>
						<label>
							{tr('Monto a pagar')}
							<input
								type="number"
								min="0"
								value={registrationForm.amountDue}
								onChange={(e) =>
									setRegistrationForm({
										...registrationForm,
										amountDue: Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							{tr('Habitación')}
							<input
								value={registrationForm.roomAssignment}
								onChange={(e) =>
									setRegistrationForm({
										...registrationForm,
										roomAssignment: e.target.value,
									})
								}
							/>
						</label>
						<label className="wm-check">
							<input
								type="checkbox"
								checked={registrationForm.transportRequired}
								onChange={(e) =>
									setRegistrationForm({
										...registrationForm,
										transportRequired: e.target.checked,
									})
								}
							/>
							{tr(' Requiere transporte')}
						</label>
					</div>
					<label>
						{tr('Necesidades alimentarias')}
						<input
							value={registrationForm.dietaryNotes}
							onChange={(e) =>
								setRegistrationForm({
									...registrationForm,
									dietaryNotes: e.target.value,
								})
							}
						/>
					</label>
				</SimpleModal>
			)}
			{modal === 'payment' && (
				<SimpleModal
					locked={paymentPending}
					notice={paymentPending ? tr('El pago sigue sin confirmarse. Reintenta los mismos datos para evitar duplicarlo.') : ''}
					error={error}
					title={[tr('Registrar pago · '), paymentForm.name].join('')}
					eyebrow={tr('Tesorería del retiro')}
					icon={<BadgeDollarSign />}
					onClose={() => setModal('')}
					onSubmit={savePayment}
					busy={busy}
					submit={paymentPending ? tr('Reintentar confirmación') : tr('Registrar pago')}
				>
					<div className="form-grid">
						<label>
							{tr('Monto')}
							<input
								required
								type="number"
								min="0.01"
								value={paymentForm.amount}
								onChange={(e) =>
									setPaymentForm({
										...paymentForm,
										amount: Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							{tr('Fecha')}
							<input
								required
								type="date"
								value={paymentForm.paidOn}
								onChange={(e) =>
									setPaymentForm({ ...paymentForm, paidOn: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Método')}
							<select
								value={paymentForm.method}
								onChange={(e) =>
									setPaymentForm({ ...paymentForm, method: e.target.value })
								}
							>
								<option value="TRANSFER">{tr('Transferencia')}</option>
								<option value="CASH">{tr('Efectivo')}</option>
								<option value="CARD">{tr('Tarjeta')}</option>
								<option value="OTHER">{tr('Otro')}</option>
							</select>
						</label>
						<label>
							{tr('Referencia')}
							<input
								value={paymentForm.reference}
								onChange={(e) =>
									setPaymentForm({ ...paymentForm, reference: e.target.value })
								}
							/>
						</label>
					</div>
				</SimpleModal>
			)}
			{modal === 'followup' && (
				<SimpleModal
					error={error}
					title={tr('Crear seguimiento')}
					eyebrow={tr('Cuidado e inclusión')}
					icon={<HeartHandshake />}
					onClose={() => setModal('')}
					onSubmit={saveFollow}
					busy={busy}
					submit={tr('Asignar seguimiento')}
				>
					<label>
						{tr('Mujer')}
						<select
							required
							value={followForm.womanId}
							onChange={(e) =>
								setFollowForm({ ...followForm, womanId: e.target.value })
							}
						>
							<option value="">{tr('Seleccionar…')}</option>
							{data.women
								.filter((item) => item.active)
								.map((item) => (
									<option value={item.id} key={item.id}>
										{item.name}
									</option>
								))}
						</select>
					</label>
					<label>
						{tr('Motivo')}
						<input
							required
							value={followForm.reason}
							onChange={(e) =>
								setFollowForm({ ...followForm, reason: e.target.value })
							}
							placeholder={tr('Invitar, escuchar, acompañar o integrar')}
						/>
					</label>
					<div className="form-grid">
						<label>
							{tr('Fecha de seguimiento')}
							<input
								required
								type="date"
								value={followForm.dueOn}
								onChange={(e) =>
									setFollowForm({ ...followForm, dueOn: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Responsable')}
							<select
								value={followForm.assignedTo}
								onChange={(e) =>
									setFollowForm({ ...followForm, assignedTo: e.target.value })
								}
							>
								<option value="">{tr('Sin asignar')}</option>
								{data.team.map((item) => (
									<option value={item.id} key={item.id}>
										{item.name}
									</option>
								))}
							</select>
						</label>
						<label>
							{tr('Actividad relacionada')}
							<select
								value={followForm.activityId}
								onChange={(e) =>
									setFollowForm({ ...followForm, activityId: e.target.value })
								}
							>
								<option value="">{tr('Seguimiento general')}</option>
								{data.activities.map((item) => (
									<option value={item.id} key={item.id}>
										{item.title}
									</option>
								))}
							</select>
						</label>
					</div>
					<label>
						{tr('Notas')}
						<textarea
							rows={3}
							value={followForm.notes}
							onChange={(e) =>
								setFollowForm({ ...followForm, notes: e.target.value })
							}
						/>
					</label>
				</SimpleModal>
			)}
		</Shell>
	);
}

function ModalActions({
	busy,
	onCancel,
	label,
}: {
	busy: boolean;
	onCancel: () => void;
	label: string;
}) {
	const { tr } = useExperience();
	return (
		<div className="modal-actions">
			<button
				data-dialog-close
				type="button"
				className="button button-ghost"
				onClick={onCancel}
			>
				{tr('Cancelar')}
			</button>
			<button type="submit" className="button button-primary" disabled={busy}>
				{busy ? tr('Guardando…') : label}
			</button>
		</div>
	);
}
function SimpleModal({
	title,
	eyebrow,
	icon,
	onClose,
	onSubmit,
	busy,
	submit,
	error,
	locked = false,
	notice = '',
	children,
}: {
	title: string;
	eyebrow: string;
	icon: React.ReactNode;
	onClose: () => void;
	onSubmit: (event: React.FormEvent) => void;
	busy: boolean;
	submit: string;
	error: string;
	locked?: boolean;
	notice?: string;
	children: React.ReactNode;
}) {
	const { tr } = useExperience();
	return (
		<Modal busy={busy} dirty={locked} label={title} onClose={onClose}>
			<form className="modal-card premium-modal wm-modal" onSubmit={onSubmit}>
				<button
					data-dialog-close
					type="button"
					className="modal-close"
					onClick={onClose}
					aria-label={tr('Cerrar')}
				>
					<X />
				</button>
				<span className="modal-symbol">{icon}</span>
				<span className="eyebrow">{eyebrow}</span>
				<h2>{title}</h2>
				{error && (
					<Notice
						tone="danger"
						title={tr('No fue posible completar la acción')}
					>
						{error}
					</Notice>
				)}
				{notice && <Notice tone="warning" title={tr('Solicitud pendiente de confirmar')}>{notice}</Notice>}
				<fieldset disabled={locked} className="pending-fields">{children}</fieldset>
				<ModalActions busy={busy} onCancel={onClose} label={submit} />
			</form>
		</Modal>
	);
}
