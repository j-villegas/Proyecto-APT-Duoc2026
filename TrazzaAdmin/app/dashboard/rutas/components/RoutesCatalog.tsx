'use client'

import { useState } from 'react'
import { saveRoute } from '../actions'

export type CatalogRoute = {
  id: string; route_code: string; name: string; origin_name: string | null;
  destination_name: string | null; status: string; notes: string | null;
  estimated_duration_minutes: number | null; estimated_distance_km: number | null;
}

const fields = [
  ['route_code', 'Código', 'text'], ['name', 'Nombre', 'text'],
  ['origin_name', 'Origen', 'text'], ['destination_name', 'Destino', 'text'],
  ['estimated_duration_minutes', 'Duración estimada (min)', 'number'],
  ['estimated_distance_km', 'Distancia estimada (km)', 'number'],
] as const

export default function RoutesCatalog({ routes, error, canManage }: { routes: CatalogRoute[]; error: boolean; canManage: boolean }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState<CatalogRoute | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CatalogRoute | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const selected = editing && editing !== 'new' ? editing : null
  const visible = routes.filter(route => (status === 'all' || route.status === status) && [route.route_code, route.name, route.origin_name, route.destination_name].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const button = 'rounded px-3 py-2 text-xs border border-[#2b405b] hover:bg-[#203650] disabled:opacity-50'
  async function submit(form: FormData) {
    setBusy(true)
    setMessage('')
    try {
      const result = await saveRoute(form)
      if (result.error) setMessage(result.error)
      else { setEditing(null); setDeleting(null); setMessage('Ruta guardada correctamente.') }
    } catch { setMessage('No se pudo conectar. Vuelve a intentar.') }
    finally { setBusy(false) }
  }
  return <section className="bg-[#142942] border border-[#2b405b] rounded-lg p-4 space-y-4 text-[#d5e0ed]">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-sm">Catálogo de rutas</h3><p className="text-xs text-[#a8b8cc]">Recorridos registrados. Los viajes programados se gestionan abajo.</p></div>
      {canManage && <button className={button} disabled={busy} onClick={() => { setEditing('new'); setDeleting(null); setMessage('') }}>Nueva ruta del catálogo</button>}
    </div>
    {error && <p role="alert" className="text-sm text-rose-300">No se pudo cargar el catálogo. Recarga la página.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <input aria-label="Buscar rutas" placeholder="Buscar código, nombre, origen o destino" value={query} onChange={event => setQuery(event.target.value)} className="rounded border border-[#2b405b] bg-[#10223d] p-2 text-sm flex-1 min-w-48" />
      <select aria-label="Filtrar estado" value={status} onChange={event => setStatus(event.target.value)} className="rounded bg-[#10223d] p-2 text-sm"><option value="all">Todos los estados</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select>
    </div>
    {editing && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); form.set('operation', selected ? 'update' : 'create'); if (selected) form.set('id', selected.id); void submit(form) }} className="border border-[#2b405b] rounded p-4 space-y-3">
      <h4 className="text-sm font-semibold">{selected ? 'Editar ruta' : 'Crear ruta'}</h4>
      <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-3" key={selected?.id ?? 'new'}>
        {fields.map(([key, label, type]) => <label key={key} className="text-xs space-y-1">{label}<input name={key} type={type} required={type === 'text'} min={type === 'number' ? 0 : undefined} step={key === 'estimated_distance_km' ? 'any' : type === 'number' ? 1 : undefined} defaultValue={selected?.[key] ?? ''} className="block w-full rounded border border-[#2b405b] bg-[#10223d] p-2 text-sm" /></label>)}
        <label className="text-xs">Estado<select name="status" defaultValue={selected?.status ?? 'active'} className="block w-full rounded bg-[#10223d] p-2 text-sm"><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
        <label className="text-xs">Notas<textarea name="notes" defaultValue={selected?.notes ?? ''} className="block w-full rounded bg-[#10223d] p-2 text-sm" /></label>
      </fieldset>
      <div className="flex gap-2"><button disabled={busy} className={button}>{busy ? 'Guardando…' : 'Guardar ruta'}</button><button type="button" disabled={busy} className={button} onClick={() => setEditing(null)}>Cancelar</button></div>
    </form>}
    {deleting && <div className="rounded border border-rose-400 p-3 space-y-2" role="alert">
      <p className="text-sm">¿Eliminar la ruta {deleting.route_code}? Se ocultará del catálogo y se conservará el historial de viajes.</p>
      <button disabled={busy} className={button} onClick={() => { const form = new FormData(); form.set('id', deleting.id); form.set('operation', 'delete'); void submit(form) }}>{busy ? 'Eliminando…' : 'Confirmar eliminación'}</button>{' '}
      <button disabled={busy} className={button} onClick={() => setDeleting(null)}>Cancelar</button>
    </div>}
    <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead><tr>{['Código / Nombre', 'Origen', 'Destino', 'Estado', 'Estimación', 'Acciones'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>
      {visible.map(route => <tr key={route.id} className="border-t border-[#2b405b]">
        <td className="p-2"><strong>{route.route_code}</strong><div>{route.name}</div></td><td className="p-2">{route.origin_name ?? '—'}</td><td className="p-2">{route.destination_name ?? '—'}</td><td className="p-2">{route.status === 'active' ? 'Activa' : 'Inactiva'}</td>
        <td className="p-2">{route.estimated_duration_minutes ?? '—'} min / {route.estimated_distance_km ?? '—'} km</td>
        <td className="p-2">{canManage ? <div className="flex gap-2"><button className={button} disabled={busy} onClick={() => { setEditing(route); setDeleting(null); setMessage('') }}>Editar</button><button className={button} disabled={busy} onClick={() => { setDeleting(route); setEditing(null); setMessage('') }}>Eliminar</button></div> : 'Solo lectura'}</td>
      </tr>)}
      {!error && visible.length === 0 && <tr><td colSpan={6} className="p-4 text-center">{routes.length ? 'No hay rutas que coincidan con los filtros.' : 'Todavía no hay rutas registradas.'}</td></tr>}
    </tbody></table></div>
  </section>
}
