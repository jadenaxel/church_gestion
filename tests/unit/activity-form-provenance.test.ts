import { describe, expect, it } from 'vitest';
import { activityFieldOptions, activityFieldText, activityTemplateText, builtinFieldCatalog, cloneField, customizeActivityField, customizeActivityTemplate, type ActivityFormTemplate } from '../../apps/web/lib/activity-form.js';
import { translateText } from '../../apps/web/lib/i18n.js';
const en = (value: string) => translateText('en',value);
const fr = (value: string) => translateText('fr',value);
const template: ActivityFormTemplate = {title:'Solicitud de actividad',description:'Calendario',submitLabel:'Crear y enviar',fields:[],copySource:{title:'SYSTEM',submitLabel:'SYSTEM'}};
describe('explicit activity-form copy provenance', () => {
  it('localizes only explicitly generated system defaults', () => {
    const field = builtinFieldCatalog.find((item)=>item.source==='description')!;
    expect(activityFieldText(field,'label',en)).toBe('Description');
    expect(activityFieldText(field,'label',fr)).toBe('Description');
    expect(activityTemplateText(template,'title',en)).not.toBe(template.title);
  });
  it('preserves legacy and custom words even when they match system copy', () => {
    const field = cloneField(builtinFieldCatalog.find((item)=>item.source==='description')!); delete field.copySource;
    expect(activityFieldText(field,'label',en)).toBe('Descripción');
    expect(activityTemplateText(template,'description',en)).toBe('Calendario');
    const custom = {...field,kind:'custom' as const,label:'Inicio',copySource:{label:'SYSTEM' as const}};
    expect(activityFieldText(custom,'label',en)).toBe('Inicio');
  });
  it('marks exactly the edited property custom while preserving other system defaults', () => {
    const field = customizeActivityField(builtinFieldCatalog[0]!,{label:'Inicio'});
    expect(field.copySource).toMatchObject({label:'CUSTOM',placeholder:'SYSTEM'});
    expect(activityFieldText(field,'label',en)).toBe('Inicio');
    expect(activityFieldText(field,'placeholder',en)).not.toBe(field.placeholder);
    const changed = customizeActivityTemplate(template,'title','Inicio');
    expect(activityTemplateText(changed,'title',fr)).toBe('Inicio');
    expect(changed.copySource?.submitLabel).toBe('SYSTEM');
  });
  it('localizes displayed system options without mutating canonical values or custom options', () => {
    const field = builtinFieldCatalog.find((item)=>item.source==='modality')!;
    expect(activityFieldOptions(field,en)).not.toEqual(field.options);
    expect(field.options).toEqual(['Presencial','Virtual','Híbrida']);
    const custom = customizeActivityField(field,{options:['Inicio','Calendario']});
    expect(activityFieldOptions(custom,en)).toEqual(['Inicio','Calendario']);
    const clone = cloneField(field); clone.copySource!.label='CUSTOM'; expect(field.copySource?.label).toBe('SYSTEM');
  });
});
