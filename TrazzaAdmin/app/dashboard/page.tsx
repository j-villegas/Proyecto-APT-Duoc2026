//esta es la ruta : app/dashboard/page.tsx

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { addDays, dayStartCL, isPastCL, todayCL } from '@/lib/date'
import { getServiceKpis } from '@/lib/service-kpis'
import DashboardAlertsModal from './components/DashboardAlertsModal'
import KpiCard from './components/KpiCard'
import GoogleMapPanel from './components/GoogleMapPanel'

// ─── Types ───────────────────────────────────────────────────────────────────

type ServiceTodayRow = {
  id: string
  service_code: string | null
  status: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  drivers: { full_name: string | null } | null
  vehicles: { plate: string | null; capacity_passengers: number | null } | null
}

type MaintAlertRow = {
  id: string
  title: string | null
  priority: string | null
  vehicles: { plate: string | null } | null
}

type DriverLicRow = {
  id: string
  full_name: string | null
  license_expires_at: string | null
}

type IncidentAlertRow = {
  id: string
  title: string | null
  description: string | null
  severity: string | null
}

type OpAlertLevel = 'critical' | 'high' | 'medium'

type UnifiedAlert = {
  id:      string
  title:   string
  detail:  string
  level:   OpAlertLevel
  sortKey: number
}

