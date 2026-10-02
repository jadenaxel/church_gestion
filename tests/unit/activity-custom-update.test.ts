import { describe, expect, it } from 'vitest';
import { preserveActivityCustomData } from '../../services/calendar-service/src/activity-custom-update.js';

describe('stored activity custom-data boundary', () => {
  const visible = new Set(['visible_field']);
  it('preserves omitted historical and hidden values while editing visible fields', () => {
    expect(preserveActivityCustomData({ visible_field: 'Before', hidden_field: 'Retained', historic_field: false }, { visible_field: 'After' }, visible))
      .toEqual({ visible_field: 'After', hidden_field: 'Retained', historic_field: false });
  });
  it('allows unchanged historical scalars from the existing editor without making them writable', () => {
    expect(preserveActivityCustomData({ hidden_field: 0 }, { visible_field: '', hidden_field: 0 }, visible)).toEqual({ visible_field: '', hidden_field: 0 });
    expect(() => preserveActivityCustomData({ hidden_field: 0 }, { hidden_field: 1 }, visible)).toThrow(expect.objectContaining({ code: 'CUSTOM_FIELD_READONLY' }));
  });
  it('refuses an unregistered key rather than accepting arbitrary custom input', () => {
    expect(() => preserveActivityCustomData({}, { unknown_field: 'New' }, visible)).toThrow(expect.objectContaining({ code: 'UNKNOWN_CUSTOM_FIELD' }));
  });
  it('does not mutate inputs or erase historical structured data omitted by the scalar form', () => {
    const old = { legacy_field: { retained: true } }, edit = { visible_field: false };
    const result = preserveActivityCustomData(old, edit, visible);
    expect(result).toEqual({ legacy_field: { retained: true }, visible_field: false });
    expect(old).toEqual({ legacy_field: { retained: true } }); expect(edit).toEqual({ visible_field: false });
  });
  it('preserves legacy own keys without invoking a prototype setter', () => {
    const saved = JSON.parse('{"__proto__":{"synthetic_property":true}}');
    const result = preserveActivityCustomData(saved, { visible_field: 'After' }, visible);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual({ ...saved, visible_field: 'After' });
    expect(({} as { synthetic_property?: boolean }).synthetic_property).toBeUndefined();
  });
});
