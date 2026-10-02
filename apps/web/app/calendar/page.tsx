"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS, es, fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge, Empty, Notice, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useExperience } from '@/components/experience-provider';
import { frontendCapabilities, optionalItems, type FrontendPrincipal } from '@/components/frontend-capabilities';

type Session = { id: string; startsAt: string; endsAt: string };
type Activity = {
  id: string;
  title: string;
  status: string;
  department: string;
  department_color: string;
  venue: string | null;
  sessions: Session[];
  kind?: "ACTIVITY" | "REVIEW_SESSION" | "ELDER_ROTATION" | "ELDER_PROGRAM" | "MISSIONARY_MINUTE" | "MISSIONARY_INITIATIVE" | "EVANGELISTIC_CAMPAIGN";
  informational?: boolean;
};
type ReviewAgendaItem = { id: string; title: string; startsAt: string; endsAt: string; location: string | null; status: string; invitationStatus: string; caseCount: number };
type ActivityFilter = {
  status?: string | undefined;
  attention?: string | undefined;
  departmentId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  label?: string | undefined;
  department?: string | undefined;
};
type AgendaItem = { activity: Activity; session: Session | null };

const allowedStatuses = new Set(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"]);
const allowedAttention = new Set(["OVERDUE", "INCOMPLETE", "COMPLETED", "DUE_SOON", "ACTION_REQUIRED", "PLANNED"]);
const statusLabels: Record<string, string> = {
  DRAFT: "Borradores",
  SUBMITTED: "Pendientes de aprobación",
  UNDER_REVIEW: "Actividades en revisión",
  APPROVED: "Actividades aprobadas",
  REJECTED: "Actividades rechazadas",
  CANCELLED: "Actividades canceladas",
  COMPLETED: "Actividades completadas",
  CHANGES_REQUESTED: "Actividades con cambios solicitados",
};
const attentionLabels: Record<string, string> = {
  OVERDUE: "Actividades vencidas",
  INCOMPLETE: "Actividades sin completar",
  COMPLETED: "Actividades completadas",
  DUE_SOON: "Actividades de los próximos 7 días",
  ACTION_REQUIRED: "Actividades que requieren atención",
  PLANNED: "Actividades planificadas",
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validIsoDate(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export default function CalendarPage() {
  const { tr, locale } = useExperience();
  const dateLocale = { es, en: enUS, fr }[locale];

  const [month, setMonth] = useState(new Date());
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [filters, setFilters] = useState<ActivityFilter | null>(null);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<FrontendPrincipal | null>(null);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState(false);
  const [reload, setReload] = useState(0);
  const capabilities = frontendCapabilities(user);
  useEffect(() => { const controller = new AbortController(); void api<{ user: FrontendPrincipal }>('/me', { signal: controller.signal }).then((response) => setUser(response.user)).catch(() => undefined); return () => controller.abort(); }, []);

  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const rangeStart = start.toISOString();
  const rangeEnd = end.toISOString();
  const days = eachDayOfInterval({ start, end });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedStatus = params.get("status") ?? undefined;
    const requestedAttention = params.get("attention") ?? undefined;
    const requestedDepartmentId = params.get("departmentId") ?? undefined;
    const requestedFrom = validIsoDate(params.get("from"));
    const requestedTo = validIsoDate(params.get("to"));
    const nextFilters: ActivityFilter = {
      status: requestedStatus && allowedStatuses.has(requestedStatus) ? requestedStatus : undefined,
      attention: requestedAttention && allowedAttention.has(requestedAttention) ? requestedAttention : undefined,
      departmentId:
        requestedDepartmentId && uuidPattern.test(requestedDepartmentId) ? requestedDepartmentId : undefined,
      from: requestedFrom,
      to: requestedTo,
      label: params.get("label")?.slice(0, 80) || undefined,
      department: params.get("department")?.slice(0, 80) || undefined,
    };
    setFilters(nextFilters);
    if (nextFilters.from) setMonth(new Date(nextFilters.from));
    if (nextFilters.status || nextFilters.departmentId || nextFilters.attention || nextFilters.from || nextFilters.to) setView("agenda");
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: A manual retry requests the same range again.
  useEffect(() => {
    if (filters === null) return;

    const query = new URLSearchParams({ limit: "200" });
    if (filters.status) query.set("status", filters.status);
    if (filters.attention) query.set("attention", filters.attention);
    if (filters.departmentId) query.set("departmentId", filters.departmentId);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (!filters.status && !filters.departmentId && !filters.attention && !filters.from && !filters.to) {
      query.set("from", rangeStart);
      query.set("to", rangeEnd);
    }

    const includeReviewSessions = !filters.status && !filters.departmentId && !filters.attention;
    const meetingQuery = new URLSearchParams();
    meetingQuery.set("from", filters.from ?? rangeStart);
    meetingQuery.set("to", filters.to ?? rangeEnd);
    const controller = new AbortController();
    setActivities(null); setError(''); setPartial(false);
    Promise.allSettled([
      api<{ items: Activity[] }>(`/activities?${query.toString()}`, { signal: controller.signal }),
      includeReviewSessions
        ? api<{ items: ReviewAgendaItem[] }>(`/review-sessions/my-agenda?${meetingQuery.toString()}`, { signal: controller.signal })
        : Promise.resolve({ items: [] as ReviewAgendaItem[] }),
      includeReviewSessions
        ? api<{ items: Activity[] }>(`/elders/calendar?${meetingQuery.toString()}`, { signal: controller.signal })
        : Promise.resolve({ items: [] as Activity[] }),
      includeReviewSessions
        ? api<{ items: Activity[] }>(`/personal-ministries/calendar?${meetingQuery.toString()}`, { signal: controller.signal })
        : Promise.resolve({ items: [] as Activity[] })
    ])
      .then(([response, meetingResult, elderResult, missionaryResult]) => {
        if (controller.signal.aborted) return;
        if (response.status === 'rejected') throw response.reason;
        const meetings = optionalItems(meetingResult); const elderAgenda = optionalItems(elderResult); const missionaryAgenda = optionalItems(missionaryResult);
        setPartial(meetings.failed || elderAgenda.failed || missionaryAgenda.failed);
        setActivities([
          ...response.value.items.map((activity) => ({ ...activity, kind: "ACTIVITY" as const })),
          ...meetings.items.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            status: meeting.invitationStatus === "CONFIRMED" ? "CONFIRMED" : meeting.status,
            department: `Junta de revisión · ${meeting.caseCount} caso(s)`,
            department_color: "#b0760c",
            venue: meeting.location,
            kind: "REVIEW_SESSION" as const,
            sessions: [{ id: `review-${meeting.id}`, startsAt: meeting.startsAt, endsAt: meeting.endsAt }]
          })),
          ...elderAgenda.items,
          ...missionaryAgenda.items
        ]);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No fue posible cargar el calendario.');
      });

    return () => {
      controller.abort();
    };
  }, [filters, rangeStart, rangeEnd, reload]);

  const isFiltered = Boolean(filters?.status || filters?.departmentId || filters?.attention || filters?.from || filters?.to);
  const filterTitle =
    filters?.label ||
    (filters?.attention ? attentionLabels[filters.attention] : undefined) ||
    (filters?.department ? `Departamento: ${filters.department}` : undefined) ||
    (filters?.status ? statusLabels[filters.status] : undefined) ||
    "Resultados filtrados";
  const visibleActivities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return activities ?? [];
    return (activities ?? []).filter((activity) =>
      `${activity.title} ${activity.department} ${activity.venue ?? ""} ${activity.status}`.toLocaleLowerCase("es").includes(query),
    );
  }, [activities, search]);
  const agendaItems = useMemo<AgendaItem[]>(() => {
    const items: AgendaItem[] = [];
    for (const activity of visibleActivities) {
      if (activity.sessions.length === 0) items.push({ activity, session: null });
      else for (const session of activity.sessions) items.push({ activity, session });
    }
    return items;
  }, [visibleActivities]);

  function eventsOn(day: Date) {
    return visibleActivities.filter((activity) =>
      activity.sessions.some((session) => {
        const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
        return new Date(session.startsAt) <= dayEnd && new Date(session.endsAt) >= dayStart;
      }),
    );
  }

  function activityHref(activity: Activity) {
    if (activity.kind === "REVIEW_SESSION") return `/reviews?sessionId=${activity.id}`;
    if (activity.kind === "ELDER_ROTATION") return `/elders?rotationId=${activity.id}`;
    if (activity.kind === "ELDER_PROGRAM") return `/elders?programId=${activity.id}`;
    if (activity.kind === 'MISSIONARY_MINUTE') return '/personal-ministries?view=minutes';
    if (activity.kind === 'MISSIONARY_INITIATIVE') return '/personal-ministries?view=strategy';
    if (activity.kind === 'EVANGELISTIC_CAMPAIGN') return '/personal-ministries?view=campaigns';
    return `/activities/${activity.id}`;
  }

  return (
    <Shell
      title={tr("Calendario")}
      eyebrow={tr("Planificación congregacional")}
      actions={
        capabilities.canCreateActivity && <Link href="/activities/new" className="button button-primary desktop-action">{tr("Nueva actividad")}</Link>
      }
    >
        {error && <Notice tone="danger" title={tr('No fue posible cargar el calendario.')}>{tr(error)} <button type="button" className="button button-ghost compact" onClick={() => setReload((value) => value + 1)}>{tr('Reintentar')}</button></Notice>}
        {partial && <Notice tone="warning" title={tr('Calendario parcialmente disponible')}>{tr('Algunas agendas no pudieron cargarse. Los resultados visibles pueden estar incompletos.')} <button type="button" className="button button-ghost compact" onClick={() => setReload((value) => value + 1)}>{tr('Reintentar')}</button></Notice>}
        <section className="calendar-toolbar panel">
          <div className="month-control">
            <button type="button" className="icon-button" aria-label={tr("Mes anterior")} onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft />
            </button>
            <h2>{format(month, "MMMM yyyy", { locale: dateLocale })}</h2>
            <button type="button" className="icon-button" aria-label={tr("Mes siguiente")} onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight />
            </button>
          </div>
          <div className="segmented">
            <button type="button" aria-pressed={view === 'month'} className={view === "month" ? "active" : ""} onClick={() => setView("month")}>{tr("Mes")}</button>
            <button type="button" aria-pressed={view === 'agenda'} className={view === "agenda" ? "active" : ""} onClick={() => setView("agenda")}>{tr("Agenda")}</button>
          </div>
          <label className="premium-search calendar-search"><Search /><input aria-label={tr("Buscar en el calendario")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Buscar actividad, junta, departamento o lugar…")} />{search && <button type="button" onClick={() => setSearch("")} aria-label={tr("Limpiar búsqueda del calendario")}><X /></button>}</label>
          <span className="calendar-result-count">{visibleActivities.length}{tr(" de ")}{activities?.length ?? 0}</span>
        </section>

        {isFiltered && (
          <section className="panel calendar-filter-summary" aria-live="polite">
            <div className="filter-summary-icon" aria-hidden="true">
              <SlidersHorizontal />
            </div>
            <div>
              <span className="eyebrow">{tr("Vista filtrada")}</span>
              <h2>{filterTitle}</h2>
              <p>
                {activities === null
                  ? tr("Consultando actividades…")
                  : `${visibleActivities.length} ${visibleActivities.length === 1 ? "actividad visible" : "actividades visibles"}.`}
              </p>
            </div>
            <a href="/calendar" className="button button-ghost">{tr("Limpiar filtro")}</a>
          </section>
        )}

        {activities === null ? error ? null : (
          <Spinner />
        ) : visibleActivities.length === 0 && search ? (
          <Empty icon={<Search />} title={tr("No encontramos coincidencias")} text={tr("Busca por actividad, junta, departamento o lugar.")} />
        ) : view === "month" ? (
          <section className="calendar-grid panel">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
              <div className="weekday" key={day}>
                {tr(day)}
              </div>
            ))}
            {days.map((day) => (
              <div
                className={`calendar-day ${!isSameMonth(day, month) ? "muted" : ""} ${isSameDay(day, new Date()) ? "today" : ""}`}
                key={day.toISOString()}
              >
                <span className="day-number">{format(day, "d")}</span>
                <div className="day-events">
                  {eventsOn(day)
                    .slice(0, 3)
                    .map((activity) => (
                      <Link
                        href={activityHref(activity)}
                        className={`calendar-event ${activity.kind === "REVIEW_SESSION" ? "review-session-event" : ""} ${activity.kind?.startsWith("ELDER_") ? "elder-calendar-event" : ""}`}
                        key={activity.id}
                        style={{ "--event-color": activity.department_color } as React.CSSProperties}
                      >
                        {activity.title}
                      </Link>
                    ))}
                  {eventsOn(day).length > 3 && <small>+{eventsOn(day).length - 3}{tr(" más")}</small>}
                </div>
              </div>
            ))}
          </section>
        ) : agendaItems.length === 0 ? (
          <Empty title={tr("No hay actividades para esta vista")} text={tr("Prueba otro periodo o limpia el filtro aplicado.")} />
        ) : (
          <section className="panel agenda-list premium-scroll-list calendar-agenda-scroll" aria-label={tr("Agenda de actividades")}>
            {agendaItems.map(({ activity, session }) => (
              <Link
                href={activityHref(activity)}
                className="agenda-row"
                key={`${activity.id}-${session?.id ?? "without-session"}`}
              >
                <div className="agenda-date">
                  <strong>{session ? format(new Date(session.startsAt), "d") : "—"}</strong>
                  <span>{session ? format(new Date(session.startsAt), "MMM", { locale: dateLocale }) : tr("sin fecha")}</span>
                </div>
                <i style={{ background: activity.department_color }} />
                <div>
                  <strong>{activity.title}</strong>
                  <span>
                    {activity.department}
                    {activity.venue ? ` · ${activity.venue}` : ""}
                  </span>
                </div>
                <Badge status={activity.status} />
              </Link>
            ))}
          </section>
        )}
    </Shell>
  );
}
