'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createIncident, updateIncident } from './actions'
import { statuses, severities, inputClass, buttonClass, type ActionState } from './model'

function Feedback({ state }: { state: ActionState }) {
  return <>
    {state.error && <p role="alert" className="rounded-xl border border-rose-900 bg-rose-950 p-3 text-sm text-rose-200">{state.error}</p>}
    {state.success && <p role="status" className="rounded-xl border border-emerald-900 bg-emerald-950 p-3 text-sm text-emerald-200">{state.success}</p>}
  </>
}

export function NewIncidentForm() {
  const [state, action, pending] = useActionState(createIncident, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.revision) ref.current?.reset() }, [state.revision])
  return <details className="rounded-2xl border border-[#2b405b] bg-[#142942]">
    <summary className="cursor-pointer px-5 py-4 font-semibold text-[#62e7bd]">+ Registrar incidente general</summary>
    <form ref={ref} action={action} className="space-y-4 border-t border-[#2b405b] p-5" aria-busy={pending}>
      <p className="text-sm text-[#a8b8cc]">Para vincularlo a un servicio, usa “Reportar Incidencia” desde el detalle de la ruta. Este registro será general.</p>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <label className="space-y-2 text-sm">Título<span className="text-rose-300"> *</span>
          <input name="title" required minLength={3} maxLength={160} className={inputClass} placeholder="Ej.: problema operativo en terminal" />
        </label>
        <label className="space-y-2 text-sm">Gravedad
          <select name="severity" defaultValue="medium" className={inputClass}>{Object.entries(severities).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
        </label>
        <label className="space-y-2 text-sm sm:col-span-2">Descripción<span className="text-rose-300"> *</span>
          <textarea name="description" required minLength={5} maxLength={4000} rows={3} className={inputClass} placeholder="Qué ocurrió y qué atención necesita" />
        </label>
      </fieldset>
      <Feedback state={state} />
      <button className={buttonClass} disabled={pending}>{pending ? 'Registrando…' : 'Registrar incidente'}</button>
    </form>
  </details>
}

export function UpdateIncidentForm({ id, status, updatedAt, notes }: { id: string; status: string; updatedAt: string; notes: string | null }) {
  const [state, action, pending] = useActionState(updateIncident, {})
  return <form action={action} className="space-y-4" aria-busy={pending}>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="updated_at" value={updatedAt} />
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <label className="space-y-2 text-sm">Estado
        <select name="status" defaultValue={status} className={inputClass}>{Object.entries(statuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      </label>
      <label className="space-y-2 text-sm">Notas de seguimiento / resolución
        <textarea name="resolution_notes" defaultValue={notes ?? ''} maxLength={4000} rows={3} className={inputClass} placeholder="Obligatorias para resolver o cancelar" />
      </label>
    </fieldset>
    <p className="text-xs text-[#a8b8cc]">Cancelar conserva el registro. Volver a abierto o en revisión reabre el incidente y limpia su fecha de resolución.</p>
    <Feedback state={state} />
    <button className={buttonClass} disabled={pending}>{pending ? 'Guardando…' : 'Guardar seguimiento'}</button>
  </form>
}
