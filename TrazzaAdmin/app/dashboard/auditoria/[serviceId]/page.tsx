import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serviceStatusMeta } from '@/lib/service-status'
import {
  ACTOR_LABELS, EVENT_LABELS, anomalyMeta, auditStatusMeta, deviationColor, deviationPct,
  formatDateTimeCL, formatDeviation, formatKm, formatMinutes,
} from '@/lib/service-audit'
import GoogleMapPanel, { type MapMarker } from '@/app/dashboard/components/GoogleMapPanel'
import Plate from '@/app/components/Plate'
import AuditActions from './components/AuditActions'

// Detalle de auditoría: línea de vida del servicio, estimado vs. real,
// trayectoria GPS, bitácora inmutable y decisiones de auditoría.

type Service = {
  id: string
  service_code: string | null
  status: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  actual_start_at: string | null
  actual_end_at: string | null
  created_at: string
  cancel_reason: string | null
  completion_source: string | null
  audit_status: string | null
  audited_at: string | null
  audit_notes: string | null
  routes: { route_code: string | null; origin_name: string | null; destination_name: string | null } | null
  drivers: { id: string; full_name: string | null; phone: string | null } | null
  vehicles: { id: string; plate: string | null; brand: string | null; model: string | null } | null
  contracts: { contract_name: string | null; client_name: string | null } | null
}

type Metrics = {
  scheduled_start_at: string | null
  start_delay_minutes: number | null
  estimated_duration_minutes: number | null
  actual_duration_minutes: number | null
  estimated_distance_km: number | null
  actual_distance_km: number | null
  location_points: number
  simulated_points: number
  max_location_gap_minutes: number | null
  avg_speed_kmh: number | null
  max_speed_kmh: number | null
  stops_total: number
  stops_completed: number
  stops_skipped: number
  stops_unconfirmed: number
  passengers_total: number
  passengers_boarded: number
  passengers_no_show: number
  incidents_count: number
  anomalies: string[]
  trajectory: { lat: number; lng: number; at: string }[]
  consolidated_at: string
}

type EventRow = { id: string; actor_type: string; event_type: string; payload: Record<string, unknown> | null; created_at: string }
type StopRow = { id: string; stop_order: number; stop_type: string | null; name: string | null; status: string | null; latitude: number | null; longitude: number | null; actual_arrival_at: string | null; completed_at: string | null }
type AuditRow = { id: string; decision: string; notes: string | null; created_at: string; profiles: { full_name: string | null; email: string | null } | null }
type PaxRow = { passenger_id: string; attendance_status: string; passengers: { full_name: string | null } | null }
type LocationRow = { latitude: number; longitude: number; recorded_at: string; is_simulated: boolean }

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line" style={{ backgroundColor: '#10223d' }}>
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>{title}</h3>
        {right}
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </div>
  )
}

/** Resumen legible del payload de un evento. */
function eventDetail(e: EventRow): string | null {
  const p = e.payload ?? {}
  const parts: string[] = []
  if (typeof p.plate === 'string') parts.push(`Vehículo ${p.plate}`)
  if (typeof p.wait_minutes === 'number') parts.push(`espera ${formatMinutes(p.wait_minutes)}`)
  if (typeof p.reason === 'string' && p.reason) parts.push(`Motivo: ${p.reason}`)
  if (typeof p.notes === 'string' && p.notes) parts.push(p.notes)
  if (typeof p.decision === 'string') parts.push(p.decision === 'approved' ? 'Aprobado' : 'Observado')
  if (typeof p.odometer_km === 'number') parts.push(`odómetro ${p.odometer_km} km`)
  if (e.event_type === 'service_requested') {
    const o = (p.origin as { name?: string })?.name
    const d = (p.destination as { name?: string })?.name
    if (o || d) parts.push(`${o ?? '—'} → ${d ?? '—'}`)
    if (p.estimated_distance_km != null) parts.push(`est. ${formatKm(p.estimated_distance_km as number)} / ${formatMinutes(p.estimated_duration_minutes as number)}`)
  }
  if (e.event_type === 'metrics_consolidated') {
    parts.push(`real ${formatMinutes(p.actual_duration_minutes as number)} · ${formatKm(p.actual_distance_km as number)} · ${p.location_points ?? 0} pings`)
  }
  if (typeof p.source === 'string') parts.push(p.source === 'mobile' ? 'desde la app' : p.source === 'panel' ? 'desde el panel' : p.source === 'start' ? 'salida desde el origen' : p.source === 'pickup' ? 'al completar la recogida' : p.source)
  return parts.length ? parts.join(' · ') : null
}

