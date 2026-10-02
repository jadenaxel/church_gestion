import { describe, expect, it } from 'vitest';
import type { Role } from '../../packages/contracts/src/index.js';
import {
	canReadMinistryRecord,
	departmentAccess,
} from '../../services/department-operations-service/src/authorization.js';

describe('privacidad de registros y comentarios departamentales', () => {
	it.each(['VIEWER', 'CONTRIBUTOR'])('permite colaboración de equipo, no registros restringidos: %s', (role) => {
		const access = departmentAccess({ roles: ['VIEWER'] }, role);
		expect(canReadMinistryRecord(access, 'TEAM')).toBe(true);
		expect(canReadMinistryRecord(access, 'LEADERSHIP')).toBe(false);
		expect(canReadMinistryRecord(access, 'RESTRICTED')).toBe(false);
	});
	it.each(['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER'])('conserva acceso existente del equipo responsable: %s', (role) => {
		expect(canReadMinistryRecord(departmentAccess({ roles: ['DEPARTMENT_LEADER'] }, role), 'RESTRICTED')).toBe(true);
	});
	it.each(['TENANT_ADMIN', 'BOARD_SECRETARY', 'PASTOR'] as Role[])('conserva supervisión autorizada sin membresía: %s', (role) => {
		expect(canReadMinistryRecord(departmentAccess({ roles: [role] }, null), 'LEADERSHIP')).toBe(true);
	});
	it('no concede acceso a un director ajeno ni ante visibilidad desconocida', () => {
		const outsider = departmentAccess({ roles: ['DEPARTMENT_LEADER'] }, null);
		expect(canReadMinistryRecord(outsider, 'TEAM')).toBe(false);
		expect(canReadMinistryRecord(outsider, 'RESTRICTED')).toBe(false);
		expect(canReadMinistryRecord(departmentAccess({ roles: ['TENANT_ADMIN'] }, null), 'unknown')).toBe(false);
	});
});
