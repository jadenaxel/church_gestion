'use client';

import {
	ArrowLeft,
	ArrowRight,
	BadgeDollarSign,
	BarChart3,
	BookOpenCheck,
	BriefcaseBusiness,
	CalendarDays,
	Check,
	CheckCircle2,
	ChevronRight,
	CircleAlert,
	ClipboardList,
	Clock3,
	FileCheck2,
	Files,
	Gauge,
	HandCoins,
	HeartHandshake,
	Landmark,
	MessageSquareText,
	Plus,
	Search,
	Send,
	ShieldCheck,
	Sparkles,
	Target,
	TrendingUp,
	UserRoundCheck,
	UsersRound,
	WalletCards,
	X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
	Suspense,
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Shell } from '@/components/shell';
import { Modal } from '@/components/modal';
import { SectionTabs } from '@/components/section-tabs';
import { useExperience } from '@/components/experience-provider';
import { Empty, Notice, Spinner } from '@/components/ui';
import { API_URL, api, dateTimeLocal, formatDate } from '@/lib/api';
import { currentLocale, localeTag } from '@/lib/i18n';

type Workspace = {
	id: string;
	departmentId: string;
	name: string;
	color: string;
	ministryKey: string;
	role: string | null;
};
type TeamMember = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	role: string;
	appointments: string[];
};
type Objective = {
	id: string;
	title: string;
	description: string;
	targetValue: number;
	currentValue: number;
	unit: string;
	dueOn: string | null;
	status: string;
	ownerName: string | null;
};
type Plan = {
	id: string;
	title: string;
	year: number;
	vision: string;
	mission: string;
	status: string;
	progress: number;
	ownerName: string | null;
	approvedAt: string | null;
	approvedByName: string | null;
	objectives: Objective[];
};
type Assignment = {
	userId: string;
	name: string;
	responsibility: string;
	status: string;
};
type Initiative = {
	id: string;
	planId: string | null;
	calendarActivityId: string | null;
	initiativeType: string;
	title: string;
	description: string;
	objective: string;
	startsOn: string;
	endsOn: string;
	priority: string;
	status: string;
	progress: number;
	plannedBudget: number;
	committedBudget: number;
	spentBudget: number;
	incomeBudget: number;
	currency: string;
	outcome: string;
	ownerName: string | null;
	calendarCode: string | null;
	calendarStatus: string | null;
	assignments: Assignment[];
};
type Task = {
	id: string;
	initiativeId: string | null;
	initiativeTitle: string | null;
	title: string;
	description: string;
	assignedTo: string | null;
	assignedName: string | null;
	dueAt: string | null;
	priority: string;
	status: string;
};
type Meeting = {
	id: string;
	title: string;
	scheduledAt: string;
	endsAt: string;
	location: string;
	agenda: string;
	minutes: string;
	participantIds: string[];
	participantCount: number;
	status: string;
};
type Decision = {
	id: string;
	title: string;
	decisionText: string;
	authorityType: string;
	decidedOn: string;
	effectiveOn: string | null;
	evidenceReference: string;
	approvedByName: string;
};
type Kpi = {
	id: string;
	name: string;
	description: string;
	targetValue: number;
	currentValue: number;
	unit: string;
	periodStart: string;
	periodEnd: string;
	status: string;
};
type MinistryRecord = {
	id: string;
	recordType: string;
	title: string;
	recordDate: string;
	visibility: string;
	status: string;
	data: Record<string, unknown>;
	ownerName: string | null;
};
type WorkspaceComment = {
	id: string;
	resourceType: string;
	resourceId: string;
	body: string;
	mentionUserIds: string[];
	createdByName: string;
	createdAt: string;
};
type RecordDefinition = {
	type: string;
	label: string;
	description: string;
	privacy?: string;
};
type Context = {
	workspaces: Workspace[];
	selected: Workspace & {
		pack: {
			key: string;
			title: string;
			purpose: string;
			accent: string;
			recordTypes: RecordDefinition[];
			guidance: string[];
		};
	};
	access: {
		canRead: boolean;
		canManage: boolean;
		canFinance: boolean;
		canApprove: boolean;
		role: string | null;
	};
	team: TeamMember[];
	plans: Plan[];
	initiatives: Initiative[];
	tasks: Task[];
	meetings: Meeting[];
	decisions: Decision[];
	comments: WorkspaceComment[];
	kpis: Kpi[];
	records: MinistryRecord[];
	calendarActivities: Array<{
		id: string;
		code: string;
		title: string;
		status: string;
		startsAt: string | null;
		endsAt: string | null;
	}>;
	documents: { total: number; verified: number };
	metrics: {
		activePlans: number;
		activeInitiatives: number;
		atRisk: number;
		openTasks: number;
		overdueTasks: number;
		plannedBudget: number;
		spentBudget: number;
		availableBudget: number;
		budgetsByCurrency?: Array<{ currency: string; plannedBudget: number; spentBudget: number; availableBudget: number }>;
		budgetAggregationComparable?: boolean;
		unallocatedBudgetEntries?: number;
		meetingsThisMonth: number;
	};
	forecast: {
		sampleSize: number;
		onTimeRate: number;
		riskLevel: string;
		message: string;
	};
};
type Tab =
	| 'overview'
	| 'strategy'
	| 'initiatives'
	| 'tasks'
	| 'finance'
	| 'meetings'
	| 'records'
	| 'team';

function specializedApplication(workspace: Workspace): {
	href: string;
	label: string;
	Icon: LucideIcon;
} | null {
	if (workspace.ministryKey === 'ELDERS_OPERATIONS')
		return { href: '/elders', label: 'Aplicación especializada', Icon: BookOpenCheck };
	if (workspace.ministryKey === 'PERSONAL_MINISTRIES')
		return { href: '/personal-ministries', label: 'Aplicación especializada', Icon: Send };
	if (workspace.ministryKey === 'WOMENS_MINISTRY')
		return { href: '/womens-ministry', label: 'Aplicación especializada', Icon: HeartHandshake };
	return null;
}
type ModalKind =
	| ''
	| 'plan'
	| 'objective'
	| 'initiative'
	| 'assignment'
	| 'task'
	| 'budget'
	| 'meeting'
	| 'minutes'
	| 'decision'
	| 'comment'
	| 'kpi'
	| 'record';

const statusLabels: Record<string, string> = {
	DRAFT: 'Borrador',
	ACTIVE: 'Activo',
	ARCHIVED: 'Archivado',
	PLANNED: 'Planificado',
	IN_PROGRESS: 'En progreso',
	AT_RISK: 'En riesgo',
	COMPLETED: 'Completado',
	CANCELLED: 'Cancelado',
	TODO: 'Por iniciar',
	BLOCKED: 'Bloqueado',
	SCHEDULED: 'Programada',
	CLOSED: 'Cerrada',
	SUBMITTED: 'Sometido',
	APPROVED: 'Aprobado',
	PAID: 'Pagado',
	REJECTED: 'Rechazado',
	VOID: 'Anulado',
};
const authorityLabels: Record<string, string> = {
	DEPARTMENT: 'Dirección departamental',
	CHURCH_BOARD: 'Junta de iglesia',
	BUSINESS_MEETING: 'Reunión administrativa',
	PASTORAL: 'Autoridad pastoral',
	CONFERENCE: 'Asociación / Misión',
};
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number, currency = 'DOP') =>
	new Intl.NumberFormat(localeTag(currentLocale()), {
		style: 'currency',
		currency,
		maximumFractionDigits: 0,
	}).format(Number(value || 0));

export default function MinistryHubPage() {
  const { tr } = useExperience();

	return <Suspense fallback={<Shell title={tr("Espacios de trabajo")}><Spinner /></Shell>}><DepartmentWorkspacePage /></Suspense>;
}