export default async function AuditDetailPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params
  const supabase = await createClient()

  const [
    { data: rawService },
    { data: rawMetrics },
    { data: rawEvents },
    { data: rawStops },
    { data: rawAudits },
    { data: rawPax },
    { data: rawIncidents },
  ] = await Promise.all([
    supabase.from('services').select(`
      id, service_code, status, scheduled_date, scheduled_start_time, actual_start_at, actual_end_at, created_at,
      cancel_reason, completion_source, audit_status, audited_at, audit_notes,
      routes ( route_code, origin_name, destination_name ),
      drivers ( id, full_name, phone ),
      vehicles ( id, plate, brand, model ),
      contracts ( contract_name, client_name )
    `).eq('id', serviceId).maybeSingle(),
    supabase.from('service_metrics').select('*').eq('service_id', serviceId).maybeSingle(),
    supabase.from('service_events').select('id, actor_type, event_type, payload, created_at')
      .eq('service_id', serviceId).order('created_at', { ascending: true }),
    supabase.from('service_stops').select('id, stop_order, stop_type, name, status, latitude, longitude, actual_arrival_at, completed_at')
      .eq('service_id', serviceId).order('stop_order'),
    supabase.from('service_audits').select('id, decision, notes, created_at, profiles ( full_name, email )')
      .eq('service_id', serviceId).order('created_at', { ascending: false }),
    supabase.from('service_passengers').select('passenger_id, attendance_status, passengers ( full_name )')
      .eq('service_id', serviceId),
    supabase.from('incidents').select('id, title, severity, status, reported_at')
      .eq('service_id', serviceId).is('deleted_at', null).order('reported_at'),
  ])

  if (!rawService) notFound()

  const service = rawService as unknown as Service
  const metrics = rawMetrics as Metrics | null
  const events = (rawEvents ?? []) as EventRow[]
  const stops = (rawStops ?? []) as StopRow[]
  const audits = (rawAudits ?? []) as unknown as AuditRow[]
  const pax = (rawPax ?? []) as unknown as PaxRow[]
  const incidents = rawIncidents ?? []
  const route = one(service.routes)
  const driver = one(service.drivers)
  const vehicle = one(service.vehicles)
  const contract = one(service.contracts)

  // Trayectoria: la consolidada al cierre; si el servicio sigue abierto, en vivo.
  let trajectory = metrics?.trajectory ?? []
  let simulatedLive = 0
  if (!metrics) {
    const { data: locs } = await supabase.from('service_locations')
      .select('latitude, longitude, recorded_at, is_simulated')
      .eq('service_id', serviceId).order('recorded_at').limit(2000)
    const rows = (locs ?? []) as LocationRow[]
    trajectory = rows.map(l => ({ lat: Number(l.latitude), lng: Number(l.longitude), at: l.recorded_at }))
    simulatedLive = rows.filter(l => l.is_simulated).length
  }

  const closed = service.status === 'completed' || service.status === 'cancelled'
  const st = serviceStatusMeta(service.status)
  const au = auditStatusMeta(service.audit_status)
  const title = service.service_code ?? `#${service.id.slice(0, 8).toUpperCase()}`

  // ── Línea de vida ─────────────────────────────────────────────────────────
  const firstPing = trajectory[0]?.at ?? null
  const lastPing = trajectory[trajectory.length - 1]?.at ?? null
  const milestones: { key: string; label: string; at: string | null; detail?: string; tone: 'done' | 'pending' | 'danger' }[] = [
    {
      key: 'assigned',
      label: 'Viaje creado y asignado por la central',
      at: service.created_at,
      detail: [
        driver?.full_name ?? 'Sin conductor',
        vehicle?.plate,
        `${pax.length} pasajero${pax.length === 1 ? '' : 's'}`,
        contract?.contract_name ?? contract?.client_name,
      ].filter(Boolean).join(' · '),
      tone: driver ? 'done' : 'pending',
    },
  ]
  milestones.push({
    key: 'started', label: 'Inicio del viaje', at: service.actual_start_at,
    detail: metrics?.start_delay_minutes != null ? `${formatMinutes(metrics.start_delay_minutes)} vs. programado` : undefined,
    tone: service.actual_start_at ? 'done' : 'pending',
  })
  milestones.push({
    key: 'tracking', label: 'Recorrido GPS', at: firstPing,
    detail: trajectory.length ? `${trajectory.length} posiciones · última ${formatDateTimeCL(lastPing)}` : 'Sin posiciones',
    tone: trajectory.length ? 'done' : 'pending',
  })
  milestones.push(service.status === 'cancelled'
    ? { key: 'end', label: 'Cancelado', at: service.actual_end_at, detail: service.cancel_reason ?? undefined, tone: 'danger' }
    : {
      key: 'end', label: 'Finalización', at: service.actual_end_at,
      detail: service.completion_source ? (service.completion_source === 'admin' ? 'Cerrado por la central' : 'Cerrado por el conductor') : undefined,
      tone: service.status === 'completed' ? 'done' : 'pending',
    })
  milestones.push({
    key: 'audit', label: 'Auditoría', at: service.audited_at,
    detail: service.audited_at ? `${au.label}${service.audit_notes ? ` · ${service.audit_notes}` : ''}` : undefined,
    tone: service.audited_at ? (service.audit_status === 'observed' ? 'danger' : 'done') : 'pending',
  })

  // ── Estimado vs. real ─────────────────────────────────────────────────────
  const comparison = metrics ? [
    {
      label: 'Hora de inicio',
      estimated: formatDateTimeCL(metrics.scheduled_start_at),
      actual: formatDateTimeCL(service.actual_start_at),
      dev: metrics.start_delay_minutes != null ? `${metrics.start_delay_minutes > 0 ? '+' : ''}${formatMinutes(metrics.start_delay_minutes)}` : '—',
      color: metrics.start_delay_minutes == null ? '#a8b8cc' : metrics.start_delay_minutes > 15 ? '#fda4af' : metrics.start_delay_minutes > 5 ? '#fdba74' : '#55d9ad',
    },
    (() => {
      const pct = deviationPct(metrics.estimated_duration_minutes, metrics.actual_duration_minutes)
      return { label: 'Duración', estimated: formatMinutes(metrics.estimated_duration_minutes), actual: formatMinutes(metrics.actual_duration_minutes), dev: formatDeviation(pct), color: deviationColor(pct) }
    })(),
    (() => {
      const pct = deviationPct(metrics.estimated_distance_km, metrics.actual_distance_km)
      return { label: 'Distancia', estimated: formatKm(metrics.estimated_distance_km), actual: formatKm(metrics.actual_distance_km), dev: formatDeviation(pct), color: deviationColor(pct) }
    })(),
    {
      label: 'Paradas', estimated: String(metrics.stops_total),
      actual: `${metrics.stops_completed} completadas${metrics.stops_skipped ? ` · ${metrics.stops_skipped} saltadas` : ''}${metrics.stops_unconfirmed ? ` · ${metrics.stops_unconfirmed} sin confirmar` : ''}`,
      dev: metrics.stops_total ? `${Math.round((metrics.stops_completed / metrics.stops_total) * 100)} %` : '—',
      color: metrics.stops_completed === metrics.stops_total ? '#55d9ad' : '#fdba74',
    },
    {
      label: 'Pasajeros', estimated: String(metrics.passengers_total),
      actual: `${metrics.passengers_boarded} abordaron${metrics.passengers_no_show ? ` · ${metrics.passengers_no_show} ausentes` : ''}`,
      dev: '—', color: '#a8b8cc',
    },
  ] : []

  // ── Mapa ──────────────────────────────────────────────────────────────────
  const markers: MapMarker[] = stops
    .filter(s => s.latitude != null && s.longitude != null)
    .map(s => ({
      id: s.id, lat: Number(s.latitude), lng: Number(s.longitude),
      label: s.stop_type === 'pickup' ? `Recogida · ${s.name}` : s.stop_type === 'dropoff' ? `Bajada · ${s.name}` : s.stop_type === 'return' ? `Regreso a la base · ${s.name}` : s.name ?? undefined,
      iconLabel: s.stop_type === 'origin' || s.stop_type === 'return' ? 'A' : s.stop_type === 'destination' ? 'B' : String(s.stop_order - 1),
      type: s.stop_type === 'origin' || s.stop_type === 'return' ? 'origin' : s.stop_type === 'destination' ? 'destination' : 'stop',
    }))
  const last = trajectory[trajectory.length - 1]
  if (last) markers.push({ id: 'vehicle', lat: last.lat, lng: last.lng, label: closed ? 'Última posición' : 'Posición actual', type: 'vehicle' })
  const polyline = trajectory.length >= 2 ? trajectory.map(p => ({ lat: p.lat, lng: p.lng })) : undefined
  const simulatedCount = metrics?.simulated_points ?? simulatedLive

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted mb-3">
          <Link href="/dashboard/auditoria" className="hover:text-fg transition-colors">Auditoría</Link>
          <span>›</span>
          <span className="font-medium">{title}</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">
              Viaje asignado por la central
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-bold" style={{ color: '#f1f5f9' }}>{title}</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold" style={{ backgroundColor: au.bg, color: au.text }}>{au.label}</span>
            </div>
            <p className="text-[12px] text-muted mt-1">
              {route?.origin_name ?? '—'} → {route?.destination_name ?? '—'}
            </p>
          </div>
          <Link href={`/dashboard/rutas/${service.id}`} className="px-3 py-2 rounded-md border border-line text-[12px] text-muted hover:text-fg">
            Ver en Gestión de Rutas
          </Link>
        </div>
      </div>

      {(metrics?.anomalies?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {metrics!.anomalies.map(code => {
            const a = anomalyMeta(code)
            return (
              <span key={code} className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{ backgroundColor: a.bg, color: a.text }} title={a.hint}>
                {a.label}<span className="font-normal opacity-80"> — {a.hint}</span>
              </span>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Línea de vida del servicio">
            <ol className="relative">
              {milestones.map((m, i) => {
                const color = m.tone === 'done' ? '#55d9ad' : m.tone === 'danger' ? '#fda4af' : '#4b5f7a'
                return (
                  <li key={m.key} className="flex gap-3">
                    <div className="flex flex-col items-center w-4 flex-shrink-0">
                      <span className="w-3 h-3 rounded-full border-2 mt-1" style={{ borderColor: color, backgroundColor: m.tone === 'pending' ? 'transparent' : color }} />
                      {i < milestones.length - 1 && <span className="flex-1 w-px my-1" style={{ backgroundColor: '#2b405b', minHeight: 20 }} />}
                    </div>
                    <div className="pb-3 min-w-0">
                      <p className="text-[12px] font-semibold" style={{ color: m.tone === 'pending' ? '#a8b8cc' : '#f1f5f9' }}>
                        {m.label}
                        <span className="ml-2 font-normal text-muted">{m.at ? formatDateTimeCL(m.at) : 'Pendiente'}</span>
                      </p>
                      {m.detail && <p className="text-[11px] text-muted mt-0.5 break-words">{m.detail}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </Card>

          <Card
            title="Estimado vs. real"
            right={metrics && <span className="text-[10px] text-muted">Consolidado {formatDateTimeCL(metrics.consolidated_at)}</span>}
          >
            {!metrics ? (
              <p className="text-[12px] text-muted">Las métricas se consolidan al cerrar el servicio.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-line">
                      <th className="py-2 pr-3 font-semibold">Indicador</th>
                      <th className="py-2 pr-3 font-semibold">Estimado</th>
                      <th className="py-2 pr-3 font-semibold">Real</th>
                      <th className="py-2 font-semibold text-right">Desviación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map(c => (
                      <tr key={c.label} className="border-b border-raised last:border-0">
                        <td className="py-2 pr-3 text-muted">{c.label}</td>
                        <td className="py-2 pr-3 text-fg">{c.estimated}</td>
                        <td className="py-2 pr-3 text-fg">{c.actual}</td>
                        <td className="py-2 text-right font-semibold" style={{ color: c.color }}>{c.dev}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-[11px]">
                  <div><p className="text-muted">Pings GPS</p><p className="text-fg font-semibold">{metrics.location_points}{metrics.simulated_points ? ` (${metrics.simulated_points} simulados)` : ''}</p></div>
                  <div><p className="text-muted">Mayor hueco GPS</p><p className="text-fg font-semibold">{formatMinutes(metrics.max_location_gap_minutes)}</p></div>
                  <div><p className="text-muted">Velocidad prom. / máx.</p><p className="text-fg font-semibold">{metrics.avg_speed_kmh ?? '—'} / {metrics.max_speed_kmh ?? '—'} km/h</p></div>
                  <div><p className="text-muted">Incidentes</p><p className="text-fg font-semibold">{metrics.incidents_count}</p></div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Trayectoria" right={simulatedCount > 0 && <span className="text-[10px] font-semibold text-[#fda4af]">Incluye GPS simulado</span>}>
            <div className="-mx-4 -my-3.5">
              <GoogleMapPanel
                height="320px"
                markers={markers}
                polyline={polyline}
                center={markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : undefined}
                overlayMessage={trajectory.length < 2 ? 'Sin recorrido GPS: se muestran solo las paradas.' : undefined}
              />
            </div>
          </Card>

          <Card title="Bitácora inmutable de eventos" right={<span className="text-[10px] text-muted">{events.length} eventos</span>}>
            {events.length === 0 ? (
              <p className="text-[12px] text-muted">Sin eventos registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-line">
                      <th className="py-2 pr-3 font-semibold whitespace-nowrap">Fecha y hora</th>
                      <th className="py-2 pr-3 font-semibold">Actor</th>
                      <th className="py-2 pr-3 font-semibold">Evento</th>
                      <th className="py-2 font-semibold">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(e => (
                      <tr key={e.id} className="border-b border-raised last:border-0 align-top">
                        <td className="py-2 pr-3 text-muted whitespace-nowrap font-mono text-[11px]">{formatDateTimeCL(e.created_at)}</td>
                        <td className="py-2 pr-3 text-muted">{ACTOR_LABELS[e.actor_type] ?? e.actor_type}</td>
                        <td className="py-2 pr-3 text-fg">{EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                        <td className="py-2 text-muted break-words">{eventDetail(e) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Auditar servicio">
            <AuditActions serviceId={service.id} closed={closed} currentStatus={service.audit_status} />
          </Card>

          <Card title="Historial de auditoría">
            {audits.length === 0 ? (
              <p className="text-[12px] text-muted">Aún no se audita.</p>
            ) : (
              <ul className="space-y-3">
                {audits.map(a => {
                  const meta = auditStatusMeta(a.decision)
                  const who = one(a.profiles)
                  return (
                    <li key={a.id} className="border-b border-raised last:border-0 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: meta.bg, color: meta.text }}>{meta.label}</span>
                        <span className="text-[10px] text-muted">{formatDateTimeCL(a.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-muted mt-1">por {who?.full_name ?? who?.email ?? 'Administrador'}</p>
                      {a.notes && <p className="text-[12px] text-fg mt-1 whitespace-pre-wrap">{a.notes}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card title="Asignación">
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between gap-2"><span className="text-muted">Conductor</span><span className="text-fg text-right">{driver?.full_name ?? '—'}</span></div>
              <div className="flex justify-between gap-2 items-center"><span className="text-muted">Vehículo</span><span className="text-right"><Plate value={vehicle?.plate} /></span></div>
              {vehicle && <div className="flex justify-between gap-2"><span className="text-muted">Modelo</span><span className="text-fg text-right">{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—'}</span></div>}
              <div className="flex justify-between gap-2"><span className="text-muted">Contrato</span><span className="text-fg text-right">{contract?.contract_name ?? contract?.client_name ?? '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted">Ruta</span><span className="text-fg text-right">{route?.route_code ?? '—'}</span></div>
            </div>
          </Card>

          <Card title={`Pasajeros (${pax.length})`}>
            {pax.length === 0 ? <p className="text-[12px] text-muted">Sin pasajeros.</p> : (
              <ul className="space-y-1.5 text-[12px]">
                {pax.map(p => (
                  <li key={p.passenger_id} className="flex justify-between gap-2">
                    <span className="text-fg truncate">{one(p.passengers)?.full_name ?? '—'}</span>
                    <span className="text-muted">{({ pending: 'Pendiente', boarded: 'Abordó', no_show: 'Ausente', cancelled: 'Cancelado', not_required: 'No requerido' } as Record<string, string>)[p.attendance_status] ?? p.attendance_status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Incidentes (${incidents.length})`}>
            {incidents.length === 0 ? <p className="text-[12px] text-muted">Sin incidentes.</p> : (
              <ul className="space-y-1.5 text-[12px]">
                {incidents.map(i => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <Link href="/dashboard/incidentes" className="text-fg hover:underline truncate">{i.title ?? 'Incidente'}</Link>
                    <span className="text-muted">{i.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Paradas">
            <ul className="space-y-1.5 text-[12px]">
              {stops.map(s => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="text-fg truncate">{s.stop_order}. {s.name ?? '—'}</span>
                  <span className="text-muted whitespace-nowrap">{formatDateTimeCL(s.completed_at ?? s.actual_arrival_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
