import type { ActivityFormField, ActivityFormTemplate } from '../lib/activity-form.js';

export type ActivityCustomData = Record<string, string | number | boolean | null>;

/** Only the persisted snapshot governs editing; no fallback to today's published form. */
export function savedActivityCustomFields(snapshot: Partial<ActivityFormTemplate> | null | undefined): ActivityFormField[] {
  return Array.isArray(snapshot?.fields) ? snapshot.fields.filter((field) => field?.kind === 'custom' && field.visible) : [];
}

export function copyActivityCustomData(data: ActivityCustomData | null | undefined): ActivityCustomData {
  return { ...(data ?? {}) };
}

export function activityCustomDataChanged(original: ActivityCustomData, current: ActivityCustomData): boolean {
  const keys = Object.keys(original);
  return keys.length !== Object.keys(current).length
    || keys.some((key) => !Object.hasOwn(current, key) || !Object.is(original[key], current[key]));
}

/** Omit unchanged data entirely, preserving legacy/no-snapshot records and unrelated fields. */
export function activityCustomDataPatch(original: ActivityCustomData, current: ActivityCustomData): { customData?: ActivityCustomData } {
  return activityCustomDataChanged(original, current) ? { customData: copyActivityCustomData(current) } : {};
}