function DepartmentWorkspacePage() {
	const { tr, locale } = useExperience();
	const requestedDepartmentId = useSearchParams().get('departmentId') ?? undefined;
	const loadSequence = useRef(0);
	const [data, setData] = useState<Context | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [tab, setTab] = useState<Tab>('overview');
	const [modal, setModal] = useState<ModalKind>('');
	const [busy, setBusy] = useState(false);
	const [search, setSearch] = useState('');
	const [appSearch, setAppSearch] = useState('');
	const [departmentId, setDepartmentId] = useState('');
	const [selectedId, setSelectedId] = useState('');
	const [planForm, setPlanForm] = useState({
		title: 'Plan operativo anual',
		year: new Date().getFullYear(),
		vision: '',
		mission: '',
		ownerId: '',
	});
	const [objectiveForm, setObjectiveForm] = useState({
		planId: '',
		title: '',
		description: '',
		targetValue: 100,
		unit: '%',
		dueOn: '',
		ownerId: '',
	});
	const [initiativeForm, setInitiativeForm] = useState({
		planId: '',
		calendarActivityId: '',
		initiativeType: 'PROGRAM',
		title: '',
		description: '',
		objective: '',
		startsOn: today(),
		endsOn: today(),
		priority: 'MEDIUM',
		plannedBudget: 0,
		ownerId: '',
	});
	const [assignmentForm, setAssignmentForm] = useState({
		initiativeId: '',
		userId: '',
		responsibility: '',
	});
	const [taskForm, setTaskForm] = useState({
		initiativeId: '',
		title: '',
		description: '',
		assignedTo: '',
		dueAt: '',
		priority: 'MEDIUM',
	});
	const [budgetForm, setBudgetForm] = useState({
		initiativeId: '',
		entryType: 'ALLOCATION',
		category: '',
		description: '',
		amount: 0,
		occurredOn: today(),
		status: 'PLANNED',
		vendor: '',
		reference: '',
	});
	const nextHour = () => {
		const start = new Date(Date.now() + 86_400_000);
		start.setHours(19, 0, 0, 0);
		return dateTimeLocal(start);
	};
	const endHour = () => {
		const end = new Date(Date.now() + 86_400_000);
		end.setHours(20, 0, 0, 0);
		return dateTimeLocal(end);
	};
	const [meetingForm, setMeetingForm] = useState({
		title: 'Reunión de coordinación',
		scheduledAt: nextHour(),
		endsAt: endHour(),
		location: '',
		agenda: '',
		participantIds: [] as string[],
	});
	const [minutesForm, setMinutesForm] = useState({
		meetingId: '',
		minutes: '',
	});
	const [decisionForm, setDecisionForm] = useState({
		meetingId: '',
		initiativeId: '',
		title: '',
		decisionText: '',
		authorityType: 'DEPARTMENT',
		decidedOn: today(),
		effectiveOn: '',
		evidenceReference: '',
	});
	const [commentForm, setCommentForm] = useState({
		resourceType: 'INITIATIVE',
		resourceId: '',
		body: '',
		mentionUserIds: [] as string[],
	});
	const [kpiForm, setKpiForm] = useState({
		name: '',
		description: '',
		targetValue: 100,
		currentValue: 0,
		unit: '%',
		periodStart: `${new Date().getFullYear()}-01-01`,
		periodEnd: `${new Date().getFullYear()}-12-31`,
	});
	const [recordForm, setRecordForm] = useState({
		recordType: '',
		title: '',
		recordDate: today(),
		visibility: 'TEAM',
		ownerId: '',
		notes: '',
		reference: '',
	});

	const load = useCallback(async (id?: string, signal?: AbortSignal) => {
		const sequence = ++loadSequence.current;
		setLoading(true);
		setError('');
		try {
			const query = id ? `?departmentId=${encodeURIComponent(id)}` : '';
			const result = await api<Context>(
				`/department-operations/context${query}`,
				{ signal: signal ?? null },
			);
			if (sequence !== loadSequence.current || signal?.aborted) return;
			setData(result);
			setDepartmentId(result.selected.departmentId);
			setRecordForm((current) => ({
				...current,
				recordType:
					current.recordType || result.selected.pack.recordTypes[0]?.type || '',
			}));
		} catch (reason) {
			if (sequence !== loadSequence.current || signal?.aborted) return;
			setData(null);
			setError(
				reason instanceof Error
					? reason.message
					: 'No fue posible abrir el espacio departamental.',
			);
		} finally {
			if (sequence === loadSequence.current && !signal?.aborted) setLoading(false);
		}
	}, []);
	useEffect(() => {
		const controller = new AbortController();
		setTab('overview');
		setModal('');
		setSelectedId('');
		setSearch('');
		setSuccess('');
		setRecordForm((current) => ({ ...current, recordType: '' }));
		void load(requestedDepartmentId, controller.signal);
		return () => controller.abort();
	}, [load, requestedDepartmentId]);
	async function act(work: () => Promise<void>, message: string) {
		setBusy(true);
		setError('');
		try {
			await work();
			setModal('');
			setSuccess(message);
			await load(departmentId);
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
	const visibleInitiatives = useMemo(
		() =>
			data?.initiatives.filter((item) =>
				`${item.title} ${item.objective} ${item.ownerName ?? ''}`
					.toLocaleLowerCase('es')
					.includes(search.toLocaleLowerCase('es')),
			) ?? [],
		[data, search],
	);
	const visibleTasks = useMemo(
		() =>
			data?.tasks.filter((item) =>
				`${item.title} ${item.assignedName ?? ''}`
					.toLocaleLowerCase('es')
					.includes(search.toLocaleLowerCase('es')),
			) ?? [],
		[data, search],
	);
	const visibleApplications = useMemo(
		() =>
			(data?.workspaces ?? []).filter((item) =>
				`${item.name} ${tr(item.name)}`
					.toLocaleLowerCase('es')
					.includes(appSearch.trim().toLocaleLowerCase('es')),
			),
		[data, appSearch, tr],
	);
	const selectedInitiative =
		data?.initiatives.find((item) => item.id === selectedId) ?? null;
	const open = (next: ModalKind, id = '') => {
		setError('');
		setSuccess('');
		setSelectedId(id);
		if (next === 'assignment')
			setAssignmentForm((current) => ({ ...current, initiativeId: id }));
		if (next === 'comment')
			setCommentForm({
				resourceType: 'INITIATIVE',
				resourceId: id,
				body: '',
				mentionUserIds: [],
			});
		if (next === 'minutes') {
			const meeting = data?.meetings.find((item) => item.id === id);
			setMinutesForm({ meetingId: id, minutes: meeting?.minutes ?? '' });
		}
		setModal(next);
	};
	if (loading || (data && requestedDepartmentId && data.selected.departmentId !== requestedDepartmentId && data.selected.id !== requestedDepartmentId))
		return (
			<Shell title={tr("Espacios de trabajo")} eyebrow={tr("Operaciones ministeriales")}>
				<Spinner />
			</Shell>
		);
	if (!data)
		return (
			<Shell title={tr("Espacios de trabajo")} eyebrow={tr("Operaciones ministeriales")}>
				<Notice tone="danger" title={tr("No se pudo abrir el espacio")}>
					{error || tr("No hay un espacio disponible.")}
				</Notice>
			</Shell>
		);

	async function savePlan(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/plans', {
					method: 'POST',
					body: JSON.stringify({
						...planForm,
						workspaceId: data!.selected.id,
						ownerId: planForm.ownerId || null,
					}),
				}).then(() => undefined),
			'Plan anual creado.',
		);
	}
	async function saveObjective(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/objectives', {
					method: 'POST',
					body: JSON.stringify({
						...objectiveForm,
						dueOn: objectiveForm.dueOn || null,
						ownerId: objectiveForm.ownerId || null,
					}),
				}).then(() => undefined),
			'Objetivo agregado al plan.',
		);
	}
	async function saveInitiative(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/initiatives', {
					method: 'POST',
					body: JSON.stringify({
						...initiativeForm,
						workspaceId: data!.selected.id,
						planId: initiativeForm.planId || null,
						calendarActivityId: initiativeForm.calendarActivityId || null,
						ownerId: initiativeForm.ownerId || null,
					}),
				}).then(() => undefined),
			'Iniciativa creada y conectada.',
		);
	}
	async function saveAssignment(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api(
					`/department-operations/initiatives/${assignmentForm.initiativeId}/assignments`,
					{
						method: 'POST',
						body: JSON.stringify({
							userId: assignmentForm.userId,
							responsibility: assignmentForm.responsibility,
							status: 'ASSIGNED',
						}),
					},
				).then(() => undefined),
			'Responsabilidad asignada y notificada.',
		);
	}
	async function saveTask(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/tasks', {
					method: 'POST',
					body: JSON.stringify({
						...taskForm,
						workspaceId: data!.selected.id,
						initiativeId: taskForm.initiativeId || null,
						assignedTo: taskForm.assignedTo || null,
						dueAt: taskForm.dueAt
							? new Date(taskForm.dueAt).toISOString()
							: null,
					}),
				}).then(() => undefined),
			'Tarea creada y notificada.',
		);
	}
	async function saveBudget(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/budget', {
					method: 'POST',
					body: JSON.stringify({
						...budgetForm,
						workspaceId: data!.selected.id,
						initiativeId: budgetForm.initiativeId || null,
					}),
				}).then(() => undefined),
			'Movimiento presupuestario registrado.',
		);
	}
	async function saveMeeting(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/meetings', {
					method: 'POST',
					body: JSON.stringify({
						...meetingForm,
						workspaceId: data!.selected.id,
						scheduledAt: new Date(meetingForm.scheduledAt).toISOString(),
						endsAt: new Date(meetingForm.endsAt).toISOString(),
					}),
				}).then(() => undefined),
			'Reunión programada; los participantes fueron notificados.',
		);
	}
	async function saveMinutes(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api(`/department-operations/meetings/${minutesForm.meetingId}`, {
					method: 'PATCH',
					body: JSON.stringify({
						status: 'CLOSED',
						minutes: minutesForm.minutes,
					}),
				}).then(() => undefined),
			'Acta guardada y reunión cerrada.',
		);
	}
	async function saveDecision(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/decisions', {
					method: 'POST',
					body: JSON.stringify({
						...decisionForm,
						workspaceId: data!.selected.id,
						meetingId: decisionForm.meetingId || null,
						initiativeId: decisionForm.initiativeId || null,
						effectiveOn: decisionForm.effectiveOn || null,
					}),
				}).then(() => undefined),
			'Acuerdo formal registrado.',
		);
	}
	async function saveKpi(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/kpis', {
					method: 'POST',
					body: JSON.stringify({ ...kpiForm, workspaceId: data!.selected.id }),
				}).then(() => undefined),
			'Indicador creado.',
		);
	}
	async function saveComment(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/comments', {
					method: 'POST',
					body: JSON.stringify({
						...commentForm,
						workspaceId: data!.selected.id,
					}),
				}).then(() => undefined),
			'Comentario publicado y menciones notificadas.',
		);
	}
	async function saveRecord(e: FormEvent) {
		e.preventDefault();
		await act(
			() =>
				api('/department-operations/records', {
					method: 'POST',
					body: JSON.stringify({
						workspaceId: data!.selected.id,
						recordType: recordForm.recordType,
						title: recordForm.title,
						recordDate: recordForm.recordDate,
						visibility: recordForm.visibility,
						ownerId: recordForm.ownerId || null,
						data: { notes: recordForm.notes, reference: recordForm.reference },
					}),
				}).then(() => undefined),
			'Registro ministerial guardado.',
		);
	}
	async function approvePlan(id: string) {
		await act(
			() =>
				api(`/department-operations/plans/${id}/approve`, {
					method: 'POST',
				}).then(() => undefined),
			'Plan aprobado y activado.',
		);
	}
	async function updateInitiative(
		id: string,
		status: string,
		progress: number,
	) {
		await act(
			() =>
				api(`/department-operations/initiatives/${id}`, {
					method: 'PATCH',
					body: JSON.stringify({ status, progress }),
				}).then(() => undefined),
			'Ejecución actualizada.',
		);
	}
	async function updateTask(id: string, status: string) {
		await act(
			() =>
				api(`/department-operations/tasks/${id}`, {
					method: 'PATCH',
					body: JSON.stringify({ status }),
				}).then(() => undefined),
			'Tarea actualizada.',
		);
	}
	async function downloadReport(format: 'pdf' | 'csv') {
		setBusy(true);
		setError('');
		try {
			const response = await fetch(
				`${API_URL}/department-operations/reports/executive.${format}?workspaceId=${encodeURIComponent(data!.selected.id)}&lang=${locale}`,
				{ credentials: 'include' },
			);
			if (!response.ok)
				throw new Error('No fue posible generar el reporte departamental.');
			const disposition = response.headers.get('content-disposition') ?? '';
			const filename =
				disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
				`reporte-departamental.${format}`;
			const url = URL.createObjectURL(await response.blob());
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			URL.revokeObjectURL(url);
			setSuccess(`Reporte ${format.toUpperCase()} generado con trazabilidad.`);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: 'No fue posible generar el reporte departamental.',
			);
		} finally {
			setBusy(false);
		}
	}

	const pack = data.selected.pack;
	const accent = { '--hub-accent': pack.accent } as React.CSSProperties;
	if (!requestedDepartmentId) return (
		<Shell title={tr("Espacios de trabajo")} eyebrow={tr("Centro de operaciones ministeriales")}>
			<section className="panel hub-app-launcher" aria-labelledby="workspace-apps-title">
				<header>
					<div>
						<span className="eyebrow">{tr("PORTAFOLIO MINISTERIAL")}</span>
						<h2 id="workspace-apps-title">{tr("Mis aplicaciones y áreas de trabajo")}</h2>
						<p>{tr("Abre un departamento para trabajar con su equipo, sus planes y su información.")}</p>
					</div>
					<span className="hub-app-count">{data.workspaces.length}{tr(" disponibles")}</span>
				</header>
				<label className="hub-app-search">
					<Search />
					<input value={appSearch} onChange={(event) => setAppSearch(event.target.value)} placeholder={tr("Buscar ministerio o departamento…")} aria-label={tr("Buscar aplicaciones y áreas de trabajo")} />
					{appSearch && <button type="button" onClick={() => setAppSearch('')} aria-label={tr("Limpiar búsqueda")}><X /></button>}
				</label>
				<div className="hub-app-grid">
					{visibleApplications.map((workspace) => {
						const specialized = specializedApplication(workspace);
						const Icon = specialized?.Icon ?? BriefcaseBusiness;
						return <Link key={workspace.id} href={specialized?.href ?? `/ministry-hub?departmentId=${workspace.departmentId}`} className={`hub-app-card ${specialized ? 'specialized' : ''}`}>
							<span className="hub-app-icon" style={{ color: workspace.color }}><Icon /></span>
							<span className="hub-app-copy">
								<small>{specialized?.label ?? tr("Espacio departamental")}</small>
								<strong>{workspace.name}</strong>
								<em>{workspace.role ? departmentRoleLabel(workspace.role) : tr("Administración integral")}</em>
							</span>
							<ChevronRight />
						</Link>;
					})}
					{visibleApplications.length === 0 && <p className="hub-app-empty">{tr("No hay aplicaciones que coincidan con la búsqueda.")}</p>}
				</div>
			</section>
		</Shell>
	);
	const budgetGroups = data.metrics.budgetsByCurrency;
	const budgetValue = (field: 'plannedBudget' | 'spentBudget' | 'availableBudget') => budgetGroups?.length
		? budgetGroups.map((group) => money(group[field], group.currency)).join(' · ')
		: '—';
	const budgetUtilization = data.metrics.budgetAggregationComparable && budgetGroups?.length === 1 && budgetGroups[0]!.plannedBudget > 0
		? `${Math.round(budgetGroups[0]!.spentBudget / budgetGroups[0]!.plannedBudget * 100)}%` : '—';
	const metricCards: {
		label: string;
		value: string | number;
		target: Tab;
		Icon: LucideIcon;
	}[] = [
		{
			label: 'Planes activos',
			value: data.metrics.activePlans,
			target: 'strategy',
			Icon: Target,
		},
		{
			label: 'Iniciativas activas',
			value: data.metrics.activeInitiatives,
			target: 'initiatives',
			Icon: BriefcaseBusiness,
		},
		{
			label: 'Requieren atención',
			value: data.metrics.atRisk,
			target: 'initiatives',
			Icon: CircleAlert,
		},
		{
			label: 'Tareas vencidas',
			value: data.metrics.overdueTasks,
			target: 'tasks',
			Icon: Clock3,
		},
		{
			label: 'Disponible',
			value: budgetValue('availableBudget'),
			target: 'finance',
			Icon: HandCoins,
		},
		{
			label: 'Documentos',
			value: data.documents.total,
			target: 'records',
			Icon: Files,
		},
	];
	return (
		<Shell
			title={data.selected.name}
			eyebrow={tr("Centro de operaciones ministeriales")}
			actions={
				<div className="hub-header-actions desktop-action">
					<button
						type="button"
						className="button button-secondary"
						disabled={busy}
						onClick={() => void downloadReport('csv')}
					>
						<FileCheck2 />{tr(" CSV")}</button>
					<button
						type="button"
						className="button button-secondary"
						disabled={busy}
						onClick={() => void downloadReport('pdf')}
					>
						<BarChart3 />{tr(" PDF")}</button>
					<Link
						className="button button-secondary"
						href={`/calendar?departmentId=${data.selected.departmentId}`}
					>
						<CalendarDays />{tr(" Ver calendario")}</Link>
				</div>
			}
		>
			<div className="ministry-hub" style={accent}>
				{error && (
					<Notice tone="danger" title={tr("No fue posible completar la acción")}>
						{error}
					</Notice>
				)}
				{success && (
					<Notice tone="success" title={tr("Operación completada")}>
						{success}
					</Notice>
				)}
				<Link className="hub-back-link" href="/ministry-hub"><ArrowLeft />{tr(" Todas las áreas de trabajo")}</Link>
				<section className="hub-hero">
					<div>
						<span className="eyebrow">
							<Sparkles />{tr(" ESPACIO DE TRABAJO CONECTADO")}</span>
						<h2>{data.selected.name}</h2>
								<p>{tr(pack.purpose)}</p>
						<div className="hub-governance">
							<ShieldCheck />
							<span>
								<strong>{tr("Gobierno y misión")}</strong>
								<small>{tr("Manual de Iglesia Adventista, 21.ª edición revisada en 2025 · las decisiones permanecen bajo la autoridad correspondiente.")}</small>
							</span>
						</div>
					</div>
					<aside>
						<section className="hub-active-department"><small>{tr("Departamento activo")}</small><h3>{data.selected.name}</h3><span>{data.access.role ? departmentRoleLabel(data.access.role) : tr("Administración integral")}</span></section>
						<div>
							<strong>{data.team.length}</strong>
							<span>{tr("integrantes conectados")}</span>
						</div>
						<div className="hub-mobile-reports">
							<button type="button" disabled={busy} onClick={() => void downloadReport('csv')}>
								<FileCheck2 />{tr(" CSV")}</button>
							<button type="button" disabled={busy} onClick={() => void downloadReport('pdf')}>
								<BarChart3 />{tr(" PDF")}</button>
						</div>
					</aside>
				</section>
				<SectionTabs className="hub-tabs" prefix="hub" label={tr("Secciones del espacio departamental")} value={tab} onChange={setTab} tabs={[
							['overview', 'Control', Gauge],
							['strategy', 'Estrategia', Target],
							['initiatives', 'Programas', BriefcaseBusiness],
							['tasks', 'Tareas', ClipboardList],
							['finance', 'Presupuesto', WalletCards],
							['meetings', 'Reuniones', UsersRound],
							['records', 'Operación', BookOpenCheck],
							['team', 'Equipo', UserRoundCheck],
					] as const} />
				{/* biome-ignore lint/a11y/noNoninteractiveTabindex: The tab panel receives focus after the selected tab, as required by the tabs keyboard pattern. */}
				<div className="hub-tab-panel" id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`} tabIndex={0}>
				{tab === 'overview' && (
					<>
						<section className="hub-metrics">
							{metricCards.map(({ label, value, target, Icon }) => (
								<button
									type="button"
									key={label}
									onClick={() => setTab(target)}
								>
									<Icon />
									<span>
										<small>{label}</small>
										<strong>{value}</strong>
									</span>
									<ChevronRight />
								</button>
							))}
						</section>
						<div className="hub-control-grid">
							<section className="panel hub-focus">
								<header>
									<div>
										<span className="eyebrow">{tr("EJECUCIÓN PRIORITARIA")}</span>
										<h2>{tr("Lo que necesita atención")}</h2>
									</div>
									<button
										type="button"
										className="icon-button"
										onClick={() => setTab('initiatives')}
										aria-label={tr("Ver iniciativas")}
									>
										<ArrowRight />
									</button>
								</header>
								<div className="hub-focus-list premium-scroll-list">
									{data.initiatives
										.filter(
											(item) => item.status === 'AT_RISK' || item.progress < 40,
										)
										.slice(0, 8)
										.map((item) => (
											<button
												type="button"
												key={item.id}
												onClick={() => {
													setSelectedId(item.id);
													setTab('initiatives');
												}}
											>
												<span
													className={`hub-risk ${item.status === 'AT_RISK' ? 'high' : 'medium'}`}
												>
													<TrendingUp />
												</span>
												<div>
													<strong>{item.title}</strong>
													<small>
														{item.ownerName || tr("Responsable por definir")} ·{' '}
														{item.progress}{tr("% completado")}</small>
												</div>
												<em>{statusLabels[item.status] || item.status}</em>
											</button>
										))}
									{!data.initiatives.length && (
										<Empty
											icon={<Target />}
											title={tr("Comienza el plan anual")}
											text={tr("Crea el primer plan y convierte sus objetivos en programas medibles.")}
										/>
									)}
								</div>
							</section>
							<section className="panel hub-forecast">
								<header>
									<div>
										<span className="eyebrow">{tr("LECTURA OPERATIVA")}</span>
										<h2>{tr("Señal de ejecución")}</h2>
									</div>
									<span
										className={`forecast-grade ${data.forecast.riskLevel.toLowerCase()}`}
									>
										{tr(({LOW:'Bajo',MEDIUM:'Medio',HIGH:'Alto'} as Record<string,string>)[data.forecast.riskLevel] ?? data.forecast.riskLevel)}
									</span>
								</header>
								<div
									className="forecast-ring"
									style={
										{
											'--forecast': `${data.forecast.sampleSize ? data.forecast.onTimeRate : 0}%`,
										} as React.CSSProperties
									}
								>
									<strong>{data.forecast.sampleSize ? `${data.forecast.onTimeRate}%` : '—'}</strong>
									<span>{tr("Indicador heurístico reciente")}</span>
								</div>
								<p>{data.forecast.riskLevel === 'HIGH' ? tr('La tendencia reciente requiere intervención del equipo.') : data.forecast.riskLevel === 'MEDIUM' ? tr('La ejecución requiere seguimiento preventivo.') : tr('Supervisa las fechas y confirma los cierres en el expediente.')}</p>
								<small>{tr('Muestra reciente: ')}{data.forecast.sampleSize}{tr(' iniciativas completadas. Basado en fecha prevista y última actualización; no valida puntualidad ni predice resultados.')}</small>
							</section>
						</div>
						<div className="hub-control-grid">
							<section className="panel hub-kpis">
								<header>
									<div>
										<span className="eyebrow">{tr("INDICADORES")}</span>
										<h2>{tr("Resultados medibles")}</h2>
									</div>
									{data.access.canManage && (
										<button
											type="button"
											className="button button-secondary"
											onClick={() => open('kpi')}
										>
											<Plus />{tr(" Indicador")}</button>
									)}
								</header>
								<div className="hub-kpi-grid">
									{data.kpis.slice(0, 6).map((item) => {
										const value = item.targetValue
											? Math.min(
													100,
													Math.round(
														(item.currentValue / item.targetValue) * 100,
													),
												)
											: 0;
										return (
											<article key={item.id}>
												<div>
													<strong>{item.name}</strong>
													<span>
														{item.currentValue} / {item.targetValue} {item.unit}
													</span>
												</div>
												<b>
													<i style={{ width: `${value}%` }} />
												</b>
												<small>
													{value}% · {statusLabels[item.status] || item.status}
												</small>
											</article>
										);
									})}
									{!data.kpis.length && (
										<p className="hub-muted">{tr("Aún no hay indicadores. Define resultados que el equipo pueda revisar durante el año.")}</p>
									)}
								</div>
							</section>
							<section className="panel hub-guidance">
								<span className="eyebrow">{tr("GUÍA DEL ESPACIO")}</span>
								<h2>{tr("Controles esenciales")}</h2>
								{pack.guidance.map((item) => (
									<p key={item}>
										<CheckCircle2 />
										{item}
									</p>
								))}
							</section>
						</div>
					</>
				)}
				{tab === 'strategy' && (
					<section className="panel hub-section">
						<SectionHead
							eyebrow={tr("DIRECCIÓN ANUAL")}
							title={tr("Planes y objetivos")}
							text={tr("Convierte la misión del departamento en objetivos medibles, responsables y fechas.")}
							action={
								data.access.canManage ? (
									<button
										type="button"
										className="button button-primary"
										onClick={() => open('plan')}
									>
										<Plus />{tr(" Nuevo plan")}</button>
								) : undefined
							}
						/>
						<div className="hub-plan-grid premium-scroll-list">
							{data.plans.map((plan) => (
								<article className="hub-plan-card" key={plan.id}>
									<header>
										<span>{plan.year}</span>
										<em>{statusLabels[plan.status] || plan.status}</em>
									</header>
									<h3>{plan.title}</h3>
									<p>
										{plan.vision ||
											plan.mission ||
											tr("Visión pendiente de documentar.")}
									</p>
									<div className="hub-progress">
										<i style={{ width: `${plan.progress}%` }} />
									</div>
									<small>
										{plan.progress}% ·{' '}
										{plan.ownerName || tr("Responsable por definir")}
									</small>
									<div className="hub-objectives">
										{plan.objectives.map((objective) => (
											<div key={objective.id}>
												<CheckCircle2 />
												<span>
													<strong>{objective.title}</strong>
													<small>
														{objective.currentValue}/{objective.targetValue}{' '}
														{objective.unit}
														{objective.dueOn
															? ` · ${formatDate(objective.dueOn, false)}`
															: ''}
													</small>
												</span>
											</div>
										))}
									</div>
									{data.access.canManage && (
										<footer>
											<button
												type="button"
												onClick={() => {
													setObjectiveForm({
														...objectiveForm,
														planId: plan.id,
													});
													open('objective');
												}}
											>
												<Plus />{tr(" Objetivo")}</button>
											{data.access.canApprove && plan.status === 'DRAFT' && (
												<button
													type="button"
													onClick={() => void approvePlan(plan.id)}
												>
													<ShieldCheck />{tr(" Aprobar plan")}</button>
											)}
										</footer>
									)}
								</article>
							))}
							{!data.plans.length && (
								<Empty
									icon={<Target />}
									title={tr("Sin planes anuales")}
									text={tr("Crea un plan, define la visión y asigna objetivos al equipo.")}
								/>
							)}
						</div>
					</section>
				)}
				{tab === 'initiatives' && (
					<section className="panel hub-section">
						<SectionHead
							eyebrow={tr("PROGRAMAS Y CAMPAÑAS")}
							title={tr("Ejecución ministerial")}
							text={tr("Cada iniciativa puede conectarse a una actividad del calendario central.")}
							action={
								data.access.canManage ? (
									<button
										type="button"
										className="button button-primary"
										onClick={() => open('initiative')}
									>
										<Plus />{tr(" Nueva iniciativa")}</button>
								) : undefined
							}
						/>
						<SearchBar
							value={search}
							onChange={setSearch}
							placeholder={tr("Buscar programa, objetivo o responsable…")}
						/>
						<div className="hub-initiative-list premium-scroll-list">
							{visibleInitiatives.map((item) => (
								<article
									key={item.id}
									className={selectedId === item.id ? 'selected' : ''}
								>
									<button
										type="button"
										className="hub-initiative-main"
										onClick={() => setSelectedId(item.id)}
									>
										<span
											className={`hub-priority ${item.priority.toLowerCase()}`}
										>
											{item.progress}
										</span>
										<div>
											<small>
												{item.initiativeType}{' '}
												{item.calendarCode ? `· ${item.calendarCode}` : ''}
											</small>
											<h3>{item.title}</h3>
											<p>{item.objective}</p>
											<em>
												{item.ownerName || tr("Responsable por definir")} ·{' '}
												{item.startsOn} — {item.endsOn}
											</em>
										</div>
										<span className={`badge ${item.status.toLowerCase()}`}>
											{statusLabels[item.status] || item.status}
										</span>
									</button>
									{selectedId === item.id && (
										<>
											<div className="hub-initiative-actions">
												{data.access.canManage && (
													<>
														<button
															type="button"
															onClick={() => open('assignment', item.id)}
														>
															<UserRoundCheck />{tr(" Asignar")}</button>
														{item.status !== 'COMPLETED' && (
															<button
																type="button"
																onClick={() =>
																	void updateInitiative(
																		item.id,
																		'IN_PROGRESS',
																		Math.max(item.progress, 25),
																	)
																}
															>
																<TrendingUp />{tr(" Avanzar")}</button>
														)}
														<button
															type="button"
															onClick={() =>
																void updateInitiative(item.id, 'COMPLETED', 100)
															}
														>
															<Check />{tr(" Completar")}</button>
													</>
												)}
												<Link
													href={
														item.calendarActivityId
															? `/activities/${item.calendarActivityId}`
															: `/activities/new?departmentId=${data.selected.departmentId}`
													}
												>
													<CalendarDays />{' '}
													{item.calendarActivityId
														? tr("Ver calendario")
														: tr("Calendarizar")}
												</Link>
												<button
													type="button"
													onClick={() => open('comment', item.id)}
												>
													<MessageSquareText />{tr(" Comentar")}</button>
											</div>
											<div className="hub-comment-thread">
												{data.comments
													.filter(
														(comment) =>
															comment.resourceType === 'INITIATIVE' &&
															comment.resourceId === item.id,
													)
													.slice(0, 4)
													.map((comment) => (
														<article key={comment.id}>
															<MessageSquareText />
															<div>
																<strong>{comment.createdByName}</strong>
																<p>{comment.body}</p>
															</div>
															<time>{formatDate(comment.createdAt)}</time>
														</article>
													))}
												{!data.comments.some(
													(comment) =>
														comment.resourceType === 'INITIATIVE' &&
														comment.resourceId === item.id,
												) && (
													<small>{tr("Sin comentarios todavía. Inicia la conversación del equipo.")}</small>
												)}
											</div>
										</>
									)}
								</article>
							))}
							{!visibleInitiatives.length && (
								<Empty
									icon={<BriefcaseBusiness />}
									title={tr("No hay iniciativas")}
									text={tr("Planifica un programa, campaña, proyecto, capacitación o servicio.")}
								/>
							)}
						</div>
					</section>
				)}
				{tab === 'tasks' && (
					<section className="panel hub-section">
						<SectionHead
							eyebrow={tr("COLABORACIÓN")}
							title={tr("Trabajo del equipo")}
							text={tr("Responsables, fechas límite y seguimiento en un flujo visible.")}
							action={
								data.access.canManage ? (
									<button
										type="button"
										className="button button-primary"
										onClick={() => open('task')}
									>
										<Plus />{tr(" Nueva tarea")}</button>
								) : undefined
							}
						/>
						<SearchBar
							value={search}
							onChange={setSearch}
							placeholder={tr("Buscar tarea o responsable…")}
						/>
						<div className="hub-task-board premium-scroll-list">
							{['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'].map((status) => (
								<div key={status}>
									<header>
										<strong>{statusLabels[status]}</strong>
										<span>
											{
												visibleTasks.filter((item) => item.status === status)
													.length
											}
										</span>
									</header>
									{visibleTasks
										.filter((item) => item.status === status)
										.map((item) => (
											<article key={item.id}>
												<small>
													{item.priority}{' '}
													{item.dueAt ? `· ${formatDate(item.dueAt)}` : ''}
												</small>
												<h3>{item.title}</h3>
												<p>{item.description}</p>
												<span>{item.assignedName || tr("Sin asignar")}</span>
												{item.status !== 'COMPLETED' && (
													<button
														type="button"
														onClick={() =>
															void updateTask(
																item.id,
																item.status === 'TODO'
																	? 'IN_PROGRESS'
																	: 'COMPLETED',
															)
														}
													>
														<Check />{' '}
														{item.status === 'TODO' ? tr("Iniciar") : tr("Completar")}
													</button>
												)}
											</article>
										))}
								</div>
							))}
						</div>
					</section>
				)}
				{tab === 'finance' && (
					<section className="hub-finance">
						<div className="hub-finance-hero">
							<span>
								<WalletCards />
							</span>
							<div>
								<small>{tr("PRESUPUESTO DEL DEPARTAMENTO")}</small>
								<h2>{budgetValue('availableBudget')}</h2>
								<p>{tr("Disponible de ")}{budgetValue('plannedBudget')}{tr(" planificado")}</p>
							</div>
							{data.access.canFinance && (
								<button
									type="button"
									className="button"
									onClick={() => open('budget')}
								>
									<Plus />{tr(" Registrar movimiento")}</button>
							)}
						</div>
						<div className="hub-finance-grid">
							<article>
								<HandCoins />
								<span>
									<small>{tr("Planificado")}</small>
									<strong>{budgetValue('plannedBudget')}</strong>
								</span>
							</article>
							<article>
								<BadgeDollarSign />
								<span>
									<small>{tr("Ejecutado")}</small>
									<strong>{budgetValue('spentBudget')}</strong>
								</span>
							</article>
							<article>
								<BarChart3 />
								<span>
									<small>{tr("Utilización")}</small>
									<strong>
										{budgetUtilization}
									</strong>
								</span>
							</article>
						</div>
						{(!data.metrics.budgetAggregationComparable || !budgetGroups) && <Notice tone="warning" title={tr('Presupuestos por moneda')}>{tr('No se suman monedas distintas ni se aplica una conversión de cambio.')}</Notice>}
						{Boolean(data.metrics.unallocatedBudgetEntries) && <Notice tone="warning" title={tr('Movimientos sin moneda atribuible')}>{data.metrics.unallocatedBudgetEntries} · {tr('Enlaza estos movimientos a una iniciativa para identificar su moneda.')}</Notice>}
						<section className="panel hub-section">
							<SectionHead
								eyebrow={tr("TRAZABILIDAD")}
								title={tr("Presupuesto por iniciativa")}
								text={tr("Los movimientos y aprobaciones quedan registrados en la bitácora inmutable.")}
							/>
							<div className="hub-budget-list">
								{data.initiatives.map((item) => (
									<button
										type="button"
										key={item.id}
										onClick={() => {
											setBudgetForm({ ...budgetForm, initiativeId: item.id });
											open('budget');
										}}
									>
										<span style={{ background: data.selected.color }} />
										<div>
											<strong>{item.title}</strong>
											<small>
												{money(item.spentBudget, item.currency)}{tr(" ejecutado ·")}{' '}
												{money(item.committedBudget, item.currency)}{' '}{tr("comprometido")}</small>
										</div>
										<em>
											{money(
												item.plannedBudget - item.spentBudget,
												item.currency,
											)}
										</em>
										<ChevronRight />
									</button>
								))}
							</div>
						</section>
					</section>
				)}
				{tab === 'meetings' && (
					<div className="hub-meeting-grid">
						<section className="panel hub-section">
							<SectionHead
								eyebrow={tr("COORDINACIÓN")}
								title={tr("Reuniones y actas")}
								text={tr("Agenda, participantes, acuerdos y evidencia en un solo lugar.")}
								action={
									data.access.canManage ? (
										<button
											type="button"
											className="button button-primary"
											onClick={() => open('meeting')}
										>
											<Plus />{tr(" Programar")}</button>
									) : undefined
								}
							/>
							<div className="hub-meeting-list premium-scroll-list">
								{data.meetings.map((item) => (
									<article key={item.id}>
										<span>
											<strong>{new Date(item.scheduledAt).getDate()}</strong>
											<small>
												{new Date(item.scheduledAt)
													.toLocaleString('es', { month: 'short' })
													.toUpperCase()}
											</small>
										</span>
										<div>
											<small>{statusLabels[item.status] || item.status}</small>
											<h3>{item.title}</h3>
											<p>
												{formatDate(item.scheduledAt)} ·{' '}
												{item.location || tr("Lugar por definir")}
											</p>
											<em>{item.participantCount}{tr(" participantes")}</em>
										</div>
										{data.access.canManage && (
											<button
												type="button"
												onClick={() => open('minutes', item.id)}
											>
												<FileCheck2 />{tr(" Acta")}</button>
										)}
									</article>
								))}
							</div>
						</section>
						<section className="panel hub-section">
							<SectionHead
								eyebrow={tr("GOBIERNO")}
								title={tr("Acuerdos formales")}
								text={tr("La aplicación conserva la decisión; no sustituye la autoridad que la adopta.")}
								action={
									data.access.canApprove ? (
										<button
											type="button"
											className="button button-secondary"
											onClick={() => open('decision')}
										>
											<Landmark />{tr(" Registrar acuerdo")}</button>
									) : undefined
								}
							/>
							<div className="hub-decision-list premium-scroll-list">
								{data.decisions.map((item) => (
									<article key={item.id}>
										<ShieldCheck />
										<div>
											<small>
												{authorityLabels[item.authorityType] ||
													item.authorityType}{' '}
												· {item.decidedOn}
											</small>
											<h3>{item.title}</h3>
											<p>{item.decisionText}</p>
											<em>{tr("Aprobó: ")}{item.approvedByName}
												{item.evidenceReference
													? ` · ${item.evidenceReference}`
													: ''}
											</em>
										</div>
									</article>
								))}
							</div>
						</section>
					</div>
				)}
				{tab === 'records' && (
					<section className="panel hub-section">
						<SectionHead
							eyebrow={tr("CAPACIDADES ESPECIALIZADAS")}
							title={tr(pack.title)}
							text={tr("Registros diseñados para la operación particular de este ministerio.")}
							action={
								data.access.canManage ? (
									<button
										type="button"
										className="button button-primary"
										onClick={() => open('record')}
									>
										<Plus />{tr(" Nuevo registro")}</button>
								) : undefined
							}
						/>
						<div className="hub-capability-grid">
							{pack.recordTypes.map((item) => (
								<button
									type="button"
									key={item.type}
									onClick={() => {
										setRecordForm({
											...recordForm,
											recordType: item.type,
											visibility: item.privacy || 'TEAM',
										});
										open('record');
									}}
								>
									<span>
										<BookOpenCheck />
									</span>
									<div>
										<strong>{item.label}</strong>
										<p>{item.description}</p>
										{item.privacy && (
											<small>
												<ShieldCheck />{' '}
												{item.privacy === 'RESTRICTED'
													? tr("Acceso restringido")
													: tr("Solo liderazgo")}
											</small>
										)}
									</div>
									<ChevronRight />
								</button>
							))}
						</div>
						<div className="hub-record-list premium-scroll-list">
							{data.records.map((item) => (
								<article key={item.id}>
									<span>
										<FileCheck2 />
									</span>
									<div>
										<small>
											{pack.recordTypes.find(
												(type) => type.type === item.recordType,
											)?.label || item.recordType}{' '}
											· {item.recordDate}
										</small>
										<h3>{item.title}</h3>
										<p>
											{String(
												item.data.notes ||
													item.data.reference ||
													'Registro operativo',
											)}
										</p>
									</div>
									<em>{item.visibility}</em>
								</article>
							))}
						</div>
						<div className="hub-document-link">
							<Files />
							<div>
								<strong>{tr("Biblioteca departamental")}</strong>
								<span>
									{data.documents.total}{tr(" documentos · ")}{data.documents.verified}{' '}{tr("con alineación verificada")}</span>
							</div>
							<Link
								className="button button-secondary"
								href={`/documents?departmentId=${data.selected.departmentId}`}
							>{tr("Abrir biblioteca ")}<ArrowRight />
							</Link>
						</div>
					</section>
				)}
				{tab === 'team' && (
					<section className="panel hub-section">
						<SectionHead
							eyebrow={tr("EQUIPO CONECTADO")}
							title={tr("Personas, cargos y responsabilidades")}
							text={tr("Los accesos provienen de las membresías y cargos configurados para este departamento.")}
						/>
						<div className="hub-team-grid">
							{data.team.map((item) => (
								<article key={item.id}>
									<span>
										{item.name
											.split(' ')
											.map((part) => part[0])
											.slice(0, 2)
											.join('')}
									</span>
									<div>
										<h3>{item.name}</h3>
										<p>{item.email}</p>
										<small>
											{departmentRoleLabel(item.role)}
											{item.appointments.length
												? ` · ${item.appointments.join(', ')}`
												: ''}
										</small>
									</div>
								</article>
							))}
						</div>
					</section>
				)}
			</div>
			</div>
			{modal && (
				<HubModal
					title={modalTitle(modal)}
					error={error}
					onClose={() => setModal('')}
					busy={busy}
					onSubmit={
						modal === 'plan'
							? savePlan
							: modal === 'objective'
								? saveObjective
								: modal === 'initiative'
									? saveInitiative
									: modal === 'assignment'
										? saveAssignment
										: modal === 'task'
											? saveTask
											: modal === 'budget'
												? saveBudget
												: modal === 'meeting'
													? saveMeeting
													: modal === 'minutes'
														? saveMinutes
														: modal === 'decision'
															? saveDecision
															: modal === 'comment'
																? saveComment
																: modal === 'kpi'
																	? saveKpi
																	: saveRecord
					}
				>
					{modal === 'plan' && (
						<>
							<label>{tr("Nombre del plan")}<input
									required
									value={planForm.title}
									onChange={(e) =>
										setPlanForm({ ...planForm, title: e.target.value })
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Año")}<input
										type="number"
										min="2020"
										max="2200"
										value={planForm.year}
										onChange={(e) =>
											setPlanForm({ ...planForm, year: Number(e.target.value) })
										}
									/>
								</label>
								<TeamSelect
									label={tr("Responsable")}
									value={planForm.ownerId}
									team={data.team}
									onChange={(ownerId) => setPlanForm({ ...planForm, ownerId })}
								/>
							</div>
							<label>{tr("Visión")}<textarea
									rows={3}
									value={planForm.vision}
									onChange={(e) =>
										setPlanForm({ ...planForm, vision: e.target.value })
									}
								/>
							</label>
							<label>{tr("Misión")}<textarea
									rows={3}
									value={planForm.mission}
									onChange={(e) =>
										setPlanForm({ ...planForm, mission: e.target.value })
									}
								/>
							</label>
						</>
					)}
					{modal === 'objective' && (
						<>
							<label>{tr("Plan")}<select
									required
									value={objectiveForm.planId}
									onChange={(e) =>
										setObjectiveForm({
											...objectiveForm,
											planId: e.target.value,
										})
									}
								>
									<option value="">{tr("Seleccionar…")}</option>
									{data.plans.map((item) => (
										<option value={item.id} key={item.id}>
											{item.title} · {item.year}
										</option>
									))}
								</select>
							</label>
							<label>{tr("Objetivo")}<input
									required
									value={objectiveForm.title}
									onChange={(e) =>
										setObjectiveForm({
											...objectiveForm,
											title: e.target.value,
										})
									}
								/>
							</label>
							<label>{tr("Descripción")}<textarea
									rows={3}
									value={objectiveForm.description}
									onChange={(e) =>
										setObjectiveForm({
											...objectiveForm,
											description: e.target.value,
										})
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Meta")}<input
										type="number"
										min="0"
										value={objectiveForm.targetValue}
										onChange={(e) =>
											setObjectiveForm({
												...objectiveForm,
												targetValue: Number(e.target.value),
											})
										}
									/>
								</label>
								<label>{tr("Unidad")}<input
										value={objectiveForm.unit}
										onChange={(e) =>
											setObjectiveForm({
												...objectiveForm,
												unit: e.target.value,
											})
										}
									/>
								</label>
								<label>{tr("Fecha límite")}<input
										type="date"
										value={objectiveForm.dueOn}
										onChange={(e) =>
											setObjectiveForm({
												...objectiveForm,
												dueOn: e.target.value,
											})
										}
									/>
								</label>
								<TeamSelect
									label={tr("Responsable")}
									value={objectiveForm.ownerId}
									team={data.team}
									onChange={(ownerId) =>
										setObjectiveForm({ ...objectiveForm, ownerId })
									}
								/>
							</div>
						</>
					)}
					{modal === 'initiative' && (
						<>
							<label>{tr("Nombre")}<input
									required
									value={initiativeForm.title}
									onChange={(e) =>
										setInitiativeForm({
											...initiativeForm,
											title: e.target.value,
										})
									}
								/>
							</label>
							<label>{tr("Objetivo")}<input
									required
									value={initiativeForm.objective}
									onChange={(e) =>
										setInitiativeForm({
											...initiativeForm,
											objective: e.target.value,
										})
									}
								/>
							</label>
							<label>{tr("Descripción")}<textarea
									rows={3}
									value={initiativeForm.description}
									onChange={(e) =>
										setInitiativeForm({
											...initiativeForm,
											description: e.target.value,
										})
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Tipo")}<select
										value={initiativeForm.initiativeType}
										onChange={(e) =>
											setInitiativeForm({
												...initiativeForm,
												initiativeType: e.target.value,
											})
										}
									>
										{[
											'ACTIVITY',
											'PROGRAM',
											'CAMPAIGN',
											'PROJECT',
											'TRAINING',
											'SERVICE',
										].map((value) => (
											<option value={value} key={value}>
												{value}
											</option>
										))}
									</select>
								</label>
								<label>{tr("Prioridad")}<select
										value={initiativeForm.priority}
										onChange={(e) =>
											setInitiativeForm({
												...initiativeForm,
												priority: e.target.value,
											})
										}
									>
										{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
											<option value={value} key={value}>
												{value}
											</option>
										))}
									</select>
								</label>
								<label>{tr("Inicio")}<input
										required
										type="date"
										value={initiativeForm.startsOn}
										onChange={(e) =>
											setInitiativeForm({
												...initiativeForm,
												startsOn: e.target.value,
											})
										}
									/>
								</label>
								<label>{tr("Final")}<input
										required
										type="date"
										min={initiativeForm.startsOn}
										value={initiativeForm.endsOn}
										onChange={(e) =>
											setInitiativeForm({
												...initiativeForm,
												endsOn: e.target.value,
											})
										}
									/>
								</label>
								<label>{tr("Presupuesto")}<input
										type="number"
										min="0"
										value={initiativeForm.plannedBudget}
										onChange={(e) =>
											setInitiativeForm({
												...initiativeForm,
												plannedBudget: Number(e.target.value),
											})
										}
									/>
								</label>
								<TeamSelect
									label={tr("Responsable")}
									value={initiativeForm.ownerId}
									team={data.team}
									onChange={(ownerId) =>
										setInitiativeForm({ ...initiativeForm, ownerId })
									}
								/>
							</div>
							<label>{tr("Plan anual")}<select
									value={initiativeForm.planId}
									onChange={(e) =>
										setInitiativeForm({
											...initiativeForm,
											planId: e.target.value,
										})
									}
								>
									<option value="">{tr("Sin plan asociado")}</option>
									{data.plans.map((item) => (
										<option value={item.id} key={item.id}>
											{item.title}
										</option>
									))}
								</select>
							</label>
							<label>{tr("Actividad del calendario")}<select
									value={initiativeForm.calendarActivityId}
									onChange={(e) =>
										setInitiativeForm({
											...initiativeForm,
											calendarActivityId: e.target.value,
										})
									}
								>
									<option value="">{tr("Calendarizar después")}</option>
									{data.calendarActivities.map((item) => (
										<option value={item.id} key={item.id}>
											{item.code} · {item.title}
										</option>
									))}
								</select>
							</label>
						</>
					)}
					{modal === 'assignment' && (
						<>
							<p>{tr("Asigna una responsabilidad concreta en")}{' '}
								<strong>{selectedInitiative?.title}</strong>.
							</p>
							<TeamSelect
								required
								label={tr("Integrante")}
								value={assignmentForm.userId}
								team={data.team}
								onChange={(userId) =>
									setAssignmentForm({ ...assignmentForm, userId })
								}
							/>
							<label>{tr("Responsabilidad")}<input
									required
									value={assignmentForm.responsibility}
									onChange={(e) =>
										setAssignmentForm({
											...assignmentForm,
											responsibility: e.target.value,
										})
									}
								/>
							</label>
						</>
					)}
					{modal === 'task' && (
						<>
							<label>{tr("Tarea")}<input
									required
									value={taskForm.title}
									onChange={(e) =>
										setTaskForm({ ...taskForm, title: e.target.value })
									}
								/>
							</label>
							<label>{tr("Descripción")}<textarea
									rows={3}
									value={taskForm.description}
									onChange={(e) =>
										setTaskForm({ ...taskForm, description: e.target.value })
									}
								/>
							</label>
							<div className="form-grid">
								<TeamSelect
									label={tr("Responsable")}
									value={taskForm.assignedTo}
									team={data.team}
									onChange={(assignedTo) =>
										setTaskForm({ ...taskForm, assignedTo })
									}
								/>
								<label>{tr("Fecha límite")}<input
										type="datetime-local"
										value={taskForm.dueAt}
										onChange={(e) =>
											setTaskForm({ ...taskForm, dueAt: e.target.value })
										}
									/>
								</label>
								<label>{tr("Iniciativa")}<select
										value={taskForm.initiativeId}
										onChange={(e) =>
											setTaskForm({ ...taskForm, initiativeId: e.target.value })
										}
									>
										<option value="">{tr("Tarea general")}</option>
										{data.initiatives.map((item) => (
											<option value={item.id} key={item.id}>
												{item.title}
											</option>
										))}
									</select>
								</label>
								<label>{tr("Prioridad")}<select
										value={taskForm.priority}
										onChange={(e) =>
											setTaskForm({ ...taskForm, priority: e.target.value })
										}
									>
										{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
											<option value={value} key={value}>
												{value}
											</option>
										))}
									</select>
								</label>
							</div>
						</>
					)}
					{modal === 'budget' && (
						<>
							<div className="form-grid">
								<label>{tr("Tipo")}<select
										value={budgetForm.entryType}
										onChange={(e) =>
											setBudgetForm({
												...budgetForm,
												entryType: e.target.value,
											})
										}
									>
										{[
											'ALLOCATION',
											'COMMITMENT',
											'EXPENSE',
											'INCOME',
											'ADJUSTMENT',
										].map((value) => (
											<option value={value} key={value}>
												{value}
											</option>
										))}
									</select>
								</label>
								<label>{tr("Monto")}<input
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
								<label>{tr("Categoría")}<input
										required
										value={budgetForm.category}
										onChange={(e) =>
											setBudgetForm({ ...budgetForm, category: e.target.value })
										}
									/>
								</label>
								<label>{tr("Fecha")}<input
										required
										type="date"
										value={budgetForm.occurredOn}
										onChange={(e) =>
											setBudgetForm({
												...budgetForm,
												occurredOn: e.target.value,
											})
										}
									/>
								</label>
							</div>
							<label>{tr("Iniciativa")}<select
									value={budgetForm.initiativeId}
									onChange={(e) =>
										setBudgetForm({
											...budgetForm,
											initiativeId: e.target.value,
										})
									}
								>
									<option value="">{tr("Presupuesto general")}</option>
									{data.initiatives.map((item) => (
										<option value={item.id} key={item.id}>
											{item.title}
										</option>
									))}
								</select>
							</label>
							<label>{tr("Descripción")}<input
									value={budgetForm.description}
									onChange={(e) =>
										setBudgetForm({
											...budgetForm,
											description: e.target.value,
										})
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Proveedor")}<input
										value={budgetForm.vendor}
										onChange={(e) =>
											setBudgetForm({ ...budgetForm, vendor: e.target.value })
										}
									/>
								</label>
								<label>{tr("Referencia")}<input
										value={budgetForm.reference}
										onChange={(e) =>
											setBudgetForm({
												...budgetForm,
												reference: e.target.value,
											})
										}
									/>
								</label>
							</div>
						</>
					)}
					{modal === 'meeting' && (
						<>
							<label>{tr("Título")}<input
									required
									value={meetingForm.title}
									onChange={(e) =>
										setMeetingForm({ ...meetingForm, title: e.target.value })
									}
								/>
							</label>
							<label>{tr("Agenda")}<textarea
									required
									minLength={3}
									rows={4}
									value={meetingForm.agenda}
									onChange={(e) =>
										setMeetingForm({ ...meetingForm, agenda: e.target.value })
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Inicio")}<input
										required
										type="datetime-local"
										value={meetingForm.scheduledAt}
										onChange={(e) =>
											setMeetingForm({
												...meetingForm,
												scheduledAt: e.target.value,
											})
										}
									/>
								</label>
								<label>{tr("Final")}<input
										required
										type="datetime-local"
										value={meetingForm.endsAt}
										onChange={(e) =>
											setMeetingForm({ ...meetingForm, endsAt: e.target.value })
										}
									/>
								</label>
								<label>{tr("Lugar o enlace")}<input
										value={meetingForm.location}
										onChange={(e) =>
											setMeetingForm({
												...meetingForm,
												location: e.target.value,
											})
										}
									/>
								</label>
							</div>
							<fieldset className="hub-participants">
								<legend>{tr("Participantes")}</legend>
								{data.team.map((item) => (
									<label key={item.id}>
										<input
											type="checkbox"
											checked={meetingForm.participantIds.includes(item.id)}
											onChange={(e) =>
												setMeetingForm({
													...meetingForm,
													participantIds: e.target.checked
														? [...meetingForm.participantIds, item.id]
														: meetingForm.participantIds.filter(
																(id) => id !== item.id,
															),
												})
											}
										/>
										<span>
											{item.name}
											<small>{item.role}</small>
										</span>
										<Check />
									</label>
								))}
							</fieldset>
						</>
					)}
					{modal === 'minutes' && (
						<>
							<p>{tr("El acta cerrará formalmente la reunión y conservará el texto en la auditoría.")}</p>
							<label>{tr("Acta y acuerdos")}<textarea
									required
									rows={10}
									value={minutesForm.minutes}
									onChange={(e) =>
										setMinutesForm({ ...minutesForm, minutes: e.target.value })
									}
								/>
							</label>
						</>
					)}
					{modal === 'decision' && (
						<>
							<label>{tr("Título del acuerdo")}<input
									required
									value={decisionForm.title}
									onChange={(e) =>
										setDecisionForm({ ...decisionForm, title: e.target.value })
									}
								/>
							</label>
							<label>{tr("Decisión")}<textarea
									required
									minLength={10}
									rows={5}
									value={decisionForm.decisionText}
									onChange={(e) =>
										setDecisionForm({
											...decisionForm,
											decisionText: e.target.value,
										})
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Autoridad")}<select
										value={decisionForm.authorityType}
										onChange={(e) =>
											setDecisionForm({
												...decisionForm,
												authorityType: e.target.value,
											})
										}
									>
										{Object.entries(authorityLabels).map(([value, label]) => (
											<option value={value} key={value}>
												{label}
											</option>
										))}
									</select>
								</label>
								<label>{tr("Fecha")}<input
										required
										type="date"
										value={decisionForm.decidedOn}
										onChange={(e) =>
											setDecisionForm({
												...decisionForm,
												decidedOn: e.target.value,
											})
										}
									/>
								</label>
								<label>{tr("Vigencia")}<input
										type="date"
										value={decisionForm.effectiveOn}
										onChange={(e) =>
											setDecisionForm({
												...decisionForm,
												effectiveOn: e.target.value,
											})
										}
									/>
								</label>
								<label>{tr("Evidencia / referencia")}<input
										value={decisionForm.evidenceReference}
										onChange={(e) =>
											setDecisionForm({
												...decisionForm,
												evidenceReference: e.target.value,
											})
										}
									/>
								</label>
							</div>
							<label>{tr("Reunión relacionada")}<select
									value={decisionForm.meetingId}
									onChange={(e) =>
										setDecisionForm({
											...decisionForm,
											meetingId: e.target.value,
										})
									}
								>
									<option value="">{tr("Sin reunión enlazada")}</option>
									{data.meetings.map((item) => (
										<option value={item.id} key={item.id}>
											{item.title} · {formatDate(item.scheduledAt)}
										</option>
									))}
								</select>
							</label>
						</>
					)}
					{modal === 'kpi' && (
						<>
							<label>{tr("Indicador")}<input
									required
									value={kpiForm.name}
									onChange={(e) =>
										setKpiForm({ ...kpiForm, name: e.target.value })
									}
								/>
							</label>
							<label>{tr("Descripción")}<input
									value={kpiForm.description}
									onChange={(e) =>
										setKpiForm({ ...kpiForm, description: e.target.value })
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Meta")}<input
										required
										type="number"
										min="0"
										value={kpiForm.targetValue}
										onChange={(e) =>
											setKpiForm({
												...kpiForm,
												targetValue: Number(e.target.value),
											})
										}
									/>
								</label>
								<label>{tr("Valor actual")}<input
										required
										type="number"
										min="0"
										value={kpiForm.currentValue}
										onChange={(e) =>
											setKpiForm({
												...kpiForm,
												currentValue: Number(e.target.value),
											})
										}
									/>
								</label>
								<label>{tr("Unidad")}<input
										value={kpiForm.unit}
										onChange={(e) =>
											setKpiForm({ ...kpiForm, unit: e.target.value })
										}
									/>
								</label>
								<label>{tr("Inicio")}<input
										required
										type="date"
										value={kpiForm.periodStart}
										onChange={(e) =>
											setKpiForm({ ...kpiForm, periodStart: e.target.value })
										}
									/>
								</label>
								<label>{tr("Final")}<input
										required
										type="date"
										value={kpiForm.periodEnd}
										onChange={(e) =>
											setKpiForm({ ...kpiForm, periodEnd: e.target.value })
										}
									/>
								</label>
							</div>
						</>
					)}
					{modal === 'comment' && (
						<>
							<label>{tr("Comentario")}<textarea
									required
									rows={5}
									maxLength={3000}
									placeholder={tr("Comparte un avance, una pregunta o una decisión pendiente…")}
									value={commentForm.body}
									onChange={(e) =>
										setCommentForm({ ...commentForm, body: e.target.value })
									}
								/>
							</label>
							<fieldset className="hub-mentions">
								<legend>{tr("Mencionar y notificar")}</legend>
								{data.team.map((member) => (
									<label key={member.id}>
										<input
											type="checkbox"
											checked={commentForm.mentionUserIds.includes(member.id)}
											onChange={() =>
												setCommentForm((current) => ({
													...current,
													mentionUserIds: current.mentionUserIds.includes(
														member.id,
													)
														? current.mentionUserIds.filter(
																(id) => id !== member.id,
															)
														: [...current.mentionUserIds, member.id],
												}))
											}
										/>
										<span>
											<strong>{member.name}</strong>
											<small>{member.role}</small>
										</span>
									</label>
								))}
							</fieldset>
						</>
					)}
					{modal === 'record' && (
						<>
							<label>{tr("Tipo")}<select
									value={recordForm.recordType}
									onChange={(e) => {
										const definition = pack.recordTypes.find(
											(item) => item.type === e.target.value,
										);
										setRecordForm({
											...recordForm,
											recordType: e.target.value,
											visibility: definition?.privacy || recordForm.visibility,
										});
									}}
								>
									{pack.recordTypes.map((item) => (
										<option value={item.type} key={item.type}>
											{item.label}
										</option>
									))}
								</select>
							</label>
							<label>{tr("Título")}<input
									required
									value={recordForm.title}
									onChange={(e) =>
										setRecordForm({ ...recordForm, title: e.target.value })
									}
								/>
							</label>
							<div className="form-grid">
								<label>{tr("Fecha")}<input
										required
										type="date"
										value={recordForm.recordDate}
										onChange={(e) =>
											setRecordForm({
												...recordForm,
												recordDate: e.target.value,
											})
										}
									/>
								</label>
								<TeamSelect
									label={tr("Responsable")}
									value={recordForm.ownerId}
									team={data.team}
									onChange={(ownerId) =>
										setRecordForm({ ...recordForm, ownerId })
									}
								/>
								<label>{tr("Visibilidad")}<select
										disabled={
											pack.recordTypes.find(
												(item) => item.type === recordForm.recordType,
											)?.privacy === 'RESTRICTED'
										}
										value={recordForm.visibility}
										onChange={(e) =>
											setRecordForm({
												...recordForm,
												visibility: e.target.value,
											})
										}
									>
										<option value="TEAM">{tr("Equipo")}</option>
										<option value="LEADERSHIP">{tr("Liderazgo")}</option>
										<option value="RESTRICTED">{tr("Restringido")}</option>
									</select>
								</label>
							</div>
							<label>{tr("Notas")}<textarea
									rows={5}
									value={recordForm.notes}
									onChange={(e) =>
										setRecordForm({ ...recordForm, notes: e.target.value })
									}
								/>
							</label>
							<label>{tr("Referencia")}<input
									value={recordForm.reference}
									onChange={(e) =>
										setRecordForm({ ...recordForm, reference: e.target.value })
									}
								/>
							</label>
						</>
					)}
				</HubModal>
			)}
		</Shell>
	);
}

function SectionHead({
	eyebrow,
	title,
	text,
	action,
}: {
	eyebrow: string;
	title: string;
	text: string;
	action?: React.ReactNode;
}) {
	return (
		<header className="hub-section-head">
			<div>
				<span className="eyebrow">{eyebrow}</span>
				<h2>{title}</h2>
				<p>{text}</p>
			</div>
			{action}
		</header>
	);
}
function SearchBar({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
  const { tr } = useExperience();

	return (
		<label className="hub-search">
			<span className="sr-only">{tr("Buscar")}</span>
			<Search />
			<input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
			/>
		</label>
	);
}
function TeamSelect({
	label,
	value,
	team,
	onChange,
	required = false,
}: {
	label: string;
	value: string;
	team: TeamMember[];
	onChange: (value: string) => void;
	required?: boolean;
}) {
	return (
		<label>
			{label}
			<select
				required={required}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">{required ? 'Seleccionar…' : 'Sin asignar'}</option>
				{team.map((item) => (
					<option value={item.id} key={item.id}>
						{item.name} · {item.role}
					</option>
				))}
			</select>
		</label>
	);
}
function HubModal({
	title,
	error,
	onClose,
	onSubmit,
	busy,
	children,
}: {
	title: string;
	error: string;
	onClose: () => void;
	onSubmit: (event: FormEvent) => void;
	busy: boolean;
	children: React.ReactNode;
}) {
  const { tr } = useExperience();

	return (
		<Modal busy={busy} label={title} onClose={onClose}>
			<form className="modal-card premium-modal hub-modal" onSubmit={onSubmit}>
				<button data-dialog-close
					type="button"
					className="modal-close"
					onClick={onClose}
					aria-label={tr("Cerrar")}
				>
					<X />
				</button>
				<span className="modal-symbol">
					<Sparkles />
				</span>
				<span className="eyebrow">{tr("ESPACIO DE TRABAJO")}</span>
				<h2>{title}</h2>
				{error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
				{children}
				<div className="modal-actions">
					<button data-dialog-close
						type="button"
						className="button button-ghost"
						onClick={onClose}
					>{tr("Cancelar")}</button>
					<button
						type="submit"
						className="button button-primary"
						disabled={busy}
					>
						{busy ? tr("Guardando…") : tr("Guardar")}
					</button>
				</div>
			</form>
		</Modal>
	);
}
function departmentRoleLabel(role: string) {
	return ({ DIRECTOR: 'Director/a', ASSISTANT_DIRECTOR: 'Subdirector/a', DEPARTMENT_SECRETARY: 'Secretaría departamental', PLANNER: 'Planificador/a', CONTRIBUTOR: 'Colaborador/a', VIEWER: 'Consulta' } as Record<string, string>)[role] ?? role;
}

function modalTitle(modal: ModalKind) {
	return (
		(
			{
				plan: 'Crear plan anual',
				objective: 'Agregar objetivo',
				initiative: 'Nueva iniciativa',
				assignment: 'Asignar responsabilidad',
				task: 'Nueva tarea',
				budget: 'Movimiento presupuestario',
				meeting: 'Programar reunión',
				minutes: 'Cerrar reunión y guardar acta',
				decision: 'Registrar acuerdo formal',
				comment: 'Comentario y menciones',
				kpi: 'Nuevo indicador',
				record: 'Nuevo registro ministerial',
			} as Record<ModalKind, string>
		)[modal] || ''
	);
}
