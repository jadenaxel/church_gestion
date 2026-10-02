import { describe, expect, it } from 'vitest';
import { fieldCopySourceSchema, invalidSystemFieldCopy, invalidSystemTemplateCopy, systemFieldCopySource } from '../../services/calendar-service/src/activity-form-provenance.js';
const defaultField = { kind: 'builtin', source: 'title', label: 'Nombre de la actividad', placeholder: 'Ej. Encuentro de familias', helpText: '', options: [] };
describe('backend explicit activity form copy provenance', () => {
  it('keeps legacy metadata absent even when its text equals a known default', () => {
    expect(fieldCopySourceSchema.parse(undefined)).toBeUndefined(); expect(invalidSystemFieldCopy(defaultField)).toEqual([]);
    expect(Object.hasOwn(defaultField, 'copySource')).toBe(false);
  });
  it('accepts only explicitly declared matching builtin system copy', () => {
    expect(invalidSystemFieldCopy({ ...defaultField, copySource: systemFieldCopySource })).toEqual([]);
    expect(invalidSystemFieldCopy({ ...defaultField, label: 'Original authored name', copySource: systemFieldCopySource })).toEqual(['label']);
  });
  it('never promotes custom fields or authored strings into system translations', () => {
    expect(invalidSystemFieldCopy({ ...defaultField, kind: 'custom', source: undefined, copySource: { label: 'SYSTEM' } })).toEqual(['label']);
    expect(invalidSystemFieldCopy({ ...defaultField, kind: 'custom', source: undefined, label: 'Nombre de la actividad', copySource: { label: 'CUSTOM' } })).toEqual([]);
  });
  it('validates template metadata independently for each property', () => {
    expect(invalidSystemTemplateCopy({ title: 'Original authored title', description: '', submitLabel: 'My action', copySource: { title: 'CUSTOM', submitLabel: 'SYSTEM' } })).toEqual(['submitLabel']);
  });
});
