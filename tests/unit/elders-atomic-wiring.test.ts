import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../services/elders-service/src/main.ts', import.meta.url), 'utf8');
const mutations = [
  'createDepartmentAssignments', 'updateDepartmentAssignment', 'createAnnualRotationPlan',
  'createRotation', 'updateRotation', 'createServiceTemplate', 'applyPlatformTemplate',
  'savePlatform', 'createProgram', 'updateProgram', 'uploadMedia',
];

describe('elders atomic mutation wiring (structural guard, not runtime evidence)', () => {
  it.each(mutations)('%s keeps every audit and persisted notice inside its transaction', (name) => {
    const start = source.indexOf(`  async ${name}(`);
    expect(start).toBeGreaterThan(0);
    const method = source.slice(start, source.indexOf('\n  @', start + 1));
    expect(method.match(/withTransaction\(pool, async \(client\) => \{/g)).toHaveLength(1);
    const transactionStart = method.indexOf('withTransaction(pool, async (client) => {');
    const transactionEnd = method.lastIndexOf('    });');
    expect(transactionEnd).toBeGreaterThan(transactionStart);
    expect(method.match(/await audit\(/g)).toHaveLength(1);
    const effects = [...method.matchAll(/await (?:audit|notify|this\.notifyPublication)\((\w+)/g)];
    for (const effect of effects) {
      expect(effect[1]).toBe('client');
      expect(effect.index).toBeGreaterThan(transactionStart);
      expect(effect.index).toBeLessThan(transactionEnd);
    }
    expect(method).not.toMatch(/await pool\.query(?:<[^>]*>)?\(\s*`\s*(?:INSERT|UPDATE|DELETE)/);
  });
});
