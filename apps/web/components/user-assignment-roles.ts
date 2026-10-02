export function toggleAssignedRole(current: string[], role: string, selected: boolean): string[] {
  return selected ? [...new Set([...current, role])] : current.filter((value) => value !== role);
}

/** Apply only the administrator's explicit additions/removals to a freshly read account. */
export function mergeAssignedRoleChanges(original: string[], edited: string[], latest: string[]): string[] {
  const removed = new Set(original.filter((role) => !edited.includes(role)));
  const added = edited.filter((role) => !original.includes(role));
  return [...new Set([...latest.filter((role) => !removed.has(role)), ...added])];
}

export function creationAssignedRoles(profile: string, additional: string[]): string[] {
  return [...new Set([profile === 'DEPARTMENT' ? 'VIEWER' : profile, ...additional])];
}
