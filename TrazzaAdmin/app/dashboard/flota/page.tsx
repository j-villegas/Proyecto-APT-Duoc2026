import { createClient } from '@/lib/supabase/server'
import KpiCard from '../components/KpiCard'
import AddVehicleModal from './components/AddVehicleModal'
import VehicleDetailModal from './components/VehicleDetailModal'
import DeleteVehicleButton from './components/DeleteVehicleButton'
import FuelLogModal from './components/FuelLogModal'
import FuelHistoryModal from './components/FuelHistoryModal'
import MaintenanceModal from './components/MaintenanceModal'
import Plate from '@/app/components/Plate'

// ─── Types ────────────────────────────────────────────────────────────────────

type VehicleRow = {
  id: string
  plate: string | null
  brand: string | null
  model: string | null
  vehicle_type: string | null
  status: string | null
  current_odometer_km: number | null
  next_maintenance_km: number | null
}

type MaintenanceOrderRow = {
  id: string
  priority: string | null
  status: string | null
  title: string | null
  description: string | null
  scheduled_date: string | null
  vehicles: { plate: string | null } | null
}

type IncidentRow = {
  id: string
  severity: string | null
  title: string | null
  description: string | null
  vehicles: { plate: string | null } | null
}

type FleetAlertLevel = 'critical' | 'high' | 'medium' | 'low'

type FleetAlert = {
  id: string
  level: FleetAlertLevel
  title: string
  detail: string
  sortKey: number
}

