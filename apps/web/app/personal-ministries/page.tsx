'use client';

import { Modal } from '@/components/modal';
import { useExperience } from '@/components/experience-provider';
import { SectionTabs } from '@/components/section-tabs';

import {
	ArrowRight,
	BarChart3,
	BookOpen,
	CalendarDays,
	CheckCircle2,
	Church,
	CircleUserRound,
	Cross,
	Flag,
	HeartHandshake,
	MapPin,
	Banknote,
	Plus,
	ReceiptText,
	Search,
	Send,
	Sparkles,
	Target,
	TrendingUp,
	TriangleAlert,
	Users,
	WalletCards,
	X,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/shell';
import { Badge, Empty, Notice, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { currentLocale, localeTag } from '@/lib/i18n';

type Access = {
	canRead: boolean;
	canManage: boolean;
	canAssign: boolean;
	canManageRecords: boolean;
	membershipRole: string | null;
};
type TeamMember = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	role: string;
	appointments: string[];
};
type Plan = {
	id: string;
	title: string;
	periodStart: string;
	periodEnd: string;
	vision: string;
	objectives: string[];
	status: string;
	progress: number;
	ownerName: string | null;
};
type Assignment = {
	userId: string;
	name: string;
	responsibility: string;
	workloadPercent: number;
	status: string;
};
type Initiative = {
	id: string;
	title: string;
	description: string;
	scope: string;
	initiativeType: string;
	startsOn: string;
	endsOn: string;
	status: string;
	priority: string;
	progress: number;
	targetCount: number;
	actualCount: number;
	strategicPlanTitle: string | null;
	assignments: Assignment[];
	plannedBudget: number;
	spentBudget: number;
	committedBudget: number;
	incomeBudget: number;
	availableBudget: number;
	forecastBudget: number;
	currency: string;
};
type BudgetEntry = {
	id: string;
	initiativeId: string;
	initiativeTitle: string;
	entryType: string;
	category: string;
	description: string;
	amount: number;
	occurredOn: string;
	vendor: string;
	reference: string;
	notes: string;
	status: string;
	createdByName: string;
	approvedByName: string | null;
};
type Contact = {
	id: string;
	name: string;
	phone: string;
	email: string;
	stage: string;
	source: string;
	assignedTo: string | null;
	assignedToName: string | null;
	nextFollowUpAt: string | null;
	studyCount: number;
	lastStudyAt: string | null;
	consent: boolean;
};
type Study = {
	id: string;
	contactId: string;
	contactName: string;
	instructorId: string;
	instructorName: string;
	studiedAt: string;
	lesson: string;
	outcome: string;
	nextStudyAt: string | null;
	status: string;
};
type SmallGroup = {
	id: string;
	name: string;
	leaderName: string;
	assistantName: string | null;
	meetingDay: number;
	meetingTime: string;
	location: string;
	status: string;
	goal: number;
	currentMembers: number;
};
type MissionaryMinute = {
	id: string;
	title: string;
	scheduledAt: string;
	endsAt: string;
	presenterName: string;
	theme: string;
	material: string;
	status: string;
};
type Campaign = {
	id: string;
	title: string;
	theme: string;
	startsOn: string;
	endsOn: string;
	venue: string;
	evangelist: string;
	goal: number;
	status: string;
	decisionCount: number;
	baptismCount: number;
};
type ChurchActivity = {
	id: string;
	code: string;
	title: string;
	status: string;
	department: string;
	startsAt: string;
	endsAt: string;
};
type Context = {
	access: Access;
	team: TeamMember[];
	plans: Plan[];
	initiatives: Initiative[];
	budgetEntries: BudgetEntry[];
	contacts: Contact[];
	studies: Study[];
	groups: SmallGroup[];
	missionaryMinutes: MissionaryMinute[];
	campaigns: Campaign[];
	localChurchActivities: ChurchActivity[];
	metrics: {
		activeInitiatives: number;
		atRisk: number;
		openContacts: number;
		scheduledStudies: number;
		activeGroups: number;
		baptisms: number;
		stageCounts: Record<string, number>;
		budget: {
			planned: number;
			spent: number;
			committed: number;
			income: number;
			forecast: number;
			available: number;
			utilization: number;
			overBudget: number;
		};
	};
};
type Tab =
	| 'overview'
	| 'strategy'
	| 'budget'
	| 'people'
	| 'groups'
	| 'minutes'
	| 'campaigns'
	| 'team';
type ModalKind =
	| 'plan'
	| 'initiative'
	| 'contact'
	| 'study'
	| 'group'
	| 'minute'
	| 'campaign'
	| 'budgetPlan'
	| 'budgetEntry'
	| null;

const tabs: Array<{ id: Tab; label: string; icon: typeof Target }> = [
	{ id: 'overview', label: 'Centro de misión', icon: BarChart3 },
	{ id: 'strategy', label: 'Estrategia', icon: Target },
	{ id: 'budget', label: 'Presupuesto', icon: WalletCards },
	{ id: 'people', label: 'Interesados y estudios', icon: HeartHandshake },
	{ id: 'groups', label: 'Grupos pequeños', icon: Users },
	{ id: 'minutes', label: 'Minutos misioneros', icon: CalendarDays },
	{ id: 'campaigns', label: 'Evangelismo', icon: Flag },
	{ id: 'team', label: 'Equipo', icon: CircleUserRound },
];
const stageLabels: Record<string, string> = {
	INTERESTED: 'Interesados',
	BIBLE_STUDY: 'En estudio bíblico',
	BAPTISM_CANDIDATE: 'Preparándose para bautismo',
	BAPTIZED: 'Bautizados',
	INACTIVE: 'En pausa',
};
const scopeLabels: Record<string, string> = {
	GLOBAL: 'Iglesia mundial',
	UNION: 'Unión Dominicana',
	CONFERENCE: 'Asociación Dominicana del Sureste',
	LOCAL: 'Iglesia local',
};
const roleLabels: Record<string, string> = {
	DIRECTOR: 'Dirección',
	ASSISTANT_DIRECTOR: 'Subdirección',
	DEPARTMENT_SECRETARY: 'Secretaría',
	PLANNER: 'Planificación',
	CONTRIBUTOR: 'Colaboración',
	VIEWER: 'Consulta',
};
const days = [
	'Domingo',
	'Lunes',
	'Martes',
	'Miércoles',
	'Jueves',
	'Viernes',
	'Sábado',
];

function dateText(value: string | null | undefined) {
	if (!value) return 'Sin fecha';
	return new Intl.DateTimeFormat(localeTag(currentLocale()), { dateStyle: 'medium' }).format(
		new Date(value),
	);
}
function dateTimeText(value: string | null | undefined) {
	if (!value) return 'Sin fecha';
	return new Intl.DateTimeFormat(localeTag(currentLocale()), {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}
function asIso(value: FormDataEntryValue | null) {
	return value ? new Date(String(value)).toISOString() : null;
}
function value(form: FormData, key: string) {
	return String(form.get(key) ?? '').trim();
}
function money(amount: number, currency = 'DOP') {
	return new Intl.NumberFormat(localeTag(currentLocale()), {
		style: 'currency',
		currency,
		maximumFractionDigits: 2,
	}).format(amount);
}

export default function PersonalMinistriesPage() {
	const { tr } = useExperience();
	const [data, setData] = useState<Context | null>(null);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [tab, setTab] = useState<Tab>('overview');
	const [modal, setModal] = useState<ModalKind>(null);
	const [saving, setSaving] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedBudgetId, setSelectedBudgetId] = useState('');
	const load = () => {
		setError('');
		api<Context>('/personal-ministries/context')
			.then(setData)
			.catch((reason) => setError(reason.message));
	};
	useEffect(load, []);
	useEffect(() => { const view = new URLSearchParams(window.location.search).get('view'); if (tabs.some((item) => item.id === view)) setTab(view as Tab); }, []);
	const filteredContacts = useMemo(() => {
		const q = search.toLocaleLowerCase('es');
		return (data?.contacts ?? []).filter((item) =>
			`${item.name} ${item.source} ${item.assignedToName ?? ''} ${stageLabels[item.stage] ?? item.stage}`
				.toLocaleLowerCase('es')
				.includes(q),
		);
	}, [data, search]);
	const budgetInitiative = useMemo(
		() =>
			data?.initiatives.find((item) => item.id === selectedBudgetId) ??
			data?.initiatives[0] ??
			null,
		[data, selectedBudgetId],
	);
	const visibleBudgetEntries = useMemo(
		() =>
			(data?.budgetEntries ?? []).filter(
				(item) => item.initiativeId === budgetInitiative?.id,
			),
		[data, budgetInitiative],
	);
	const workload = useMemo(
		() =>
			(data?.team ?? []).map((member) => ({
				...member,
				total: (data?.initiatives ?? [])
					.flatMap((item) => item.assignments)
					.filter(
						(assignment) =>
							assignment.userId === member.id &&
							assignment.status !== 'COMPLETED',
					)
					.reduce((sum, item) => sum + item.workloadPercent, 0),
			})),
		[data],
	);

	async function post(path: string, body: unknown, message: string) {
		setSaving(true);
		setError('');
		try {
			await api(path, { method: 'POST', body: JSON.stringify(body) });
			setModal(null);
			setNotice(message);
			load();
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: 'No se pudo completar la acción.',
			);
		} finally {
			setSaving(false);
		}
	}
	async function patch(path: string, body: unknown, message: string, closeModal = false) {
		setSaving(true);
		setError('');
		try {
			await api(path, { method: 'PATCH', body: JSON.stringify(body) });
			if (closeModal) setModal(null);
			setNotice(message);
			load();
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: 'No se pudo completar la acción.',
			);
		} finally {
			setSaving(false);
		}
	}
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!modal) return;
		const form = new FormData(event.currentTarget);
		if (modal === 'plan')
			void post(
				'/personal-ministries/strategic-plans',
				{
					title: value(form, 'title'),
					periodStart: value(form, 'periodStart'),
					periodEnd: value(form, 'periodEnd'),
					vision: value(form, 'vision'),
					objectives: value(form, 'objectives')
						.split('\n')
						.map((item) => item.trim())
						.filter(Boolean),
					ownerId: value(form, 'ownerId') || null,
					status: 'ACTIVE',
				},
				'Plan estratégico creado y activado.',
			);
		if (modal === 'initiative')
			void post(
				'/personal-ministries/initiatives',
				{
					title: value(form, 'title'),
					description: value(form, 'description'),
					scope: value(form, 'scope'),
					initiativeType: value(form, 'initiativeType'),
					startsOn: value(form, 'startsOn'),
					endsOn: value(form, 'endsOn'),
					priority: value(form, 'priority'),
					targetCount: Number(value(form, 'targetCount') || 0),
					strategicPlanId: value(form, 'strategicPlanId') || null,
					assigneeId: value(form, 'assigneeId') || null,
					responsibility: value(form, 'responsibility'),
					workloadPercent: Number(value(form, 'workloadPercent') || 0),
					plannedBudget: Number(value(form, 'plannedBudget') || 0),
					currency: value(form, 'currency') || 'DOP',
				},
				'Iniciativa creada, calendarizada y asignada.',
			);
		if (modal === 'contact')
			void post(
				'/personal-ministries/contacts',
				{
					name: value(form, 'name'),
					phone: value(form, 'phone'),
					email: value(form, 'email'),
					stage: value(form, 'stage'),
					source: value(form, 'source'),
					assignedTo: value(form, 'assignedTo') || null,
					nextFollowUpAt: asIso(form.get('nextFollowUpAt')),
					notes: value(form, 'notes'),
					consent: form.get('consent') === 'on',
				},
				'Interesado registrado con trazabilidad.',
			);
		if (modal === 'study')
			void post(
				'/personal-ministries/bible-studies',
				{
					contactId: value(form, 'contactId'),
					instructorId: value(form, 'instructorId'),
					studiedAt: asIso(form.get('studiedAt')),
					lesson: value(form, 'lesson'),
					outcome: value(form, 'outcome'),
					nextStudyAt: asIso(form.get('nextStudyAt')),
					status: value(form, 'status'),
					notes: value(form, 'notes'),
				},
				'Estudio bíblico registrado.',
			);
		if (modal === 'group')
			void post(
				'/personal-ministries/small-groups',
				{
					name: value(form, 'name'),
					leaderId: value(form, 'leaderId'),
					assistantId: value(form, 'assistantId') || null,
					meetingDay: Number(value(form, 'meetingDay')),
					meetingTime: value(form, 'meetingTime'),
					location: value(form, 'location'),
					status: 'ACTIVE',
					goal: Number(value(form, 'goal') || 0),
					currentMembers: Number(value(form, 'currentMembers') || 0),
				},
				'Grupo pequeño activado.',
			);
		if (modal === 'minute')
			void post(
				'/personal-ministries/missionary-minutes',
				{
					title: value(form, 'title'),
					scheduledAt: asIso(form.get('scheduledAt')),
					endsAt: asIso(form.get('endsAt')),
					presenterId: value(form, 'presenterId'),
					theme: value(form, 'theme'),
					material: value(form, 'material'),
					status: 'SCHEDULED',
				},
				'Minuto misionero calendarizado y notificado.',
			);
		if (modal === 'campaign')
			void post(
				'/personal-ministries/campaigns',
				{
					title: value(form, 'title'),
					theme: value(form, 'theme'),
					startsOn: value(form, 'startsOn'),
					endsOn: value(form, 'endsOn'),
					venue: value(form, 'venue'),
					evangelist: value(form, 'evangelist'),
					goal: Number(value(form, 'goal') || 0),
					initiativeId: value(form, 'initiativeId') || null,
					status: 'PLANNING',
				},
				'Campaña evangelística planificada.',
			);
		if (modal === 'budgetPlan' && budgetInitiative)
			void patch(
				`/personal-ministries/initiatives/${budgetInitiative.id}`,
				{
					plannedBudget: Number(value(form, 'plannedBudget') || 0),
					currency: value(form, 'currency') || 'DOP',
				},
				'Presupuesto aprobado actualizado.',
				true,
			);
		if (modal === 'budgetEntry' && budgetInitiative)
			void post(
				`/personal-ministries/initiatives/${budgetInitiative.id}/budget-entries`,
				{
					entryType: value(form, 'entryType'),
					category: value(form, 'category'),
					description: value(form, 'description'),
					amount: Number(value(form, 'amount')),
					occurredOn: value(form, 'occurredOn'),
					vendor: value(form, 'vendor'),
					reference: value(form, 'reference'),
					notes: value(form, 'notes'),
					status: value(form, 'status'),
				},
				'Partida presupuestaria registrada.',
			);
	}

	if (!data && !error)
		return (
			<Shell title={tr("Ministerios Personales")} eyebrow={tr("Misión y evangelismo")}>
				<Spinner />
			</Shell>
		);
	return (
		<Shell
			title={tr("Ministerios Personales")}
			eyebrow={tr("Misión y evangelismo")}
			actions={
				data?.access.canManage ? (
					<button
						type="button"
						className="button primary"
						onClick={() => setModal('initiative')}
					>
						<Plus />{tr("Nueva iniciativa")}</button>
				) : undefined
			}
		>
			{error && (
				<Notice tone="danger" title={tr("No fue posible completar la acción")}>
					{error}
				</Notice>
			)}
			{notice && (
				<Notice tone="success" title={tr("Actualización confirmada")}>
					{notice}
				</Notice>
			)}
			{!data ? (
				<Empty
					title={tr("Acceso no disponible")}
					text={tr("Comprueba tu pertenencia al departamento o solicita acceso al administrador.")}
				/>
			) : (
				<div className="pm-workspace">
					<section className="pm-hero">
						<div className="pm-hero-copy">
							<span>
								<Send />{tr(" OPERACIÓN MISIONERA INTEGRADA")}</span>
							<h2>{tr("Del plan a cada persona,")}<br />
								<em>{tr("sin perder el seguimiento.")}</em>
							</h2>
							<p>{tr("Estrategia, evangelismo, estudios bíblicos, grupos pequeños y equipo en una sola vista ejecutiva.")}</p>
							<div>
								<button
									type="button"
									className="button light"
									onClick={() => setTab('people')}
								>{tr("Ver recorrido misionero ")}<ArrowRight />
								</button>
								<button
									type="button"
									className="button ghost-light"
									onClick={() => setTab('strategy')}
								>{tr("Abrir plan estratégico")}</button>
							</div>
						</div>
						<div className="pm-hero-signal">
							<Sparkles />
							<small>{tr("SEÑAL MISIONERA")}</small>
							<strong>{Math.max(0, 100 - data.metrics.atRisk * 12)}%</strong>
							<span>
								{data.metrics.atRisk
									? [data.metrics.atRisk, tr(" iniciativa(s) requieren atención")].join('')
									: tr("Ejecución saludable y bajo control")}
							</span>
						</div>
					</section>
					<section className="pm-kpis" aria-label={tr("Indicadores misioneros")}>
						{[
							{
								label: 'Iniciativas activas',
								value: data.metrics.activeInitiatives,
								tab: 'strategy' as Tab,
								icon: Target,
							},
							{
								label: 'Interesados en seguimiento',
								value: data.metrics.openContacts,
								tab: 'people' as Tab,
								icon: HeartHandshake,
							},
							{
								label: 'Estudios programados',
								value: data.metrics.scheduledStudies,
								tab: 'people' as Tab,
								icon: BookOpen,
							},
							{
								label: 'Grupos activos',
								value: data.metrics.activeGroups,
								tab: 'groups' as Tab,
								icon: Users,
							},
							{
								label: 'Bautizados',
								value: data.metrics.baptisms,
								tab: 'people' as Tab,
								icon: Cross,
							},
							{
								label: 'Presupuesto disponible',
								value: money(data.metrics.budget.available),
								tab: 'budget' as Tab,
								icon: WalletCards,
							},
						].map(({ label, value: count, tab: target, icon: Icon }) => (
							<button type="button" key={label} onClick={() => setTab(target)}>
								<Icon />
								<span>
									<strong>{count}</strong>
									<small>{label}</small>
								</span>
								<ArrowRight />
							</button>
						))}
					</section>
					<SectionTabs tabs={tabs.map(({ id, label, icon }) => [id, tr(label), icon] as const)} value={tab} onChange={setTab} label={tr('Áreas de trabajo')} className="pm-tabs" prefix="pm" />
					<div role="tabpanel" id="pm-panel" aria-labelledby={`pm-tab-${tab}`} tabIndex={-1}>

					{tab === 'overview' && (
						<div className="pm-dashboard-grid">
							<section className="pm-panel pm-span-7">
								<header>
									<div>
										<span className="eyebrow">{tr("Ejecución")}</span>
										<h2>{tr("Iniciativas prioritarias")}</h2>
									</div>
									{data.access.canManage && (
										<button
											type="button"
											className="button secondary"
											onClick={() => setModal('initiative')}
										>
											<Plus />{tr("Crear")}</button>
									)}
								</header>
								<div className="pm-scroll-list">
									{data.initiatives.length ? (
										data.initiatives.slice(0, 8).map((item) => (
											<article className="pm-initiative-row" key={item.id}>
												<span
													className={`pm-priority ${item.priority.toLowerCase()}`}
												>
													{item.priority.slice(0, 1)}
												</span>
												<div>
													<strong>{item.title}</strong>
													<small>
														{scopeLabels[item.scope]} · {dateText(item.endsOn)}
													</small>
													<div className="pm-progress">
														<i style={{ width: `${item.progress}%` }} />
														<span>{item.progress}%</span>
													</div>
												</div>
												<Badge status={item.status} />
												{data.access.canManage &&
													item.status !== 'COMPLETED' && (
														<button
															type="button"
															className="icon-button"
															title={tr("Avanzar 10%")}
															onClick={() =>
																void patch(
																	`/personal-ministries/initiatives/${item.id}`,
																	{
																		progress: Math.min(100, item.progress + 10),
																		status:
																			item.progress + 10 >= 100
																				? 'COMPLETED'
																				: 'ACTIVE',
																	},
																	'Progreso actualizado.',
																)
															}
														>
															<ArrowRight />
														</button>
													)}
											</article>
										))
									) : (
										<Empty
											title={tr("Aún no hay iniciativas")}
											text={tr("Crea la primera iniciativa para activar el centro de misión.")}
										/>
									)}
								</div>
							</section>
							<section className="pm-panel pm-span-5">
								<header>
									<div>
										<span className="eyebrow">{tr("Embudo de misión")}</span>
										<h2>{tr("Recorrido de personas")}</h2>
									</div>
									<HeartHandshake />
								</header>
								<div className="pm-funnel">
									{[
										'INTERESTED',
										'BIBLE_STUDY',
										'BAPTISM_CANDIDATE',
										'BAPTIZED',
									].map((stage, index) => (
										<button
											type="button"
											key={stage}
											onClick={() => setTab('people')}
											style={{ width: `${100 - index * 10}%` }}
										>
											<span>{stageLabels[stage]}</span>
											<strong>{data.metrics.stageCounts[stage] ?? 0}</strong>
										</button>
									))}
								</div>
							</section>
							<section className="pm-panel pm-span-7">
								<header>
									<div>
										<span className="eyebrow">{tr("Próximos compromisos")}</span>
										<h2>{tr("Agenda misionera")}</h2>
									</div>
									<CalendarDays />
								</header>
								<div className="pm-agenda">
									{[
										...data.missionaryMinutes
											.filter((item) => item.status === 'SCHEDULED')
											.map((item) => ({
												id: item.id,
												title: item.title,
												date: item.scheduledAt,
												meta: `Minuto misionero · ${item.presenterName}`,
												tone: 'blue',
											})),
										...data.campaigns
											.filter(
												(item) =>
													item.status !== 'COMPLETED' &&
													item.status !== 'CANCELLED',
											)
											.map((item) => ({
												id: item.id,
												title: item.title,
												date: item.startsOn,
												meta: `Campaña · ${item.venue || 'Lugar por definir'}`,
												tone: 'gold',
											})),
										...data.localChurchActivities.slice(0, 4).map((item) => ({
											id: item.id,
											title: item.title,
											date: item.startsAt,
											meta: `${item.department} · ${item.code}`,
											tone: 'green',
										})),
									]
										.sort(
											(a, b) =>
												new Date(a.date).getTime() - new Date(b.date).getTime(),
										)
										.slice(0, 7)
										.map((item) => (
											<button
												type="button"
												key={`${item.tone}-${item.id}`}
												onClick={() =>
													setTab(
														item.tone === 'blue'
															? 'minutes'
															: item.tone === 'gold'
																? 'campaigns'
																: 'overview',
													)
												}
											>
												<time>{dateText(item.date)}</time>
												<i className={item.tone} />
												<span>
													<strong>{item.title}</strong>
													<small>{item.meta}</small>
												</span>
												<ArrowRight />
											</button>
										))}
								</div>
							</section>
							<section className="pm-panel pm-span-5">
								<header>
									<div>
										<span className="eyebrow">{tr("Capacidad del equipo")}</span>
										<h2>{tr("Carga misionera")}</h2>
									</div>
									<Users />
								</header>
								<div className="pm-workload">
									{workload.map((member) => (
										<button
											type="button"
											key={member.id}
											onClick={() => setTab('team')}
										>
											<span>
												<strong>{member.name}</strong>
												<small>{roleLabels[member.role] ?? member.role}</small>
											</span>
											<b>{member.total}%</b>
											<i>
												<em
													style={{ width: `${Math.min(100, member.total)}%` }}
												/>
											</i>
										</button>
									))}
								</div>
							</section>
						</div>
					)}

					{tab === 'strategy' && (
						<section className="pm-section">
							<header>
								<div>
									<span className="eyebrow">{tr("Planificación estratégica")}</span>
									<h2>{tr("Planes e iniciativas")}</h2>
									<p>{tr("Conecta cada acción con un período, alcance, meta y responsable.")}</p>
								</div>
								{data.access.canManage && (
									<div>
										<button
											type="button"
											className="button secondary"
											onClick={() => setModal('plan')}
										>
											<Plus />{tr("Nuevo plan")}</button>
										<button
											type="button"
											className="button primary"
											onClick={() => setModal('initiative')}
										>
											<Plus />{tr("Nueva iniciativa")}</button>
									</div>
								)}
							</header>
							<div className="pm-plan-grid">
								{data.plans.map((plan) => (
									<article key={plan.id}>
										<div>
											<span>
												{dateText(plan.periodStart)} —{' '}
												{dateText(plan.periodEnd)}
											</span>
											<Badge status={plan.status} />
										</div>
										<h3>{plan.title}</h3>
										<p>
											{plan.vision ||
												tr("Visión estratégica pendiente de completar.")}
										</p>
										<footer>
											<span>{tr("Responsable:")}{' '}
												<strong>
													{plan.ownerName ?? tr("Dirección departamental")}
												</strong>
											</span>
											<b>{plan.progress}%</b>
										</footer>
									</article>
								))}
								{!data.plans.length && (
									<Empty
										title={tr("Crea el plan del período")}
										text={tr("Define visión, objetivos y responsable para alinear todas las iniciativas.")}
									/>
								)}
							</div>
							<div className="pm-table">
								<div className="pm-table-head">
									<span>{tr("Iniciativa")}</span>
									<span>{tr("Alcance")}</span>
									<span>{tr("Responsable")}</span>
									<span>{tr("Avance")}</span>
									<span>{tr("Estado")}</span>
								</div>
								{data.initiatives.map((item) => (
									<button type="button" key={item.id}>
										<span>
											<strong>{item.title}</strong>
											<small>{item.initiativeType}</small>
										</span>
										<span>{scopeLabels[item.scope]}</span>
										<span>
											{item.assignments.map((a) => a.name).join(', ') ||
												tr("Sin asignar")}
										</span>
										<span>
											<div className="pm-mini-progress">
												<i style={{ width: `${item.progress}%` }} />
											</div>
											{item.progress}%
										</span>
										<Badge status={item.status} />
									</button>
								))}
							</div>
						</section>
					)}

					{tab === 'budget' && (
						<section className="pm-section pm-budget-section">
							<header>
								<div>
									<span className="eyebrow">{tr("Gobierno financiero")}</span>
									<h2>{tr("Presupuesto por actividad")}</h2>
									<p>{tr("Planifica, compromete y ejecuta recursos con trazabilidad completa.")}</p>
								</div>
								{data.access.canManage && budgetInitiative && (
									<div>
										<button
											type="button"
											className="button secondary"
											onClick={() => setModal('budgetPlan')}
										>
											<WalletCards />{tr(" Ajustar presupuesto")}</button>
										<button
											type="button"
											className="button primary"
											onClick={() => setModal('budgetEntry')}
										>
											<Plus />{tr(" Nueva partida")}</button>
									</div>
								)}
							</header>
							<div className="pm-budget-kpis">
								{[
									{ label: 'Presupuesto aprobado', value: data.metrics.budget.planned, icon: WalletCards },
									{ label: 'Comprometido', value: data.metrics.budget.committed, icon: ReceiptText },
									{ label: 'Pagado', value: data.metrics.budget.spent, icon: Banknote },
									{ label: 'Disponible', value: data.metrics.budget.available, icon: TrendingUp },
								].map(({ label, value: amount, icon: Icon }) => (
									<article key={label} className={amount < 0 ? 'danger' : ''}>
										<Icon />
										<span><small>{label}</small><strong>{money(amount)}</strong></span>
									</article>
								))}
							</div>
							{data.metrics.budget.overBudget > 0 && (
								<div className="pm-budget-alert" role="alert">
									<TriangleAlert />
									<div>
										<strong>{data.metrics.budget.overBudget}{tr(" actividad(es) proyectan sobreejecución")}</strong>
										<span>{tr("Revisa los compromisos antes de autorizar nuevos gastos.")}</span>
									</div>
								</div>
							)}
							<div className="pm-budget-layout">
								<aside className="pm-budget-activities" aria-label={tr("Actividades presupuestadas")}>
									<header><strong>{tr("Actividades")}</strong><span>{data.initiatives.length}</span></header>
									<div>
										{data.initiatives.map((item) => {
											const usage = item.plannedBudget ? Math.min(130, (item.forecastBudget / item.plannedBudget) * 100) : item.forecastBudget ? 130 : 0;
											return (
												<button type="button" key={item.id} className={budgetInitiative?.id === item.id ? 'active' : ''} onClick={() => setSelectedBudgetId(item.id)}>
													<span><strong>{item.title}</strong><small>{tr(`${money(item.plannedBudget, item.currency)} aprobado`)}</small></span>
													<b className={item.availableBudget < 0 ? 'danger' : ''}>{money(item.availableBudget, item.currency)}</b>
													<i><em style={{ width: `${Math.min(100, usage)}%` }} className={usage > 100 ? 'danger' : ''} /></i>
												</button>
											);
										})}
									</div>
								</aside>
								<div className="pm-budget-detail">
									{budgetInitiative ? (
										<>
											<header>
												<div><span className="eyebrow">{tr("Actividad seleccionada")}</span><h3>{budgetInitiative.title}</h3></div>
												<strong>{data.metrics.budget.utilization}% <small>{tr("uso global")}</small></strong>
											</header>
											<div className="pm-budget-strip">
												<span><small>{tr("Aprobado")}</small><b>{money(budgetInitiative.plannedBudget, budgetInitiative.currency)}</b></span>
												<span><small>{tr("Proyección")}</small><b>{money(budgetInitiative.forecastBudget, budgetInitiative.currency)}</b></span>
												<span className={budgetInitiative.availableBudget < 0 ? 'danger' : ''}><small>{tr("Disponible")}</small><b>{money(budgetInitiative.availableBudget, budgetInitiative.currency)}</b></span>
											</div>
											<section className="pm-budget-table" aria-label={tr("Partidas presupuestarias")}>
												<div className="pm-budget-table-head"><span>{tr("Fecha y categoría")}</span><span>{tr("Detalle")}</span><span>{tr("Estado")}</span><span>{tr("Monto")}</span><span>{tr("Acciones")}</span></div>
												{visibleBudgetEntries.map((entry) => (
													<article key={entry.id}>
														<span><strong>{dateText(entry.occurredOn)}</strong><small>{entry.category} · {entry.entryType}</small></span>
														<span><strong>{entry.description}</strong><small>{entry.vendor || tr("Sin proveedor")}{entry.reference ? ` · ${entry.reference}` : ''}</small></span>
														<Badge status={entry.status} />
														<b>{money(entry.amount, budgetInitiative.currency)}</b>
														<div>
															{data.access.canManage && entry.status !== 'PAID' && entry.status !== 'VOID' && entry.entryType !== 'COMMITMENT' && (
																<button type="button" className="button tiny" onClick={() => void patch(`/personal-ministries/budget-entries/${entry.id}`, { status: 'PAID' }, 'Partida marcada como pagada.')}>{tr("Pagar")}</button>
															)}
															{data.access.canManage && entry.status !== 'APPROVED' && entry.status !== 'PAID' && entry.status !== 'VOID' && (
																<button type="button" className="button tiny" onClick={() => void patch(`/personal-ministries/budget-entries/${entry.id}`, { status: 'APPROVED' }, 'Partida aprobada.')}>{tr("Aprobar")}</button>
															)}
															{data.access.canManage && entry.status !== 'VOID' && (
																<button type="button" className="button tiny danger" onClick={() => void patch(`/personal-ministries/budget-entries/${entry.id}`, { status: 'VOID' }, 'Partida anulada con trazabilidad.')}>{tr("Anular")}</button>
															)}
														</div>
													</article>
												))}
												{!visibleBudgetEntries.length && <Empty title={tr("Sin movimientos presupuestarios")} text={tr("Registra el primer compromiso, gasto o ingreso de esta actividad.")} />}
											</section>
										</>
									) : (
										<Empty title={tr("Crea una iniciativa")} text={tr("Cada presupuesto se enlaza a una actividad misionera para conservar contexto y trazabilidad.")} />
									)}
								</div>
							</div>
						</section>
					)}

					{tab === 'people' && (
						<section className="pm-section">
							<header>
								<div>
									<span className="eyebrow">{tr("Acompañamiento individual")}</span>
									<h2>{tr("Interesados y estudios bíblicos")}</h2>
									<p>{tr("Un historial continuo desde el primer contacto hasta el bautismo.")}</p>
								</div>
								{data.access.canManageRecords && (
									<div>
										<button
											type="button"
											className="button secondary"
											onClick={() => setModal('study')}
										>
											<BookOpen />{tr("Registrar estudio")}</button>
										<button
											type="button"
											className="button primary"
											onClick={() => setModal('contact')}
										>
											<Plus />{tr("Nuevo interesado")}</button>
									</div>
								)}
							</header>
							<label className="pm-search">
								<Search />
								<input
									aria-label={tr("Buscar interesados")}
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder={tr("Buscar por nombre, etapa, fuente o responsable…")}
								/>
								<span>{filteredContacts.length}{tr(" persona(s)")}</span>
							</label>
							<div className="pm-people-layout">
								<div className="pm-contact-list">
									{filteredContacts.map((contact) => (
										<article key={contact.id}>
											<span className="pm-avatar">
												{contact.name
													.split(' ')
													.map((part) => part[0])
													.slice(0, 2)
													.join('')}
											</span>
											<div>
												<strong>{contact.name}</strong>
												<small>
													{contact.assignedToName
														? [tr("Acompaña "), contact.assignedToName].join('')
														: tr("Sin responsable asignado")}{' '}
													· {contact.studyCount}{tr(" estudio(s)")}</small>
												<span>
													{contact.nextFollowUpAt
														? [tr("Próximo contacto: "), dateTimeText(contact.nextFollowUpAt)].join('')
														: tr("Seguimiento por programar")}
												</span>
											</div>
											<Badge status={contact.stage} />
											{data.access.canManageRecords && (
												<select
													aria-label={[tr("Etapa de "), contact.name].join('')}
													value={contact.stage}
													onChange={(event) =>
														void patch(
															`/personal-ministries/contacts/${contact.id}`,
															{ stage: event.target.value },
															'Etapa actualizada.',
														)
													}
												>
													<option value="INTERESTED">{tr("Interesado")}</option>
													<option value="BIBLE_STUDY">{tr("Estudio bíblico")}</option>
													<option value="BAPTISM_CANDIDATE">{tr("Candidato a bautismo")}</option>
													<option value="BAPTIZED">{tr("Bautizado")}</option>
													<option value="INACTIVE">{tr("En pausa")}</option>
												</select>
											)}
										</article>
									))}
								</div>
								<aside className="pm-study-feed">
									<h3>{tr("Bitácora de estudios")}</h3>
									{data.studies.slice(0, 12).map((study) => (
										<article key={study.id}>
											<BookOpen />
											<div>
												<strong>{study.contactName}</strong>
												<span>{study.lesson}</span>
												<small>
													{study.instructorName} ·{' '}
													{dateTimeText(study.studiedAt)}
												</small>
											</div>
											<Badge status={study.status} />
											{data.access.canManageRecords &&
												study.status === 'SCHEDULED' && (
													<button
														type="button"
														className="button tiny"
														onClick={() =>
															void patch(
																`/personal-ministries/bible-studies/${study.id}`,
																{ status: 'COMPLETED' },
																'Estudio marcado como completado.',
															)
														}
													>{tr("Completar")}</button>
												)}
										</article>
									))}
								</aside>
							</div>
						</section>
					)}

					{tab === 'groups' && (
						<section className="pm-section">
							<header>
								<div>
									<span className="eyebrow">{tr("Discipulado en comunidad")}</span>
									<h2>{tr("Red de grupos pequeños")}</h2>
									<p>{tr("Liderazgo, horario, ubicación, miembros y metas visibles.")}</p>
								</div>
								{data.access.canManage && (
									<button
										type="button"
										className="button primary"
										onClick={() => setModal('group')}
									>
										<Plus />{tr("Nuevo grupo")}</button>
								)}
							</header>
							<div className="pm-card-grid">
								{data.groups.map((group) => (
									<article className="pm-group-card" key={group.id}>
										<div>
											<span>
												<Church />
											</span>
											<Badge status={group.status} />
										</div>
										<h3>{group.name}</h3>
										<p>
											<Users /> {group.leaderName}
											{group.assistantName ? [tr(" y "), group.assistantName].join('') : ''}
										</p>
										<p>
											<CalendarDays /> {days[group.meetingDay]} ·{' '}
											{group.meetingTime}
										</p>
										<p>
											<MapPin /> {group.location || tr("Ubicación por definir")}
										</p>
										<footer>
											<div>
												<i
													style={{
														width: `${group.goal ? Math.min(100, (group.currentMembers / group.goal) * 100) : 0}%`,
													}}
												/>
											</div>
											<span>
												<strong>{group.currentMembers}</strong>{tr(" de ")}{group.goal}{' '}{tr("personas")}</span>
										</footer>
									</article>
								))}
								{!data.groups.length && (
									<Empty
										title={tr("Sin grupos pequeños registrados")}
										text={tr("Crea la primera célula de discipulado y asigna su liderazgo.")}
									/>
								)}
							</div>
						</section>
					)}

					{tab === 'minutes' && (
						<section className="pm-section">
							<header>
								<div>
									<span className="eyebrow">{tr("Inspiración semanal")}</span>
									<h2>{tr("Calendario de minutos misioneros")}</h2>
									<p>{tr("Programa tema, material y presentador; el sistema notifica la asignación.")}</p>
								</div>
								{data.access.canManage && (
									<button
										type="button"
										className="button primary"
										onClick={() => setModal('minute')}
									>
										<Plus />{tr("Calendarizar minuto")}</button>
								)}
							</header>
							<div className="pm-calendar-list">
								{data.missionaryMinutes.map((item) => (
									<article key={item.id}>
										<time>
											<strong>{new Date(item.scheduledAt).getDate()}</strong>
											<span>
												{new Intl.DateTimeFormat(localeTag(currentLocale()), { month: 'short' })
													.format(new Date(item.scheduledAt))
													.toUpperCase()}
											</span>
										</time>
										<div>
											<h3>{item.title}</h3>
											<p>{item.theme || tr("Tema pendiente")}</p>
											<span>
												{dateTimeText(item.scheduledAt)}{tr(" · Presenta")}{' '}
												{item.presenterName}
											</span>
										</div>
										<Badge status={item.status} />
										{data.access.canManage && item.status === 'SCHEDULED' && (
											<button
												type="button"
												className="button secondary"
												onClick={() =>
													void patch(
														`/personal-ministries/missionary-minutes/${item.id}`,
														{ status: 'COMPLETED' },
														'Minuto completado.',
													)
												}
											>
												<CheckCircle2 />{tr("Completar")}</button>
										)}
									</article>
								))}
							</div>
						</section>
					)}

					{tab === 'campaigns' && (
						<section className="pm-section">
							<header>
								<div>
									<span className="eyebrow">{tr("Evangelismo público")}</span>
									<h2>{tr("Campañas y decisiones")}</h2>
									<p>{tr("Planifica el período y registra resultados que alimentan el tablero.")}</p>
								</div>
								{data.access.canManage && (
									<button
										type="button"
										className="button primary"
										onClick={() => setModal('campaign')}
									>
										<Plus />{tr("Nueva campaña")}</button>
								)}
							</header>
							<div className="pm-campaign-grid">
								{data.campaigns.map((campaign) => (
									<article key={campaign.id}>
										<div className="pm-campaign-top">
											<span>
												<Flag />
											</span>
											<Badge status={campaign.status} />
										</div>
										<h3>{campaign.title}</h3>
										<p>{campaign.theme || tr("Tema por definir")}</p>
										<dl>
											<div>
												<dt>{tr("Período")}</dt>
												<dd>
													{dateText(campaign.startsOn)} —{' '}
													{dateText(campaign.endsOn)}
												</dd>
											</div>
											<div>
												<dt>{tr("Lugar")}</dt>
												<dd>{campaign.venue || tr("Por definir")}</dd>
											</div>
											<div>
												<dt>{tr("Evangelista")}</dt>
												<dd>{campaign.evangelist || tr("Por definir")}</dd>
											</div>
										</dl>
										<footer>
											<span>
												<strong>{campaign.decisionCount}</strong>{tr(" decisiones")}</span>
											<span>
												<strong>{campaign.baptismCount}</strong>{tr(" bautismos")}</span>
											<span>
												<strong>{campaign.goal}</strong>{tr(" meta")}</span>
										</footer>
										{data.access.canManage && (
											<button
												type="button"
												className="button secondary"
												onClick={() =>
													void patch(
														`/personal-ministries/campaigns/${campaign.id}`,
														{
															decisionCount: campaign.decisionCount + 1,
															status: 'ACTIVE',
														},
														'Resultado de campaña actualizado.',
													)
												}
											>{tr("+ Registrar decisión")}</button>
										)}
									</article>
								))}
								{!data.campaigns.length && (
									<Empty
										title={tr("Planifica el próximo ciclo evangelístico")}
										text={tr("Registra campaña, meta, lugar, evangelista y período.")}
									/>
								)}
							</div>
						</section>
					)}

					{tab === 'team' && (
						<section className="pm-section">
							<header>
								<div>
									<span className="eyebrow">{tr("Gobierno departamental")}</span>
									<h2>{tr("Equipo y distribución del trabajo")}</h2>
									<p>{tr("Los permisos provienen de los roles reales del departamento.")}</p>
								</div>
								<span className="pm-live">
									<i />{tr(" Permisos en vivo")}</span>
							</header>
							<div className="pm-team-grid">
								{workload.map((member, index) => (
									<article key={member.id}>
										<div className="pm-team-profile">
											<span>
												{member.name
													.split(' ')
													.map((part) => part[0])
													.slice(0, 2)
													.join('')}
											</span>
											<div>
												<h3>{member.name}</h3>
												<p>
													{member.appointments?.join(' · ') ||
														roleLabels[member.role] ||
														member.role}
												</p>
												<small>{member.email}</small>
											</div>
											{index === 0 && <em>{tr("Dirección")}</em>}
										</div>
										<div className="pm-capacity">
											<span>
												<strong>{member.total}%</strong>{tr(" carga asignada")}</span>
											<i>
												<b
													style={{ width: `${Math.min(100, member.total)}%` }}
												/>
											</i>
										</div>
										<footer>
											<span>{roleLabels[member.role] ?? member.role}</span>
											<span>
												{member.role === 'DIRECTOR'
													? tr("Control total")
													: member.role === 'VIEWER'
														? tr("Solo lectura")
														: tr("Operación y seguimiento")}
											</span>
										</footer>
									</article>
								))}
							</div>
						</section>
					)}
				</div></div>
			)}
			{modal && data && (
				<Modal busy={saving} label={tr("Formulario de Ministerios Personales")} onClose={() => setModal(null)}>
					<form
						className="modal-card premium-modal pm-modal"
						             
						                 
						aria-label={tr("Formulario de Ministerios Personales")}
						onSubmit={submit}
					>
						<button data-dialog-close
							type="button"
							className="modal-close"
							onClick={() => setModal(null)}
							aria-label={tr("Cerrar")}
						>
							<X />
						</button>
						<span className="modal-symbol">
							<Send />
						</span>
						<h2>
							{modal === 'plan'
								? tr("Nuevo plan estratégico")
								: modal === 'initiative'
									? tr("Nueva iniciativa misionera")
									: modal === 'contact'
										? tr("Registrar interesado")
										: modal === 'study'
											? tr("Registrar estudio bíblico")
											: modal === 'group'
												? tr("Crear grupo pequeño")
												: modal === 'minute'
							? tr("Calendarizar minuto misionero")
							: modal === 'campaign'
								? tr("Planificar campaña evangelística")
								: modal === 'budgetPlan'
									? tr("Ajustar presupuesto aprobado")
									: tr("Registrar partida presupuestaria")}
						</h2>
						<p>{tr("La información quedará aislada en la iglesia, enlazada al equipo y registrada en auditoría.")}</p>
						{error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
						{modal === 'plan' && (
							<>
								<label>{tr("Título")}<input
										name="title"
										required
										placeholder={tr("Plan misionero 2027")}
									/>
								</label>
								<div className="form-grid">
									<label>{tr("Inicio")}<input name="periodStart" type="date" required />
									</label>
									<label>{tr("Final")}<input name="periodEnd" type="date" required />
									</label>
								</div>
								<label>{tr("Visión")}<textarea
										name="vision"
										rows={3}
										placeholder={tr("Describe el resultado espiritual esperado…")}
									/>
								</label>
								<label>{tr("Objetivos, uno por línea")}<textarea name="objectives" rows={4} />
								</label>
								<label>{tr("Responsable")}<select name="ownerId">
										<option value="">{tr("Dirección departamental")}</option>
										{data.team.map((item) => (
											<option key={item.id} value={item.id}>
												{item.name}
											</option>
										))}
									</select>
								</label>
							</>
						)}
						{modal === 'initiative' && (
							<>
								<label>{tr("Nombre de la iniciativa")}<input name="title" required />
								</label>
								<label>{tr("Descripción")}<textarea name="description" rows={3} />
								</label>
								<div className="form-grid">
									<label>{tr("Alcance")}<select name="scope">
											<option value="LOCAL">{tr("Iglesia local")}</option>
											<option value="CONFERENCE">{tr("Asociación Dominicana del Sureste")}</option>
											<option value="UNION">{tr("Unión Dominicana")}</option>
											<option value="GLOBAL">{tr("Iglesia mundial")}</option>
										</select>
									</label>
									<label>{tr("Tipo")}<select name="initiativeType">
											<option value="MISSIONARY">{tr("Misionera")}</option>
											<option value="EVANGELISM">{tr("Evangelismo")}</option>
											<option value="TRAINING">{tr("Capacitación")}</option>
											<option value="OUTREACH">{tr("Impacto comunitario")}</option>
											<option value="CHURCH">{tr("Programa de iglesia")}</option>
										</select>
									</label>
									<label>{tr("Inicio")}<input name="startsOn" type="date" required />
									</label>
									<label>{tr("Final")}<input name="endsOn" type="date" required />
									</label>
									<label>{tr("Prioridad")}<select name="priority">
											<option value="MEDIUM">{tr("Media")}</option>
											<option value="HIGH">{tr("Alta")}</option>
											<option value="CRITICAL">{tr("Crítica")}</option>
											<option value="LOW">{tr("Baja")}</option>
										</select>
									</label>
									<label>{tr("Meta numérica")}<input
											name="targetCount"
											type="number"
											min="0"
											defaultValue="0"
										/>
									</label>
									<label>{tr("Plan")}<select name="strategicPlanId">
											<option value="">{tr("Sin plan asociado")}</option>
											{data.plans.map((item) => (
												<option key={item.id} value={item.id}>
													{item.title}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Responsable")}<select name="assigneeId">
											<option value="">{tr("Asignar después")}</option>
											{data.team.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									<label className="full">{tr("Responsabilidad")}<input
											name="responsibility"
											placeholder={tr("Resultado concreto esperado")}
										/>
									</label>
									<label>{tr("Carga estimada %")}<input
											name="workloadPercent"
											type="number"
											min="0"
											max="100"
											defaultValue="20"
										/>
									</label>
									<label>{tr("Presupuesto aprobado")}<input name="plannedBudget" type="number" min="0" step="0.01" defaultValue="0" />
									</label>
									<label>{tr("Moneda")}<select name="currency" defaultValue="DOP">
											<option value="DOP">{tr("DOP · Peso dominicano")}</option>
											<option value="USD">{tr("USD · Dólar estadounidense")}</option>
											<option value="EUR">{tr("EUR · Euro")}</option>
										</select>
									</label>
								</div>
							</>
						)}
						{modal === 'contact' && (
							<>
								<label>{tr("Nombre completo")}<input name="name" required />
								</label>
								<div className="form-grid">
									<label>{tr("Teléfono")}<input name="phone" />
									</label>
									<label>{tr("Correo")}<input name="email" type="email" />
									</label>
									<label>{tr("Etapa")}<select name="stage">
											<option value="INTERESTED">{tr("Interesado")}</option>
											<option value="BIBLE_STUDY">{tr("Estudio bíblico")}</option>
											<option value="BAPTISM_CANDIDATE">{tr("Candidato a bautismo")}</option>
											<option value="BAPTIZED">{tr("Bautizado")}</option>
										</select>
									</label>
									<label>{tr("Fuente")}<input
											name="source"
											placeholder={tr("Visitante, campaña, amigo…")}
										/>
									</label>
									<label>{tr("Responsable")}<select name="assignedTo">
											<option value="">{tr("Sin asignar")}</option>
											{data.team.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Próximo seguimiento")}<input name="nextFollowUpAt" type="datetime-local" />
									</label>
								</div>
								<label>{tr("Notas")}<textarea name="notes" rows={3} />
								</label>
								<label className="pm-consent">
									<input name="consent" type="checkbox" />{tr(" La persona autorizó el registro de sus datos de contacto.")}</label>
							</>
						)}
						{modal === 'study' && (
							<>
								<div className="form-grid">
									<label>{tr("Interesado")}<select name="contactId" required>
											<option value="">{tr("Seleccionar…")}</option>
											{data.contacts
												.filter((item) => item.stage !== 'INACTIVE')
												.map((item) => (
													<option key={item.id} value={item.id}>
														{item.name}
													</option>
												))}
										</select>
									</label>
									<label>{tr("Instructor")}<select name="instructorId" required>
											<option value="">{tr("Seleccionar…")}</option>
											{data.team.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Fecha y hora")}<input name="studiedAt" type="datetime-local" required />
									</label>
									<label>{tr("Estado")}<select name="status">
											<option value="COMPLETED">{tr("Completado")}</option>
											<option value="SCHEDULED">{tr("Programado")}</option>
											<option value="MISSED">{tr("No realizado")}</option>
										</select>
									</label>
									<label className="full">{tr("Lección o tema")}<input name="lesson" required />
									</label>
									<label className="full">{tr("Resultado")}<textarea name="outcome" rows={2} />
									</label>
									<label>{tr("Próximo estudio")}<input name="nextStudyAt" type="datetime-local" />
									</label>
								</div>
								<label>{tr("Notas")}<textarea name="notes" rows={2} />
								</label>
							</>
						)}
						{modal === 'group' && (
							<>
								<label>{tr("Nombre del grupo")}<input name="name" required />
								</label>
								<div className="form-grid">
									<label>{tr("Líder")}<select name="leaderId" required>
											<option value="">{tr("Seleccionar…")}</option>
											{data.team.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Asistente")}<select name="assistantId">
											<option value="">{tr("Sin asistente")}</option>
											{data.team.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Día")}<select name="meetingDay">
											{days.map((day, index) => (
												<option key={day} value={index}>
													{day}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Hora")}<input name="meetingTime" type="time" required />
									</label>
									<label className="full">{tr("Lugar")}<input name="location" />
									</label>
									<label>{tr("Meta de personas")}<input
											name="goal"
											type="number"
											min="0"
											defaultValue="12"
										/>
									</label>
									<label>{tr("Miembros actuales")}<input
											name="currentMembers"
											type="number"
											min="0"
											defaultValue="0"
										/>
									</label>
								</div>
							</>
						)}
						{modal === 'minute' && (
							<>
								<label>{tr("Título")}<input
										name="title"
										required
										placeholder={tr("Testimonio misionero")}
									/>
								</label>
								<div className="form-grid">
									<label>{tr("Inicio")}<input name="scheduledAt" type="datetime-local" required />
									</label>
									<label>{tr("Final")}<input name="endsAt" type="datetime-local" required />
									</label>
									<label>{tr("Presentador")}<select name="presenterId" required>
											<option value="">{tr("Seleccionar…")}</option>
											{data.team.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Tema")}<input name="theme" />
									</label>
									<label className="full">{tr("Material o enlace")}<input name="material" />
									</label>
								</div>
							</>
						)}
						{modal === 'campaign' && (
							<>
								<label>{tr("Nombre de la campaña")}<input name="title" required />
								</label>
								<div className="form-grid">
									<label>{tr("Tema")}<input name="theme" />
									</label>
									<label>{tr("Iniciativa")}<select name="initiativeId">
											<option value="">{tr("Sin iniciativa asociada")}</option>
											{data.initiatives.map((item) => (
												<option key={item.id} value={item.id}>
													{item.title}
												</option>
											))}
										</select>
									</label>
									<label>{tr("Inicio")}<input name="startsOn" type="date" required />
									</label>
									<label>{tr("Final")}<input name="endsOn" type="date" required />
									</label>
									<label>{tr("Lugar")}<input name="venue" />
									</label>
									<label>{tr("Evangelista")}<input name="evangelist" />
									</label>
									<label>{tr("Meta de decisiones")}<input name="goal" type="number" min="0" defaultValue="0" />
									</label>
								</div>
							</>
						)}
						{modal === 'budgetPlan' && budgetInitiative && (
							<>
								<div className="pm-budget-modal-context">
									<WalletCards />
									<div><strong>{budgetInitiative.title}</strong><span>{tr("Define el techo autorizado para controlar su ejecución.")}</span></div>
								</div>
								<div className="form-grid">
									<label>{tr("Presupuesto aprobado")}<input name="plannedBudget" type="number" min="0" step="0.01" required defaultValue={budgetInitiative.plannedBudget} />
									</label>
									<label>{tr("Moneda")}<select name="currency" defaultValue={budgetInitiative.currency}>
											<option value="DOP">{tr("DOP · Peso dominicano")}</option>
											<option value="USD">{tr("USD · Dólar estadounidense")}</option>
											<option value="EUR">{tr("EUR · Euro")}</option>
										</select>
									</label>
								</div>
							</>
						)}
						{modal === 'budgetEntry' && budgetInitiative && (
							<>
								<div className="pm-budget-modal-context">
									<ReceiptText />
									<div><strong>{budgetInitiative.title}</strong><span>{tr("Disponible: ")}{money(budgetInitiative.availableBudget, budgetInitiative.currency)}</span></div>
								</div>
								<div className="form-grid">
									<label>{tr("Tipo de movimiento")}<select name="entryType" defaultValue="EXPENSE">
											<option value="COMMITMENT">{tr("Compromiso")}</option>
											<option value="EXPENSE">{tr("Gasto")}</option>
											<option value="INCOME">{tr("Ingreso")}</option>
										</select>
									</label>
									<label>{tr("Estado")}<select name="status" defaultValue="PLANNED">
											<option value="PLANNED">{tr("Planificado")}</option>
											<option value="APPROVED">{tr("Aprobado")}</option>
											<option value="PAID">{tr("Pagado")}</option>
										</select>
									</label>
									<label>{tr("Categoría")}<input name="category" required placeholder={tr("Alimentación, transporte, materiales…")} />
									</label>
									<label>{tr("Monto")}<input name="amount" type="number" min="0.01" step="0.01" required />
									</label>
									<label>{tr("Fecha")}<input name="occurredOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
									</label>
									<label>{tr("Proveedor o beneficiario")}<input name="vendor" />
									</label>
									<label className="full">{tr("Descripción")}<input name="description" required placeholder={tr("Propósito específico del movimiento")} />
									</label>
									<label>{tr("Referencia o comprobante")}<input name="reference" />
									</label>
									<label className="full">{tr("Notas de control")}<textarea name="notes" rows={3} />
									</label>
								</div>
							</>
						)}
						<div className="modal-actions">
							<button data-dialog-close
								type="button"
								className="button secondary"
								onClick={() => setModal(null)}
							>{tr("Cancelar")}</button>
							<button
								type="submit"
								className="button primary"
								disabled={saving}
							>
								{saving ? tr("Guardando…") : tr("Guardar y enlazar")}
							</button>
						</div>
					</form>
				</Modal>
			)}
		</Shell>
	);
}
