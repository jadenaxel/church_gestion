type CustomInput = Record<string, string | number | boolean | null>;

/** The stored template permits visible fields only. Hidden/historical values
 * survive edits but are not newly writable through an unrelated editor. */
export function preserveActivityCustomData(previous: unknown, incoming: CustomInput, visibleIds: ReadonlySet<string>): Record<string, unknown> {
  const saved = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(saved)) if (!visibleIds.has(key)) result[key] = value;
  for (const [key, value] of Object.entries(incoming)) {
    if (visibleIds.has(key)) result[key] = value;
    else if (!Object.hasOwn(saved, key)) throw Object.assign(new Error('El campo personalizado no pertenece al formulario guardado.'), { status: 400, code: 'UNKNOWN_CUSTOM_FIELD' });
    else if (!Object.is(saved[key], value)) throw Object.assign(new Error('El formulario guardado no permite modificar un campo oculto o histórico.'), { status: 400, code: 'CUSTOM_FIELD_READONLY' });
  }
  return result;
}
