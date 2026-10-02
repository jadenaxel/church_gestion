import { describe, expect, it } from 'vitest';
import { activityCustomDataChanged, activityCustomDataPatch, copyActivityCustomData, savedActivityCustomFields } from '../../apps/web/components/activity-custom-edit.js';
import { activityFieldText, builtinFieldCatalog, type ActivityFormField } from '../../apps/web/lib/activity-form.js';
import { translateText } from '../../apps/web/lib/i18n.js';

const field: ActivityFormField = {
  id: 'private_note', kind: 'custom', type: 'textarea', label: 'Inicio', placeholder: 'Calendario', helpText: '',
  required: true, visible: true, width: 'full', options: [], copySource: { label: 'CUSTOM' }
};

describe('editing an activity with its persisted custom form', () => {
  it('uses only visible custom fields from the saved snapshot without inventing legacy fields', () => {
    expect(savedActivityCustomFields(undefined)).toEqual([]);
    expect(savedActivityCustomFields(null)).toEqual([]);
    expect(savedActivityCustomFields({})).toEqual([]);
    const snapshot = { fields: [builtinFieldCatalog[0]!, field, { ...field, id: 'hidden_note', visible: false }] };
    expect(savedActivityCustomFields(snapshot)).toEqual([field]);
    expect(snapshot.fields).toHaveLength(3);
  });

  it('preserves saved user labels/placeholders when switching interface language', () => {
    const saved = savedActivityCustomFields({ fields: [field] })[0]!;
    for (const locale of ['en', 'fr'] as const) {
      const tr = (value: string) => translateText(locale, value);
      expect(activityFieldText(saved, 'label', tr)).toBe('Inicio');
      expect(activityFieldText(saved, 'placeholder', tr)).toBe('Calendario');
    }
  });

  it('omits unchanged customData rather than defaulting or resetting other saved fields', () => {
    expect(activityCustomDataPatch({}, {})).toEqual({});
    const original = { private_note: 'fixture', hidden_note: 'keep', confirmed: false, total: 0, optional: null };
    const reordered = { optional: null, total: 0, confirmed: false, hidden_note: 'keep', private_note: 'fixture' };
    expect(activityCustomDataChanged(original, reordered)).toBe(false);
    expect(activityCustomDataPatch(original, reordered)).toEqual({});
  });

  it('sends exactly the edited data while preserving hidden/unrepresented canonical values', () => {
    const original = { private_note: 'before', hidden_note: 'keep', confirmed: true, total: 3, optional: null };
    const edited = { ...original, private_note: 'after' };
    const patch = activityCustomDataPatch(original, edited);
    expect(patch).toEqual({ customData: edited });
    expect(patch.customData).not.toBe(edited);
    expect(original.private_note).toBe('before');
    expect(patch).not.toHaveProperty('options');
    expect(patch).not.toHaveProperty('recurrence');
    expect(patch).not.toHaveProperty('form_schema_snapshot');
  });

  it('detects canonical number/boolean/null changes without converting them to display strings', () => {
    expect(activityCustomDataChanged({ total: 0 }, { total: '0' })).toBe(true);
    expect(activityCustomDataChanged({ confirmed: false }, { confirmed: true })).toBe(true);
    expect(activityCustomDataChanged({ optional: null }, { optional: '' })).toBe(true);
    expect(copyActivityCustomData({ total: 0, confirmed: false, optional: null })).toEqual({ total: 0, confirmed: false, optional: null });
  });

  it('clones the baseline so a changed form cannot silently mark itself saved', () => {
    const current = copyActivityCustomData({ private_note: 'before' });
    const baseline = copyActivityCustomData(current);
    current.private_note = 'after';
    expect(baseline.private_note).toBe('before');
    expect(activityCustomDataChanged(baseline, current)).toBe(true);
  });
});
