export type RosterFilters = { search: string; sex: string; status: string; focus: 'ALL' | 'BIRTHDAYS' | 'PHOTO' };
type FilterableMember = { id: string; memberCode: string; displayName: string; email: string; phone: string; whatsapp: string; sex: string; membershipStatus: string; active: boolean; hasPhoto: boolean };

/** Birthday membership is authoritative from the same server subset used by the KPI. */
export function filterRoster<T extends FilterableMember>(members: T[], filters: RosterFilters, birthdayMemberIds: string[] = []): T[] {
  const birthdays = new Set(birthdayMemberIds);
  const term = filters.search.trim().toLocaleLowerCase();
  return members.filter((member) => {
    const search = !term || `${member.memberCode} ${member.displayName} ${member.email} ${member.phone} ${member.whatsapp}`.toLocaleLowerCase().includes(term);
    const sex = filters.sex === 'ALL' || member.sex === filters.sex;
    const status = filters.status === 'ALL' || (filters.status === 'ACTIVE' ? member.active : member.membershipStatus === filters.status);
    const focus = filters.focus === 'ALL' || (filters.focus === 'PHOTO' ? member.hasPhoto : birthdays.has(member.id));
    return search && sex && status && focus;
  });
}
