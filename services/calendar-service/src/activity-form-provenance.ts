import { z } from 'zod';
const origin = z.enum(['SYSTEM', 'CUSTOM']);
export const fieldCopySourceSchema = z.object({ label: origin.optional(), placeholder: origin.optional(), helpText: origin.optional(), options: origin.optional() }).optional();
export const templateCopySourceSchema = z.object({ title: origin.optional(), description: origin.optional(), submitLabel: origin.optional() }).optional();
export const defaultTemplateCopy = { title: 'Solicitud de actividad', description: 'Completa la información para coordinar, revisar y calendarizar la actividad.', submitLabel: 'Crear y enviar' } as const;
const fieldCopy: Record<string, { label: string; placeholder?: string; options?: string[] }> = {
  title: { label: 'Nombre de la actividad', placeholder: 'Ej. Encuentro de familias' },
  description: { label: 'Descripción', placeholder: 'Explica brevemente el propósito y dinámica…' },
  objective: { label: 'Objetivo', placeholder: '¿Qué resultado espera alcanzar?' },
  departmentId: { label: 'Departamento' }, venueId: { label: 'Lugar' },
  responsibleName: { label: 'Responsable', placeholder: 'Nombre completo' },
  contactInfo: { label: 'Contacto', placeholder: 'Teléfono o correo' }, estimatedAttendance: { label: 'Asistencia estimada' },
  category: { label: 'Categoría' }, modality: { label: 'Modalidad', options: ['Presencial', 'Virtual', 'Híbrida'] },
  visibility: { label: 'Visibilidad', options: ['Toda la iglesia', 'Solo liderazgo', 'Público'] }, priority: { label: 'Prioridad' },
  tags: { label: 'Etiquetas separadas por coma', placeholder: 'familia, misión, jóvenes' }, internalNotes: { label: 'Notas internas' },
};
export const systemFieldCopySource = { label: 'SYSTEM', placeholder: 'SYSTEM', helpText: 'SYSTEM', options: 'SYSTEM' } as const;
export const systemTemplateCopySource = { title: 'SYSTEM', description: 'SYSTEM', submitLabel: 'SYSTEM' } as const;
export function invalidSystemFieldCopy(field: { kind: string; source?: string | undefined; label: string; placeholder: string; helpText: string; options: string[]; copySource?: z.infer<typeof fieldCopySourceSchema> }): string[] {
  const expected = field.source ? fieldCopy[field.source] : undefined;
  return Object.entries(field.copySource ?? {}).filter(([property, source]) => {
    if (source !== 'SYSTEM') return false;
    if (field.kind !== 'builtin' || !expected) return true;
    const value = property === 'label' ? expected.label : property === 'placeholder' ? expected.placeholder ?? '' : property === 'options' ? expected.options ?? [] : '';
    return JSON.stringify(field[property as 'label' | 'placeholder' | 'helpText' | 'options']) !== JSON.stringify(value);
  }).map(([property]) => property);
}
export function invalidSystemTemplateCopy(template: { title: string; description: string; submitLabel: string; copySource?: z.infer<typeof templateCopySourceSchema> }): string[] {
  return Object.entries(template.copySource ?? {}).filter(([property, source]) => source === 'SYSTEM' && template[property as keyof typeof defaultTemplateCopy] !== defaultTemplateCopy[property as keyof typeof defaultTemplateCopy]).map(([property]) => property);
}
