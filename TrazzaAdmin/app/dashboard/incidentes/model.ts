export const statuses = {
  open: 'Abierto', in_review: 'En revisión', resolved: 'Resuelto', cancelled: 'Cancelado',
} as const
export const severities = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' } as const
export type Status = keyof typeof statuses
export type Severity = keyof typeof severities
export type ActionState = { error?: string; success?: string; revision?: string }
export const inputClass = 'w-full rounded-xl border border-[#2b405b] bg-[#10223d] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10b98b]'
export const buttonClass = 'inline-flex items-center justify-center rounded-xl bg-[#10b98b] px-4 py-2.5 text-sm font-semibold text-[#0d1d37] hover:bg-[#36d3a7] disabled:cursor-wait disabled:opacity-50'

export function isStatus(value: string): value is Status {
  return Object.prototype.hasOwnProperty.call(statuses, value)
}
export function isSeverity(value: string): value is Severity {
  return Object.prototype.hasOwnProperty.call(severities, value)
}
export function field(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}
export function validateNew(form: FormData) {
  const title = field(form, 'title'), description = field(form, 'description'), severity = field(form, 'severity')
  if (title.length < 3 || title.length > 160) throw new Error('El título debe tener entre 3 y 160 caracteres.')
  if (description.length < 5 || description.length > 4000) throw new Error('La descripción debe tener entre 5 y 4000 caracteres.')
  if (!isSeverity(severity)) throw new Error('Selecciona una gravedad válida.')
  return { title, description, severity }
}
export function validateUpdate(form: FormData) {
  const id = field(form, 'id'), updatedAt = field(form, 'updated_at'), status = field(form, 'status'), notes = field(form, 'resolution_notes')
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new Error('Incidente no válido.')
  if (!updatedAt || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Recarga la página antes de guardar.')
  if (!isStatus(status)) throw new Error('Estado no válido.')
  if (notes.length > 4000) throw new Error('Las notas no pueden superar los 4000 caracteres.')
  if ((status === 'resolved' || status === 'cancelled') && notes.length < 5) throw new Error('Explica la resolución o el motivo de cancelación (mínimo 5 caracteres).')
  return { id, updatedAt, status, notes }
}
export function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}
