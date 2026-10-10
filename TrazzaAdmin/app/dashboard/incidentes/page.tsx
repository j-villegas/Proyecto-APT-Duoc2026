import Link from 'next/link'
import { incidentAccess } from './access'
import { NewIncidentForm, UpdateIncidentForm } from './IncidentForms'
import { statuses, severities, isStatus, isSeverity, relation, inputClass } from './model'
import { friendlyReason } from '@/lib/errors'

type Params = Record<string, string | string[] | undefined>
const PAGE_SIZE = 20
const scalar = (value: string | string[] | undefined) => typeof value === 'string' ? value : ''
function date(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value))
}
function severityClass(value: string) {
  return value === 'critical' ? 'bg-rose-950 text-rose-200' : value === 'high' || value === 'medium' ? 'bg-amber-950 text-amber-200' : 'bg-raised text-slate-200'
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const q = scalar(params.q).trim().slice(0, 100)
  const rawStatus = scalar(params.status), rawSeverity = scalar(params.severity)
  const status = isStatus(rawStatus) ? rawStatus : '', severity = isSeverity(rawSeverity) ? rawSeverity : ''
  const n = Number(scalar(params.page))
  const requestedPage = Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1
  async function load() {
    const { supabase, profile } = await incidentAccess()
    const base = () => supabase.from('incidents').select('*', { count: 'exact', head: true }).eq('company_id', profile.company_id).is('deleted_at', null)
    let filteredCount = base()
    // Escape LIKE wildcards: searching for % or _ does not expose unrelated matches.
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    if (status) filteredCount = filteredCount.eq('status', status)
    if (severity) filteredCount = filteredCount.eq('severity', severity)
    if (q) filteredCount = filteredCount.ilike('title', pattern)
    const [total, open, review, critical, matched] = await Promise.all([
      base(), base().eq('status', 'open'), base().eq('status', 'in_review'),
      base().in('status', ['open', 'in_review']).eq('severity', 'critical'), filteredCount,
    ])
    if ([total, open, review, critical, matched].some(result => result.error)) throw new Error(friendlyReason([total, open, review, critical, matched].find(result => result.error)?.error))
    const pages = Math.max(1, Math.ceil((matched.count ?? 0) / PAGE_SIZE))
    const page = Math.min(requestedPage, pages)
    let query = supabase.from('incidents').select(`id, incident_code, title, description, severity, status, occurred_at, reported_at, resolved_at, resolution_notes, updated_at, reported_by_type, service_id,
      vehicle:vehicles!incidents_vehicle_id_fkey(plate), driver:drivers!incidents_driver_id_fkey(full_name), service:services!incidents_service_id_fkey(service_code)`)
      .eq('company_id', profile.company_id).is('deleted_at', null)
    if (status) query = query.eq('status', status)
    if (severity) query = query.eq('severity', severity)
    if (q) query = query.ilike('title', pattern)
    const { data, error } = await query.order('occurred_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (error) throw new Error(friendlyReason(error))
    return { data, total, open, review, critical, matched, page, pages }
  }
  const result = await load().then(
    data => ({ ok: true as const, data }),
    (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : 'Comprueba tu conexión e inténtalo nuevamente.' }),
  )
  if (!result.ok) return <section role="alert" className="rounded-2xl border border-rose-900 bg-danger-bg p-6 text-rose-100"><h2 className="font-bold">No se pudo cargar Incidentes</h2><p className="mt-2 text-sm">{result.message}</p><Link href="/dashboard/incidentes" className="mt-4 inline-block underline">Volver a intentar</Link></section>
  const { data, total, open, review, critical, matched, page, pages } = result.data
    const pageUrl = (target: number) => {
      const values = new URLSearchParams({ page: String(target) })
      if (q) values.set('q', q)
      if (status) values.set('status', status)
      if (severity) values.set('severity', severity)
      return `/dashboard/incidentes?${values}`
    }
    const indicators = [ ['Registrados', total.count], ['Abiertos', open.count], ['En revisión', review.count], ['Críticos pendientes', critical.count] ] as const
    return <div className="space-y-5 text-slate-100">
      <div><h2 className="text-lg font-bold">Incidentes</h2><p className="mt-1 text-sm text-muted">Registro y seguimiento de eventos operacionales de tu empresa.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{indicators.map(([label, count]) => <div key={label} className={`rounded-2xl border p-4 ${label === 'Críticos pendientes' && (count ?? 0) > 0 ? 'border-rose-900 bg-danger-bg' : 'border-line bg-surface'}`}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{count ?? 0}</p></div>)}</div>
      <p className="text-xs text-muted">Indicadores del historial completo. Los críticos pendientes incluyen abiertos y en revisión.</p>
      <NewIncidentForm />
      <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Listado de incidentes">
        <form action="/dashboard/incidentes" method="get" className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 xl:grid-cols-[1fr_160px_160px_auto_auto]">
          <label className="space-y-1 text-xs text-muted">Buscar por título<input name="q" defaultValue={q} maxLength={100} placeholder="Ej.: falla mecánica" className={inputClass} /></label>
          <label className="space-y-1 text-xs text-muted">Estado<select name="status" defaultValue={status} className={inputClass}><option value="">Todos</option>{Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-xs text-muted">Gravedad<select name="severity" defaultValue={severity} className={inputClass}><option value="">Todas</option>{Object.entries(severities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <button className="self-end rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas">Filtrar</button>
          <Link href="/dashboard/incidentes" className="self-end rounded-xl border border-line px-4 py-2.5 text-center text-sm">Limpiar</Link>
        </form>
        <div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-xs text-muted"><span>{matched.count ?? 0} resultados</span><span>Fechas en hora de Chile · Más recientes primero</span></div>
        {!data?.length ? <div className="px-5 py-14 text-center"><h3 className="font-semibold">{q || status || severity ? 'No hay incidentes con estos filtros' : 'Todavía no hay incidentes registrados'}</h3><p className="mt-2 text-sm text-muted">{q || status || severity ? 'Prueba otro título o limpia los filtros.' : 'Los reportes de rutas y los registros generales aparecerán aquí.'}</p></div> : <ul className="divide-y divide-line">
          {data.map(incident => {
            const vehicle = relation(incident.vehicle), driver = relation(incident.driver), service = relation(incident.service)
            const stateLabel = isStatus(incident.status) ? statuses[incident.status] : incident.status
            const severityLabel = isSeverity(incident.severity) ? severities[incident.severity] : incident.severity
            return <li key={incident.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-xs text-muted">{incident.incident_code ?? `INC-${incident.id.slice(0, 8).toUpperCase()}`} · {date(incident.occurred_at)}</p><h3 className="mt-1 break-words font-semibold">{incident.title || 'Incidente sin título'}</h3></div>
                <div className="flex gap-2"><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityClass(incident.severity)}`}>{severityLabel}</span><span className="rounded-lg bg-raised px-2 py-1 text-xs">{stateLabel}</span></div>
              </div>
              <p className="mt-2 text-xs text-muted">Vehículo: {vehicle?.plate ?? 'Sin asignar'} · Conductor: {driver?.full_name ?? 'Sin asignar'}</p>
              <details className="mt-3 rounded-xl border border-line bg-sunken">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#62e7bd]">Ver detalle y seguimiento</summary>
                <div className="space-y-4 border-t border-line p-4">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{incident.description || 'Sin descripción.'}</p>
                  <dl className="grid gap-3 text-xs text-muted sm:grid-cols-3"><div><dt>Reportado</dt><dd className="mt-1 text-slate-100">{date(incident.reported_at)}</dd></div><div><dt>Origen del reporte</dt><dd className="mt-1 text-slate-100">{({ admin: 'Administrador', driver: 'Conductor', passenger: 'Pasajero', system: 'Sistema' } as Record<string, string>)[incident.reported_by_type] ?? incident.reported_by_type}</dd></div><div><dt>Resolución</dt><dd className="mt-1 text-slate-100">{incident.resolved_at ? date(incident.resolved_at) : 'Sin fecha de resolución'}</dd></div></dl>
                  {incident.service_id && <Link href={`/dashboard/rutas/${incident.service_id}`} className="inline-block text-sm text-[#62e7bd] underline">Ver servicio {service?.service_code ?? incident.service_id.slice(0, 8)}</Link>}
                  <UpdateIncidentForm key={incident.updated_at} id={incident.id} status={incident.status} updatedAt={incident.updated_at} notes={incident.resolution_notes} />
                </div>
              </details>
            </li>
          })}
        </ul>}
        <nav aria-label="Paginación de incidentes" className="flex items-center justify-between gap-3 border-t border-line p-4 text-sm">
          {page > 1 ? <Link href={pageUrl(page - 1)} className="rounded-lg border border-line px-3 py-2">Anterior</Link> : <span className="px-3 py-2 text-slate-500">Anterior</span>}
          <span className="text-xs text-muted">Página {page} de {pages}</span>
          {page < pages ? <Link href={pageUrl(page + 1)} className="rounded-lg border border-line px-3 py-2">Siguiente</Link> : <span className="px-3 py-2 text-slate-500">Siguiente</span>}
        </nav>
      </section>
    </div>
}
