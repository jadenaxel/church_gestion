export type ActivityFieldType = 'text' | 'textarea' | 'number' | 'email' | 'tel' | 'date' | 'select' | 'checkbox';
export type ActivityCopySource = 'SYSTEM' | 'CUSTOM';
export type ActivityFieldCopyProperty = 'label' | 'placeholder' | 'helpText' | 'options';
export type ActivityTemplateCopyProperty = 'title' | 'description' | 'submitLabel';
export type ActivityFieldSource =
  | 'title'
  | 'description'
  | 'objective'
  | 'departmentId'
  | 'venueId'
  | 'responsibleName'
  | 'contactInfo'
  | 'estimatedAttendance'
  | 'category'
  | 'modality'
  | 'visibility'
  | 'priority'
  | 'tags'
  | 'internalNotes';

export type ActivityFormField = {
  id: string;
  kind: 'builtin' | 'custom';
  source?: ActivityFieldSource;
  type: ActivityFieldType;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  visible: boolean;
  width: 'half' | 'full';
  options: string[];
  copySource?: Partial<Record<ActivityFieldCopyProperty, ActivityCopySource>>;
};

export type ActivityFormTemplate = {
  title: string;
  description: string;
  submitLabel: string;
  fields: ActivityFormField[];
  copySource?: Partial<Record<ActivityTemplateCopyProperty, ActivityCopySource>>;
};

export type ActivityFormTemplateResponse = {
  published: ActivityFormTemplate;
  publishedVersion: number;
  publishedAt: string;
  canManage: boolean;
  draft?: ActivityFormTemplate;
  draftVersion?: number;
  updatedAt?: string;
  hasUnpublishedChanges?: boolean;
};

export const essentialActivitySources = new Set<ActivityFieldSource>(['title', 'description', 'departmentId', 'responsibleName']);

export const fieldTypeLabels: Record<ActivityFieldType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  number: 'Número',
  email: 'Correo',
  tel: 'Teléfono',
  date: 'Fecha',
  select: 'Lista de opciones',
  checkbox: 'Confirmación'
};

export const builtinFieldCatalog: ActivityFormField[] = [
  { id: 'title', kind: 'builtin', source: 'title', type: 'text', label: 'Nombre de la actividad', placeholder: 'Ej. Encuentro de familias', helpText: '', required: true, visible: true, width: 'full', options: [] },
  { id: 'description', kind: 'builtin', source: 'description', type: 'textarea', label: 'Descripción', placeholder: 'Explica brevemente el propósito y dinámica…', helpText: '', required: true, visible: true, width: 'full', options: [] },
  { id: 'objective', kind: 'builtin', source: 'objective', type: 'textarea', label: 'Objetivo', placeholder: '¿Qué resultado espera alcanzar?', helpText: '', required: false, visible: true, width: 'full', options: [] },
  { id: 'department', kind: 'builtin', source: 'departmentId', type: 'select', label: 'Departamento', placeholder: '', helpText: '', required: true, visible: true, width: 'half', options: [] },
  { id: 'venue', kind: 'builtin', source: 'venueId', type: 'select', label: 'Lugar', placeholder: '', helpText: '', required: false, visible: true, width: 'half', options: [] },
  { id: 'responsible', kind: 'builtin', source: 'responsibleName', type: 'text', label: 'Responsable', placeholder: 'Nombre completo', helpText: '', required: true, visible: true, width: 'half', options: [] },
  { id: 'contact', kind: 'builtin', source: 'contactInfo', type: 'text', label: 'Contacto', placeholder: 'Teléfono o correo', helpText: '', required: false, visible: true, width: 'half', options: [] },
  { id: 'attendance', kind: 'builtin', source: 'estimatedAttendance', type: 'number', label: 'Asistencia estimada', placeholder: '', helpText: '', required: false, visible: true, width: 'half', options: [] },
  { id: 'category', kind: 'builtin', source: 'category', type: 'text', label: 'Categoría', placeholder: '', helpText: '', required: false, visible: true, width: 'half', options: [] },
  { id: 'modality', kind: 'builtin', source: 'modality', type: 'select', label: 'Modalidad', placeholder: '', helpText: '', required: false, visible: true, width: 'half', options: ['Presencial', 'Virtual', 'Híbrida'] },
  { id: 'visibility', kind: 'builtin', source: 'visibility', type: 'select', label: 'Visibilidad', placeholder: '', helpText: '', required: false, visible: true, width: 'half', options: ['Toda la iglesia', 'Solo liderazgo', 'Público'] },
  { id: 'priority', kind: 'builtin', source: 'priority', type: 'number', label: 'Prioridad', placeholder: '', helpText: '', required: false, visible: true, width: 'half', options: [] },
  { id: 'tags', kind: 'builtin', source: 'tags', type: 'text', label: 'Etiquetas separadas por coma', placeholder: 'familia, misión, jóvenes', helpText: '', required: false, visible: true, width: 'full', options: [] },
  { id: 'notes', kind: 'builtin', source: 'internalNotes', type: 'textarea', label: 'Notas internas', placeholder: '', helpText: '', required: false, visible: true, width: 'full', options: [] }
].map((field) => ({ ...field, copySource: { label: 'SYSTEM', placeholder: 'SYSTEM', helpText: 'SYSTEM', options: 'SYSTEM' } })) as ActivityFormField[];

const systemTemplateCopy: Record<ActivityTemplateCopyProperty, string> = {
  title: 'Solicitud de actividad',
  description: 'Completa la información para coordinar, revisar y calendarizar la actividad.',
  submitLabel: 'Crear y enviar'
};

/** Missing metadata means legacy/custom text: never infer provenance from matching words. */
export function activityFieldText(field: ActivityFormField, property: Exclude<ActivityFieldCopyProperty, 'options'>, tr: (value: string) => string): string {
  if (field.kind !== 'builtin' || field.copySource?.[property] !== 'SYSTEM') return field[property];
  const system = builtinFieldCatalog.find((candidate) => candidate.source === field.source);
  return system ? tr(system[property]) : field[property];
}

export function activityFieldOptions(field: ActivityFormField, tr: (value: string) => string): string[] {
  if (field.kind !== 'builtin' || field.copySource?.options !== 'SYSTEM') return field.options;
  const system = builtinFieldCatalog.find((candidate) => candidate.source === field.source);
  return system ? system.options.map(tr) : field.options;
}

export function activityTemplateText(template: ActivityFormTemplate, property: ActivityTemplateCopyProperty, tr: (value: string) => string): string {
  return template.copySource?.[property] === 'SYSTEM' ? tr(systemTemplateCopy[property]) : template[property];
}

export function customizeActivityField(field: ActivityFormField, patch: Partial<ActivityFormField>): ActivityFormField {
  const copySource = { ...field.copySource };
  for (const property of ['label', 'placeholder', 'helpText', 'options'] as const) if (Object.hasOwn(patch, property)) copySource[property] = 'CUSTOM';
  return { ...field, ...patch, copySource };
}

export function customizeActivityTemplate(template: ActivityFormTemplate, property: ActivityTemplateCopyProperty, value: string): ActivityFormTemplate {
  return { ...template, [property]: value, copySource: { ...template.copySource, [property]: 'CUSTOM' } };
}

export function cloneField(field: ActivityFormField): ActivityFormField {
  return { ...field, options: [...field.options], ...(field.copySource ? {copySource: {...field.copySource}} : {}) };
}
