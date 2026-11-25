import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { addDays, todayCL } from '@/lib/date'
import { serviceStatusMeta } from '@/lib/service-status'
import {
  ANOMALIES, AUDIT_STATUS, anomalyMeta, auditStatusMeta, deviationColor, deviationPct,
  formatDeviation, formatKm, formatMinutes,
} from '@/lib/service-audit'
import KpiCard from '../components/KpiCard'
import ClickableRow from '../components/ClickableRow'
import TrazoLine from '@/app/components/TrazoLine'
import Plate from '@/app/components/Plate'

// Auditoría de servicios realizados (migración 030). Filtros por GET: la URL
// se puede compartir y el filtro sobrevive al refresco en vivo del panel.

type Metrics = {
  estimated_duration_minutes: number | null
  actual_duration_minutes: number | null
  estimated_distance_km: number | null
  actual_distance_km: number | null
  start_delay_minutes: number | null
  anomalies: string[] | null
}

type Row = {
  id: string
  service_code: string | null
  status: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  audit_status: string | null
  routes: { origin_name: string | null; destination_name: string | null } | null
  drivers: { id: string; full_name: string | null } | null
  vehicles: { id: string; plate: string | null } | null
  service_metrics: Metrics | Metrics[] | null
}

type Option = { id: string; label: string }

const STATUS_FILTERS: Record<string, { label: string; values: string[] | null }> = {
  closed:      { label: 'Cerrados (finalizados y cancelados)', values: ['completed', 'cancelled'] },
  completed:   { label: 'Finalizados', values: ['completed'] },
  cancelled:   { label: 'Cancelados', values: ['cancelled'] },
  in_progress: { label: 'En curso', values: ['in_progress'] },
  scheduled:   { label: 'Programados', values: ['scheduled'] },
  all:         { label: 'Todos', values: null },
}

