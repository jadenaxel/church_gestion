type Session = { startsAt: string; endsAt: string; setupMinutes: number; teardownMinutes: number };
export type EditableScheduleOption = { id: string; label: string; preference: number; is_selected: boolean; status?: string; sessions: Session[] };

export function selectedScheduleOption(options: EditableScheduleOption[]) {
  const active = options.filter((option) => !['RELEASED', 'REJECTED'].includes(option.status ?? ''));
  return active.find((option) => option.is_selected) ?? active.toSorted((a, b) => a.preference - b.preference)[0];
}

/** Modify exactly the displayed block; keep other occurrences and all active alternatives. */
export function editedScheduleOptions(options: EditableScheduleOption[], startsAt: string, endsAt: string) {
  const start = new Date(startsAt); const end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error('La finalización debe ser posterior al inicio.');
  const selected = selectedScheduleOption(options);
  if (!selected?.sessions.length) throw new Error('La actividad no tiene un bloque de horario editable.');
  const active = options.filter((option) => !['RELEASED', 'REJECTED'].includes(option.status ?? ''));
  if (active.some((option) => option.sessions.length > 2000)) throw new Error('Esta serie requiere una edición de calendario completa. No se descartará ninguna sesión.');
  // Approval selects the first preference. Keep the already-selected option first, not a different alternative.
  const ordered = [selected, ...active.filter((option) => option.id !== selected.id).toSorted((a, b) => a.preference - b.preference)];
  return ordered.map((option, index) => ({
    label: option.label, preference: index + 1,
    sessions: option.sessions.map((session, sessionIndex) => option.id === selected.id && sessionIndex === 0
      ? { ...session, startsAt: start.toISOString(), endsAt: end.toISOString() } : { ...session })
  }));
}