type FuelLogRow = { liters: number | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntilFn(iso: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const exp = new Date(iso); exp.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(t: string | null): string {
  if (!t) return '—'
  return t.slice(0, 5)
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

// ─── Alert level dot ─────────────────────────────────────────────────────────

function AlertDot({ level }: { level: OpAlertLevel }) {
  const colors: Record<OpAlertLevel, string> = {
    critical: '#fda4af',
    high:     '#fdba74',
    medium:   '#f8cb78',
  }
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: colors[level] }} />
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <div className="w-10 h-10 rounded-full bg-[#203650] flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-[#a8b8cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p className="text-[12px] font-medium text-[#a8b8cc]">{message}</p>
      {sub && <p className="text-[11px] text-[#a8b8cc] mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Card Shell ───────────────────────────────────────────────────────────────

function Card({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[#142942] border border-[#2b405b] rounded-lg overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2b405b] flex-shrink-0">
        <h3 className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#f1f5f9' }}>{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()

  const today    = todayCL()
  const todayStart    = dayStartCL(today)
  const tomorrowStart = dayStartCL(addDays(today, 1))
  const in30Days = addDays(today, 30)

  const [
    { count: fleetActiveCount },
    kpis,
    { count: critOACount },
    { data: fuelToday },
    { data: rawMaintAlerts },
    { data: rawDriverLic },
    { data: rawIncidents },
    { data: rawOAAlerts },
    { data: servicesToday },
  ] = await Promise.all([
    // KPI 1: active fleet (available + in_service + maintenance, not deleted)
    supabase.from('vehicles').select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('status', ['available', 'in_service', 'maintenance']),

    // KPI 2: cumplimiento + servicios no iniciados (excluye eliminados, hora de Chile)
    getServiceKpis(supabase),

    // KPI 3 partial: operational_alerts critical + open
    supabase.from('operational_alerts').select('*', { count: 'exact', head: true })
      .eq('status', 'open').eq('severity', 'critical'),

    // KPI 4: fuel logs today
    supabase.from('fuel_logs').select('liters').is('deleted_at', null)
      .gte('fuel_datetime', todayStart).lt('fuel_datetime', tomorrowStart),

    // Alerts: maintenance_orders in_progress + high/critical
    supabase.from('maintenance_orders')
      .select('id, title, priority, vehicles:vehicle_id(plate)')
      .eq('status', 'in_progress').in('priority', ['high', 'critical'])
      .is('deleted_at', null).limit(20),

    // Alerts: drivers with license expiring ≤30 days or already expired
    supabase.from('drivers')
      .select('id, full_name, license_expires_at')
      .is('deleted_at', null)
      .not('license_expires_at', 'is', null)
      .lte('license_expires_at', in30Days),

    // Alerts: critical open incidents
    supabase.from('incidents')
      .select('id, title, description, severity')
      .in('status', ['open', 'in_review']).is('deleted_at', null).eq('severity', 'critical').limit(15),

    // Alerts: operational_alerts (open, high+)
    supabase.from('operational_alerts')
      .select('id, title, severity')
      .eq('status', 'open').in('severity', ['critical', 'high', 'medium'])
      .order('created_at', { ascending: false }).limit(15),

    // Routes today: scheduled or in_progress with driver/vehicle join
    supabase.from('services')
      .select('id, service_code, status, scheduled_date, scheduled_start_time, drivers:driver_id(full_name), vehicles:vehicle_id(plate, capacity_passengers)')
      .eq('scheduled_date', today)
      .is('deleted_at', null)
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_start_time', { ascending: true })
      .limit(15),
  ])

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalFuelToday = ((fuelToday ?? []) as FuelLogRow[]).reduce(
    (acc, r) => acc + (r.liters ?? 0), 0
  )

  const { now, overdueRows, completedCount, evaluableCount, compliancePct: cumplimiento } = kpis
  const overdueCount  = overdueRows.length

  // KPI 3: aggregate all critical alert sources
  const maintAlerts  = (rawMaintAlerts ?? []) as MaintAlertRow[]
  const driverLics   = (rawDriverLic   ?? []) as DriverLicRow[]
  const incidents    = (rawIncidents   ?? []) as IncidentAlertRow[]

  const countMaintCrit    = maintAlerts.length
  const countExpiredLic   = driverLics.filter(d => d.license_expires_at && daysUntilFn(d.license_expires_at) < 0).length
  const countExpiringLic7 = driverLics.filter(d => d.license_expires_at && daysUntilFn(d.license_expires_at) >= 0 && daysUntilFn(d.license_expires_at) <= 7).length

  const totalCriticalAlerts = (critOACount ?? 0) + countMaintCrit + countExpiredLic + countExpiringLic7 + incidents.length + overdueCount

  // ── Build unified Alertas de Operación ────────────────────────────────────

  const unifiedAlerts: UnifiedAlert[] = []

  // Source 1: maintenance in_progress + high/critical
  for (const m of maintAlerts) {
    const plate = (m.vehicles as { plate: string | null } | null)?.plate ?? 'Sin patente'
    unifiedAlerts.push({
      id:      `maint-${m.id}`,
      title:   'Falla crítica de vehículo',
      detail:  `${plate} · ${m.title ?? 'Sin título'}`,
      level:   m.priority === 'critical' ? 'critical' : 'high',
      sortKey: 1,
    })
  }

  // Source 2: expired licenses
  for (const d of driverLics) {
    if (!d.license_expires_at) continue
    const days = daysUntilFn(d.license_expires_at)
    if (days < 0) {
      unifiedAlerts.push({
        id:      `lic-exp-${d.id}`,
        title:   'Licencia vencida',
        detail:  `${d.full_name ?? 'Conductor'} · Venció el ${fmtDateShort(d.license_expires_at)}`,
        level:   'critical',
        sortKey: 2,
      })
    } else if (days <= 7) {
      unifiedAlerts.push({
        id:      `lic-7-${d.id}`,
        title:   'Licencia por vencer',
        detail:  `${d.full_name ?? 'Conductor'} · Vence en ${days} día${days !== 1 ? 's' : ''}`,
        level:   'high',
        sortKey: 3,
      })
    }
  }

  // Source 3: overdue scheduled services
  for (const s of overdueRows) {
    unifiedAlerts.push({
      id:      `svc-${s.id}`,
      title:   'Ruta no iniciada',
      detail:  `${s.service_code ?? `#${s.id.slice(0, 8)}`} · ${fmtDateShort(s.scheduled_date)} ${fmtTime(s.scheduled_start_time)}`,
      level:   'high',
      sortKey: 4,
    })
  }

  // Source 4: critical incidents
  for (const inc of incidents) {
    unifiedAlerts.push({
      id:      `inc-${inc.id}`,
      title:   'Incidencia crítica',
      detail:  inc.title ?? inc.description ?? 'Sin detalle',
      level:   'critical',
      sortKey: 1,
    })
  }

  // Source 5: operational_alerts (high/medium supplement)
  const oaAlerts = (rawOAAlerts ?? []) as { id: string; title: string | null; severity: string | null }[]
  for (const oa of oaAlerts) {
    const lvl: OpAlertLevel = oa.severity === 'critical' ? 'critical' : oa.severity === 'high' ? 'high' : 'medium'
    unifiedAlerts.push({
      id:      `oa-${oa.id}`,
      title:   oa.title ?? 'Alerta operacional',
      detail:  `Severidad: ${lvl === 'critical' ? 'Crítica' : lvl === 'high' ? 'Alta' : 'Media'}`,
      level:   lvl,
      sortKey: lvl === 'critical' ? 1 : lvl === 'high' ? 3 : 5,
    })
  }

  unifiedAlerts.sort((a, b) => a.sortKey - b.sortKey)
  const visibleAlerts = unifiedAlerts.slice(0, 5)

  // ── Route table helpers ────────────────────────────────────────────────────

  const todayRoutes = (servicesToday ?? []) as ServiceTodayRow[]

  function getVisualStatus(s: ServiceTodayRow) {
    if (s.status === 'in_progress') return { label: 'En ruta',    bg: '#3b3020', text: '#f8cb78' }
    if (s.status === 'scheduled') {
      if (isPastCL(s.scheduled_date, s.scheduled_start_time, now)) return { label: 'No iniciada', bg: '#3d2332', text: '#fda4af' }
      return           { label: 'Programada',  bg: '#183352', text: '#7dbbff' }
    }
    return { label: s.status ?? '—', bg: '#203650', text: '#a8b8cc' }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <KpiCard
          label="Flota Activa"
          value={fleetActiveCount ?? 0}
          sub="Vehículos operativos"
          tone="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#7dbbff" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
        />

        <KpiCard
          label="Cumplimiento"
          value={cumplimiento !== null ? `${cumplimiento}%` : '—'}
          sub={cumplimiento !== null ? `${completedCount} / ${evaluableCount} servicios` : 'Sin servicios evaluables'}
          tone="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#55d9ad" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />

        <KpiCard
          label="Alertas Críticas"
          value={totalCriticalAlerts}
          sub={totalCriticalAlerts > 0 ? 'Requieren atención' : 'Sin alertas críticas'}
          tone="red"
          variant="alert"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fda4af" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
        />

        <KpiCard
          label="Combustible Hoy"
          value={totalFuelToday > 0 ? `${totalFuelToday.toFixed(1)}L` : '—'}
          sub={totalFuelToday > 0 ? 'Registrados hoy' : 'Sin registros hoy'}
          tone="orange"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>}
        />
      </div>

      {/* ── Main two-column ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">

        {/* Map — 2/3 */}
        <div className="lg:col-span-2">
          <Card title="Localización en Tiempo Real"
            badge={<span className="text-[10px] bg-[#0d1d37] border border-[#2b405b] text-[#a8b8cc] px-2 py-0.5 rounded font-medium">En vivo pendiente</span>}>
            <GoogleMapPanel
              height="300px"
              overlayMessage="Ubicación en vivo pendiente de app conductor."
            />
          </Card>
        </div>

        {/* Alerts — 1/3 */}
        <div className="lg:col-span-1">
          <Card
            title="Alertas de Operación"
            badge={
              unifiedAlerts.length > 0
                ? <span className="text-[10px] bg-[#3d2332] border border-rose-900 text-rose-300 px-2 py-0.5 rounded font-semibold">{unifiedAlerts.length}</span>
                : undefined
            }
          >
            <div className="flex-1 overflow-y-auto">
              {visibleAlerts.length === 0 ? (
                <EmptyState message="Sin alertas activas" sub="La operación está en orden." />
              ) : (
                <ul className="divide-y divide-[#203650]">
                  {visibleAlerts.map(a => (
                    <li key={a.id} className="px-4 py-3 flex items-start gap-2.5">
                      <AlertDot level={a.level} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[#f1f5f9] leading-snug">{a.title}</p>
                        <p className="text-[10px] text-[#a8b8cc] mt-0.5 leading-snug line-clamp-2">{a.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {unifiedAlerts.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[#203650] flex items-center justify-between flex-shrink-0">
                {unifiedAlerts.length > 5 && (
                  <span className="text-[10px] text-[#a8b8cc]">+{unifiedAlerts.length - 5} más</span>
                )}
                <div className="ml-auto">
                  <DashboardAlertsModal />
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Routes table ── */}
      <Card
        title="Rutas Programadas de Hoy"
        badge={<span className="text-[10px] bg-[#0d1d37] border border-[#2b405b] text-[#a8b8cc] px-2 py-0.5 rounded font-medium">{today}</span>}
      >
        {todayRoutes.length === 0 ? (
          <EmptyState message="No hay rutas programadas para hoy" sub="Los servicios de hoy aparecerán aquí." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#203650]" style={{ backgroundColor: '#0d1d37' }}>
                  {['Servicio', 'Hora', 'Conductor', 'Vehículo', 'Cap.', 'Estado', 'Acción'].map(col => (
                    <th key={col} className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2.5 text-[#a8b8cc] whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {todayRoutes.map(s => {
                  const drv = s.drivers as { full_name: string | null } | null
                  const veh = s.vehicles as { plate: string | null; capacity_passengers: number | null } | null
                  const vs  = getVisualStatus(s)
                  return (
                    <tr key={s.id} className="border-b border-[#203650] hover:bg-[#0d1d37] transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-[12px] font-bold font-mono" style={{ color: '#f1f5f9' }}>
                          {s.service_code ?? `#${s.id.slice(0, 8).toUpperCase()}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-[12px] text-[#d5e0ed] tabular-nums">{fmtTime(s.scheduled_start_time)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[12px] text-[#d5e0ed]">{drv?.full_name ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-[12px] font-mono font-bold" style={{ color: '#f1f5f9' }}>
                          {veh?.plate ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-[12px] text-[#a8b8cc] tabular-nums">
                          {veh?.capacity_passengers != null ? veh.capacity_passengers : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ backgroundColor: vs.bg, color: vs.text }}>
                          {vs.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link
                          href={`/dashboard/rutas/${s.id}`}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded border border-[#2b405b] text-[#d5e0ed] hover:bg-[#0d1d37] transition-colors whitespace-nowrap"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