const UUID = /^[0-9a-f-]{36}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Select({ name, label, value, options, allLabel }: {
  name: string; label: string; value: string; options: Option[]; allLabel: string
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <select name={name} defaultValue={value}
        className="bg-sunken border border-line rounded-md px-2.5 py-2 text-[12px] text-fg focus:outline-none focus:border-[#246354]">
        <option value="">{allLabel}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const param = (key: string) => {
    const v = sp[key]
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
  }

  const status = STATUS_FILTERS[param('status')] ? param('status') : 'closed'
  const audit = param('audit') in AUDIT_STATUS ? param('audit') : ''
  const driver = UUID.test(param('driver')) ? param('driver') : ''
  const vehicle = UUID.test(param('vehicle')) ? param('vehicle') : ''
  const passenger = UUID.test(param('passenger')) ? param('passenger') : ''
  const anomaly = param('anomaly') === 'any' || param('anomaly') in ANOMALIES ? param('anomaly') : ''
  const today = todayCL()
  const from = DATE.test(param('from')) ? param('from') : addDays(today, -30)
  const to = DATE.test(param('to')) ? param('to') : today

  const supabase = await createClient()

  const metricsEmbed = anomaly ? 'service_metrics!inner' : 'service_metrics'
  const passengerEmbed = passenger ? ', service_passengers!inner(passenger_id)' : ''

  let query = supabase
    .from('services')
    .select(`
      id, service_code, status, scheduled_date, scheduled_start_time, audit_status,
      routes ( origin_name, destination_name ),
      drivers ( id, full_name ),
      vehicles ( id, plate ),
      ${metricsEmbed} ( estimated_duration_minutes, actual_duration_minutes, estimated_distance_km,
        actual_distance_km, start_delay_minutes, anomalies )
      ${passengerEmbed}
    `)
    .is('deleted_at', null)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date', { ascending: false })
    .order('scheduled_start_time', { ascending: false })
    .limit(200)

  const statusValues = STATUS_FILTERS[status].values
  if (statusValues) query = query.in('status', statusValues)
  if (audit) query = query.eq('audit_status', audit)
  if (driver) query = query.eq('driver_id', driver)
  if (vehicle) query = query.eq('vehicle_id', vehicle)
  if (passenger) query = query.eq('service_passengers.passenger_id', passenger)
  if (anomaly === 'any') query = query.neq('service_metrics.anomalies', '{}')
  else if (anomaly) query = query.contains('service_metrics.anomalies', [anomaly])

  const [{ data: rawRows, error }, { data: drivers }, { data: vehicles }, { data: passengers }] = await Promise.all([
    query,
    supabase.from('drivers').select('id, full_name').is('deleted_at', null).order('full_name'),
    supabase.from('vehicles').select('id, plate').is('deleted_at', null).order('plate'),
    supabase.from('passengers').select('id, full_name').is('deleted_at', null).order('full_name'),
  ])

  const services = (rawRows ?? []) as unknown as Row[]
  const closed = services.filter(s => s.status === 'completed' || s.status === 'cancelled')
  const pendingCount = closed.filter(s => (s.audit_status ?? 'pending') === 'pending').length
  const observedCount = services.filter(s => s.audit_status === 'observed').length
  const withAnomalies = services.filter(s => (one(s.service_metrics)?.anomalies?.length ?? 0) > 0).length
  const approvedCount = services.filter(s => s.audit_status === 'approved').length

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Control operacional</p>
          <h2 className="text-[18px] font-bold" style={{ color: '#f1f5f9' }}>Auditoría de servicios</h2>
          <p className="text-[12px] text-muted mt-0.5">
            Trazabilidad completa de cada servicio: solicitud, toma, recorrido y cierre, con estimado vs. real.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Por auditar" value={pendingCount} sub="Cerrados sin revisión" tone="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#7dbbff" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <KpiCard label="Con anomalías" value={withAnomalies} sub="Detectadas al consolidar" tone="red"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fda4af" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>} />
        <KpiCard label="Observados" value={observedCount} sub="Requieren seguimiento" tone="orange"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fdba74" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <KpiCard label="Aprobados" value={approvedCount} sub="En el período filtrado" tone="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#55d9ad" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <form method="get" className="bg-surface border border-line rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 items-end">
        <Select name="status" label="Estado" value={status} allLabel="Cerrados"
          options={Object.entries(STATUS_FILTERS).filter(([k]) => k !== 'closed').map(([id, f]) => ({ id, label: f.label }))} />
        <Select name="audit" label="Auditoría" value={audit} allLabel="Todas"
          options={Object.entries(AUDIT_STATUS).map(([id, m]) => ({ id, label: m.label }))} />
        <Select name="anomaly" label="Anomalías" value={anomaly} allLabel="Con o sin"
          options={[{ id: 'any', label: 'Cualquier anomalía' }, ...Object.entries(ANOMALIES).map(([id, a]) => ({ id, label: a.label }))]} />
        <Select name="driver" label="Conductor" value={driver} allLabel="Todos"
          options={(drivers ?? []).map(d => ({ id: d.id, label: d.full_name }))} />
        <Select name="vehicle" label="Vehículo" value={vehicle} allLabel="Todos"
          options={(vehicles ?? []).map(v => ({ id: v.id, label: v.plate }))} />
        <Select name="passenger" label="Pasajero" value={passenger} allLabel="Todos"
          options={(passengers ?? []).map(p => ({ id: p.id, label: p.full_name }))} />
        <div className="grid grid-cols-2 gap-2 col-span-2 md:col-span-4 xl:col-span-1 xl:grid-cols-1">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Desde</span>
            <input type="date" name="from" defaultValue={from} className="bg-sunken border border-line rounded-md px-2 py-1.5 text-[12px] text-fg" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Hasta</span>
            <input type="date" name="to" defaultValue={to} className="bg-sunken border border-line rounded-md px-2 py-1.5 text-[12px] text-fg" />
          </label>
        </div>
        <div className="col-span-2 md:col-span-4 xl:col-span-7 flex justify-end gap-2">
          <Link href="/dashboard/auditoria" className="px-3 py-2 rounded-md border border-line text-[12px] text-muted hover:text-fg">Limpiar</Link>
          <button type="submit" className="px-4 py-2 rounded-md text-[12px] font-semibold border border-[#246354] bg-[#143c39] text-[#62e7bd] hover:bg-[#185049]">Filtrar</button>
        </div>
      </form>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>Servicios</h3>
          <span className="text-[10px] bg-sunken border border-line text-muted px-2 py-0.5 rounded font-semibold">
            {services.length}{services.length === 200 ? '+' : ''}
          </span>
        </div>

        {error ? (
          <div className="p-6 text-center text-[12px] text-rose-300">
            No se pudieron cargar los servicios. Si acabas de actualizar, corre <code>npm run db:migrate</code> (migración 030).
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <TrazoLine className="mb-2.5" />
            <p className="text-[12px] font-semibold text-fg">Sin servicios para estos filtros</p>
            <p className="text-[11px] text-muted mt-0.5">Amplía el rango de fechas o quita filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="px-4 py-2 font-semibold">Servicio</th>
                  <th className="px-4 py-2 font-semibold">Recorrido</th>
                  <th className="px-4 py-2 font-semibold">Conductor / vehículo</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold text-right">Duración est. → real</th>
                  <th className="px-4 py-2 font-semibold text-right">Distancia est. → real</th>
                  <th className="px-4 py-2 font-semibold">Anomalías</th>
                  <th className="px-4 py-2 font-semibold">Auditoría</th>
                </tr>
              </thead>
              <tbody>
                {services.map(s => {
                  const m = one(s.service_metrics)
                  const route = one(s.routes)
                  const drv = one(s.drivers)
                  const veh = one(s.vehicles)
                  const st = serviceStatusMeta(s.status)
                  const au = auditStatusMeta(s.audit_status)
                  const durDev = deviationPct(m?.estimated_duration_minutes, m?.actual_duration_minutes)
                  const distDev = deviationPct(m?.estimated_distance_km, m?.actual_distance_km)
                  const anomalies = m?.anomalies ?? []
                  return (
                    <ClickableRow key={s.id} href={`/dashboard/auditoria/${s.id}`} className="border-b border-raised hover:bg-sunken">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link href={`/dashboard/auditoria/${s.id}`} className="font-semibold text-fg hover:underline">
                          {s.service_code ?? s.id.slice(0, 8)}
                        </Link>
                        <p className="text-[10px] text-muted">
                          {formatDate(s.scheduled_date)} · {s.scheduled_start_time?.slice(0, 5) ?? '—'}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 max-w-[220px]">
                        <p className="truncate text-fg">{route?.origin_name ?? '—'}</p>
                        <p className="truncate text-muted">→ {route?.destination_name ?? '—'}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-fg">{drv?.full_name ?? <span className="text-muted">Sin conductor</span>}</p>
                        <div className="mt-1"><Plate value={veh?.plate} /></div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className="text-muted">{formatMinutes(m?.estimated_duration_minutes)}</span> → <span className="text-fg">{formatMinutes(m?.actual_duration_minutes)}</span>
                        <p className="text-[10px] font-semibold" style={{ color: deviationColor(durDev) }}>{formatDeviation(durDev)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className="text-muted">{formatKm(m?.estimated_distance_km)}</span> → <span className="text-fg">{formatKm(m?.actual_distance_km)}</span>
                        <p className="text-[10px] font-semibold" style={{ color: deviationColor(distDev) }}>{formatDeviation(distDev)}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        {anomalies.length === 0 ? (
                          <span className="text-muted">{m ? 'Ninguna' : 'Sin consolidar'}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {anomalies.slice(0, 3).map(code => {
                              const a = anomalyMeta(code)
                              return <span key={code} title={a.hint} className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: a.bg, color: a.text }}>{a.label}</span>
                            })}
                            {anomalies.length > 3 && <span className="text-[10px] text-muted">+{anomalies.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: au.bg, color: au.text }}>{au.label}</span>
                      </td>
                    </ClickableRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