type FuelLogRow = {
  id: string
  fuel_datetime: string | null
  liters: number | null
  total_amount: number | null
  station_name: string | null
  odometer_km: number | null
  vehicles: { plate: string | null; brand: string | null; model: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const vehicleTypeLabel: Record<string, string> = {
  bus:     'Bus',
  minibus: 'Minibús',
  van:     'Van',
  furgon:  'Furgón',
  truck:   'Camión',
  other:   'Otro',
}

const statusMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  available:      { label: 'Disponible',      bg: '#123b35', text: '#55d9ad', dot: '#55d9ad' },
  in_service:     { label: 'En Servicio',     bg: '#3b3020', text: '#f8cb78', dot: '#f8cb78' },
  maintenance:    { label: 'Mantención',      bg: '#183352', text: '#7dbbff', dot: '#7dbbff' },
  out_of_service: { label: 'Fuera de Servicio', bg: '#3d2332', text: '#fda4af', dot: '#fda4af' },
}

function getStatus(status: string | null) {
  return statusMeta[status ?? ''] ?? { label: status ?? '—', bg: '#203650', text: '#bac9db', dot: '#a8b8cc' }
}

const fleetAlertStyle: Record<FleetAlertLevel, { dot: string; bg: string; text: string; label: string }> = {
  critical: { dot: '#fda4af', bg: '#3d2332', text: '#fda4af', label: 'Crítica' },
  high:     { dot: '#fdba74', bg: '#3b3020', text: '#fdba74', label: 'Alta'    },
  medium:   { dot: '#f8cb78', bg: '#3b3020', text: '#f8cb78', label: 'Media'   },
  low:      { dot: '#7dbbff', bg: '#183352', text: '#7dbbff', label: 'Baja'    },
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtFuelDatetime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ─── Shared UI ────────────────────────────────────────────────────────────────


function SectionCard({ title, badge, children }: {
  title: string; badge?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line flex-shrink-0">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>
          {title}
        </h3>
        {badge}
      </div>
      {children}
    </div>
  )
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="text-[10px] bg-sunken border border-line text-muted px-2 py-0.5 rounded font-semibold">
      {n}
    </span>
  )
}

function EmptyState({ icon, message, sub }: { icon?: React.ReactNode; message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
      <div className="w-8 h-8 rounded-full bg-raised flex items-center justify-center mb-2.5">
        {icon ?? (
          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        )}
      </div>
      <p className="text-[12px] font-medium text-muted">{message}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FlotaPage() {
  const supabase = await createClient()

  const today      = new Date()
  const todayStr   = today.toISOString().slice(0, 10)
  const in15Days   = new Date(today); in15Days.setDate(in15Days.getDate() + 15)
  const in15DaysStr = in15Days.toISOString().slice(0, 10)

  const [
    { count: total },
    { count: available },
    { count: inService },
    { count: maintenance },
    { data: rawVehicles },
    { data: rawOrdersScheduled },
    { data: rawOrdersOpen },
    { data: rawIncidents },
    { data: rawFuelLogs },
  ] = await Promise.all([
    supabase.from('vehicles').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'available').is('deleted_at', null),
    supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'in_service').is('deleted_at', null),
    supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'maintenance').is('deleted_at', null),

    supabase
      .from('vehicles')
      .select('id, plate, brand, model, vehicle_type, status, current_odometer_km, next_maintenance_km')
      .is('deleted_at', null)
      .order('plate', { ascending: true }),

    // Scheduled maintenance in the next 15 days
    supabase
      .from('maintenance_orders')
      .select('id, priority, status, title, description, scheduled_date, vehicles:vehicle_id(plate)')
      .is('deleted_at', null)
      .eq('status', 'scheduled')
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', in15DaysStr)
      .order('scheduled_date', { ascending: true })
      .limit(10),

    // In-progress (active) failure orders
    supabase
      .from('maintenance_orders')
      .select('id, priority, status, title, description, scheduled_date, vehicles:vehicle_id(plate)')
      .is('deleted_at', null)
      .eq('status', 'in_progress')
      .order('priority', { ascending: false })
      .limit(10),

    // Open vehicle incidents (high/critical or keyword-matched)
    supabase
      .from('incidents')
      .select('id, severity, title, description, vehicles:vehicle_id(plate)')
      .in('status', ['open', 'in_review']).is('deleted_at', null)
      .not('vehicle_id', 'is', null)
      .in('severity', ['high', 'critical'])
      .limit(10),

    // Last 5 fuel logs across the fleet
    supabase
      .from('fuel_logs')
      .select('id, fuel_datetime, liters, total_amount, station_name, odometer_km, vehicles:vehicle_id(plate, brand, model)')
      .is('deleted_at', null)
      .order('fuel_datetime', { ascending: false })
      .limit(5),
  ])

  const vehicles        = (rawVehicles        ?? []) as VehicleRow[]
// supabase-js sin tipos generados infiere las relaciones embebidas como arreglos;
  // en ejecución las many-to-one llegan como objeto, de ahí el doble cast.
  const ordersScheduled = (rawOrdersScheduled ?? []) as unknown as MaintenanceOrderRow[]
  const ordersOpen      = (rawOrdersOpen      ?? []) as unknown as MaintenanceOrderRow[]
  const incidents       = (rawIncidents       ?? []) as unknown as IncidentRow[]
  const recentFuelLogs  = (rawFuelLogs        ?? []) as unknown as FuelLogRow[]

  // ── Build unified fleet alerts ────────────────────────────────────────────
  const fleetAlerts: FleetAlert[] = []

  // 1 & 4 — KM-based alerts from vehicle data
  for (const v of vehicles) {
    const plate = v.plate ?? v.id.slice(0, 8)
    if (v.next_maintenance_km != null && v.current_odometer_km != null) {
      const remaining = v.next_maintenance_km - v.current_odometer_km
      if (remaining <= 0) {
        fleetAlerts.push({
          id:      `km-overdue-${v.id}`,
          level:   'critical',
          title:   'Mantención vencida',
          detail:  `Vehículo ${plate} superó el kilometraje de mantención.`,
          sortKey: 1,
        })
      } else if (remaining <= 1000) {
        fleetAlerts.push({
          id:      `km-approaching-${v.id}`,
          level:   'medium',
          title:   'Mantención próxima',
          detail:  `Vehículo ${plate} vence en ${remaining.toLocaleString('es-CL')} km.`,
          sortKey: 4,
        })
      }
    }
  }

  // 2 & 3 — Open failures from maintenance_orders
  for (const m of ordersOpen) {
    const plate   = (m.vehicles as { plate: string | null } | null)?.plate ?? 'Sin patente'
    const isCrit  = m.priority === 'critical' || m.priority === 'high'
    const snippet = (m.description ?? m.title ?? '—').replace(/\n/g, ' ').slice(0, 70)
    fleetAlerts.push({
      id:      `order-open-${m.id}`,
      level:   isCrit ? (m.priority as FleetAlertLevel) : 'medium',
      title:   isCrit ? 'Falla crítica reportada' : 'Falla reportada',
      detail:  `${plate} · ${snippet}`,
      sortKey: isCrit ? 2 : 3,
    })
  }

  // 5 — Scheduled maintenance upcoming
  for (const m of ordersScheduled) {
    const plate = (m.vehicles as { plate: string | null } | null)?.plate ?? 'Sin patente'
    fleetAlerts.push({
      id:      `order-sched-${m.id}`,
      level:   'low',
      title:   'Mantención programada',
      detail:  `${plate} programado para ${fmtDate(m.scheduled_date)}.`,
      sortKey: 5,
    })
  }

  // 6 — Vehicle incidents (already filtered to high/critical server-side)
  for (const inc of incidents) {
    const plate = (inc.vehicles as { plate: string | null } | null)?.plate ?? 'Sin patente'
    fleetAlerts.push({
      id:      `inc-${inc.id}`,
      level:   inc.severity === 'critical' ? 'critical' : 'high',
      title:   'Incidencia vehicular',
      detail:  `${plate} · ${(inc.title ?? inc.description ?? '—').slice(0, 70)}`,
      sortKey: 6,
    })
  }

  // Sort by sortKey then cap at 5
  fleetAlerts.sort((a, b) => a.sortKey - b.sortKey)
  const visibleAlerts = fleetAlerts.slice(0, 5)

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: '#f1f5f9' }}>
          Gestión de Flota
        </h2>
        <AddVehicleModal />
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Flota Total"
          value={total ?? 0}
          sub="Vehículos registrados"
          tone="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#7dbbff" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
        />
        <KpiCard
          label="Disponibles"
          value={available ?? 0}
          sub="Listos para operar"
          tone="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#55d9ad" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          label="En Servicio"
          value={inService ?? 0}
          sub="En operación activa"
          tone="orange"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>}
        />
        <KpiCard
          label="En Mantención"
          value={maintenance ?? 0}
          sub="Fuera de servicio"
          tone="red"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fda4af" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>}
        />
      </div>

      {/* ── Main two-column ── */}
      <div
        className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(240px,30%)] gap-4 items-start"
      >
        {/* Left — Vehicle table */}
        <SectionCard
          title="Inventario de Vehículos"
          badge={vehicles.length > 0 ? <CountBadge n={vehicles.length} /> : undefined}
        >
          {vehicles.length === 0 ? (
            <EmptyState
              message="No hay vehículos registrados"
              sub={'Haz clic en "+ Añadir Vehículo" para incorporar el primero.'}
              icon={<svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#10223d' }} className="border-b border-raised">
                    {['Patente', 'Vehículo', 'Tipo', 'Estado', 'KM Actual', 'Acción'].map(col => (
                      <th key={col} className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-muted whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map(v => {
                    const sm = getStatus(v.status)
                    return (
                      <tr key={v.id} className="border-b border-raised hover:bg-sunken transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Plate value={v.plate} />
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-[12px] font-medium text-soft">
                            {[v.brand, v.model].filter(Boolean).join(' ') || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-[12px] text-muted">
                            {vehicleTypeLabel[v.vehicle_type ?? ''] ?? v.vehicle_type ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold"
                            style={{ backgroundColor: sm.bg, color: sm.text }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sm.dot }} />
                            {sm.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-[12px] text-muted tabular-nums">
                            {v.current_odometer_km != null
                              ? v.current_odometer_km.toLocaleString('es-CL') + ' km'
                              : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <VehicleDetailModal vehicleId={v.id} />
                            <DeleteVehicleButton vehicleId={v.id} plate={v.plate} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Right column — stacked panels */}
        <div className="flex flex-col gap-4">

          {/* Alertas de Flota */}
          <SectionCard
            title="Alertas de Flota"
            badge={visibleAlerts.length > 0 ? <CountBadge n={fleetAlerts.length} /> : undefined}
          >
            {visibleAlerts.length === 0 ? (
              <EmptyState
                message="Sin alertas de flota"
                sub="Las alertas de vehículos aparecerán aquí."
                icon={
                  <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                }
              />
            ) : (
              <ul className="divide-y divide-raised max-h-64 overflow-y-auto">
                {visibleAlerts.map(a => {
                  const st = fleetAlertStyle[a.level]
                  return (
                    <li key={a.id} className="px-4 py-3 flex items-start gap-2.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ backgroundColor: st.dot }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold leading-snug" style={{ color: '#f1f5f9' }}>
                          {a.title}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5 leading-snug line-clamp-2">
                          {a.detail}
                        </p>
                      </div>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 whitespace-nowrap"
                        style={{ backgroundColor: st.bg, color: st.text }}
                      >
                        {st.label}
                      </span>
                    </li>
                  )
                })}
                {fleetAlerts.length > 5 && (
                  <li className="px-4 py-2 text-center">
                    <span className="text-[10px] text-muted">
                      +{fleetAlerts.length - 5} alerta{fleetAlerts.length - 5 !== 1 ? 's' : ''} adicional{fleetAlerts.length - 5 !== 1 ? 'es' : ''}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </SectionCard>

          {/* Últimas Cargas de Combustible */}
          <SectionCard
            title="Últimas Cargas de Combustible"
            badge={recentFuelLogs.length > 0 ? <CountBadge n={recentFuelLogs.length} /> : undefined}
          >
            {recentFuelLogs.length === 0 ? (
              <EmptyState
                message="Sin cargas registradas"
                sub="Las cargas de combustible aparecerán aquí."
                icon={
                  <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                }
              />
            ) : (
              <ul className="divide-y divide-raised">
                {recentFuelLogs.map(log => {
                  const veh   = log.vehicles as { plate: string | null; brand: string | null; model: string | null } | null
                  const model = [veh?.brand, veh?.model].filter(Boolean).join(' ')
                  return (
                    <li key={log.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Plate value={veh?.plate} />
                        {model && (
                          <p className="text-[10px] text-muted leading-snug">{model}</p>
                        )}
                        <p className="text-[10px] text-muted mt-0.5 leading-snug">
                          {log.station_name ? `${log.station_name} · ` : ''}{fmtFuelDatetime(log.fuel_datetime)}
                        </p>
                        {log.odometer_km != null && (
                          <p className="text-[10px] text-muted">{log.odometer_km.toLocaleString('es-CL')} km</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                        <span className="text-[14px] font-bold leading-none" style={{ color: '#10b98b' }}>
                          {log.liters != null ? `${log.liters % 1 === 0 ? log.liters : log.liters.toFixed(1)} L` : '—'}
                        </span>
                        {log.total_amount != null && (
                          <span className="text-[10px] text-muted">
                            ${log.total_amount.toLocaleString('es-CL')}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {/* Footer: Ver historial */}
            <div className="px-4 py-2.5 border-t border-raised flex items-center justify-end">
              <FuelHistoryModal />
            </div>
          </SectionCard>

          {/* Acciones Rápidas */}
          <SectionCard title="Acciones Rápidas">
            <div className="px-4 py-4 flex flex-col gap-2.5">
              <FuelLogModal />
              <MaintenanceModal />
            </div>
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
