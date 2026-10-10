import { createClient } from '@/lib/supabase/server'
import KpiCard from '../components/KpiCard'
import AddDriverModal from './components/AddDriverModal'
import DriverDetailModal from './components/DriverDetailModal'
import ServiceHistoryModal from './components/ServiceHistoryModal'
import DriverAlertsModal from './components/DriverAlertsModal'
import { serviceStatusMeta } from '@/lib/service-status'

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverRow = {
  id: string
  driver_code: string | null
  full_name: string | null
  rut: string | null
  license_type: string | null
  license_expires_at: string | null
  status: string | null
}

type ServiceLastRow = {
  driver_id: string | null
  scheduled_at: string | null
}

type RecentServiceRow = {
  id: string
  service_code: string | null
  status: string | null
  scheduled_date: string | null
  drivers: { full_name: string | null; driver_code: string | null } | null
  vehicles: { plate: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  available:  { label: 'Disponible', bg: '#123b35', text: '#55d9ad', dot: '#55d9ad' },
  in_service: { label: 'En ruta',    bg: '#3b3020', text: '#f8cb78', dot: '#f8cb78' },
  rest:       { label: 'Descanso',   bg: '#183352', text: '#7dbbff', dot: '#7dbbff' },
  inactive:   { label: 'Inactivo',   bg: '#203650', text: '#a8b8cc', dot: '#a8b8cc' },
  suspended:  { label: 'Suspendido', bg: '#3d2332', text: '#fda4af', dot: '#fda4af' },
}

function getStatus(status: string | null) {
  return statusMeta[status ?? ''] ?? { label: status ?? '—', bg: '#203650', text: '#bac9db', dot: '#a8b8cc' }
}


function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(iso: string): number {
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const exp  = new Date(iso); exp.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Shared UI ────────────────────────────────────────────────────────────────


function SectionCard({ title, badge, children }: {
  title: string; badge?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden flex flex-col h-full">
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        )}
      </div>
      <p className="text-[12px] font-medium text-muted">{message}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ConductoresPage() {
  const supabase = await createClient()

  const today        = new Date(); today.setHours(0, 0, 0, 0)
  const in30         = new Date(today); in30.setDate(in30.getDate() + 30)
  const in30ISO      = in30.toISOString()

  const [
    { count: total },
    { count: available },
    { count: inService },
    { count: expiringLicenses },
    { data: rawDrivers },
    { data: rawServices },
    { data: rawRecentServices },
  ] = await Promise.all([
    supabase.from('drivers').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'available').is('deleted_at', null),
    supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'in_service').is('deleted_at', null),
    supabase.from('drivers').select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('license_expires_at', 'is', null)
      .lte('license_expires_at', in30ISO),

    supabase.from('drivers')
      .select('id, driver_code, full_name, rut, license_type, license_expires_at, status')
      .is('deleted_at', null)
      .order('full_name', { ascending: true }),

    supabase.from('services')
      .select('driver_id, scheduled_at')
      .not('driver_id', 'is', null)
      .order('scheduled_at', { ascending: false })
      .limit(500),

    // Last 5 services with driver/vehicle info for the summary card
    supabase.from('services')
      .select('id, service_code, status, scheduled_date, drivers:driver_id(full_name, driver_code), vehicles:vehicle_id(plate)')
      .is('deleted_at', null)
      .not('driver_id', 'is', null)
      .order('scheduled_date', { ascending: false })
      .limit(5),
  ])

  const drivers        = (rawDrivers        ?? []) as DriverRow[]
  const services       = (rawServices       ?? []) as ServiceLastRow[]
// supabase-js sin tipos generados infiere las relaciones embebidas como arreglos;
  // en ejecución las many-to-one llegan como objeto, de ahí el doble cast.
  const recentServices = (rawRecentServices ?? []) as unknown as RecentServiceRow[]

  // Build map: driver_id → most recent scheduled_at (already sorted desc)
  const lastServiceMap = new Map<string, string>()
  for (const s of services) {
    if (s.driver_id && !lastServiceMap.has(s.driver_id)) {
      lastServiceMap.set(s.driver_id, s.scheduled_at ?? '')
    }
  }

  // Build license alerts from driver data
  type LicenseAlert = { id: string; name: string | null; expires_at: string; days: number; expired: boolean }
  const licenseAlerts: LicenseAlert[] = drivers
    .filter(d => d.license_expires_at != null)
    .map(d => {
      const days    = daysUntil(d.license_expires_at!)
      const expired = days < 0
      return { id: d.id, name: d.full_name, expires_at: d.license_expires_at!, days, expired }
    })
    .filter(a => a.days <= 30)
    .sort((a, b) => a.days - b.days)

  const visibleAlerts = licenseAlerts.slice(0, 5)

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: '#f1f5f9' }}>
          Gestión de Conductores
        </h2>
        <AddDriverModal />
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Conductores Totales"
          value={total ?? 0}
          sub="Conductores registrados"
          tone="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#7dbbff" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
        />
        <KpiCard
          label="Disponibles"
          value={available ?? 0}
          sub="Listos para operar"
          tone="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#55d9ad" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          label="En Ruta"
          value={inService ?? 0}
          sub="Servicios activos"
          tone="orange"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>}
        />
        <KpiCard
          label="Licencias por Vencer"
          value={expiringLicenses ?? 0}
          sub="Próximos 30 días"
          tone="red"
          variant="alert"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fda4af" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
        />
      </div>

      {/* ── Main two-column ── */}
      <div
        className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(240px,30%)] gap-4 items-start"
      >
        {/* Left — Drivers table */}
        <SectionCard
          title="Directorio de Conductores"
          badge={drivers.length > 0 ? <CountBadge n={drivers.length} /> : undefined}
        >
          {drivers.length === 0 ? (
            <EmptyState
              message="No hay conductores registrados"
              sub={'Haz clic en "+ Añadir Conductor" para incorporar el primero.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#10223d' }} className="border-b border-raised">
                    {['ID / Conductor', 'RUT', 'Categoría', 'Estado', 'Último Servicio', 'Acción'].map(col => (
                      <th key={col} className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-muted whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drivers.map(d => {
                    const sm          = getStatus(d.status)
                    const lastSvcISO  = lastServiceMap.get(d.id)
                    const lastSvc     = lastSvcISO ? formatDate(lastSvcISO) : 'Sin registros'
                    return (
                      <tr key={d.id} className="border-b border-raised hover:bg-sunken transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="text-[12px] font-bold leading-snug" style={{ color: '#f1f5f9' }}>
                            {d.full_name ?? '—'}
                          </p>
                          {d.driver_code && (
                            <p className="text-[10px] text-muted mt-0.5">{d.driver_code}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-[12px] text-muted">{d.rut ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="inline-block bg-sunken border border-line text-soft text-[11px] font-semibold px-2 py-0.5 rounded">
                            {d.license_type ?? '—'}
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
                          <span className={`text-[12px] ${lastSvc === 'Sin registros' ? 'text-muted italic' : 'text-muted'}`}>
                            {lastSvc}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <DriverDetailModal driverId={d.id} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Alertas de Conductores */}
          <SectionCard
            title="Alertas de Conductores"
            badge={licenseAlerts.length > 0 ? <CountBadge n={licenseAlerts.length} /> : undefined}
          >
            {licenseAlerts.length === 0 ? (
              <EmptyState
                message="Sin alertas de conductores"
                sub="Las licencias y alertas aparecerán aquí."
                icon={
                  <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                }
              />
            ) : (
              <ul className="divide-y divide-raised max-h-64 overflow-y-auto">
                {visibleAlerts.map(a => {
                  const expired  = a.expired
                  const dotColor = expired ? '#fda4af' : a.days <= 7 ? '#fdba74' : '#f8cb78'
                  return (
                    <li key={a.id} className="px-4 py-3 flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: dotColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-fg leading-snug truncate">
                          {a.name ?? 'Conductor sin nombre'}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: dotColor }}>
                          {expired
                            ? `Licencia vencida el ${formatDate(a.expires_at)}`
                            : `Licencia vence en ${a.days} día${a.days !== 1 ? 's' : ''} (${formatDate(a.expires_at)})`}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {licenseAlerts.length > 0 && (
              <div className="px-4 py-2.5 border-t border-raised flex items-center justify-between">
                {licenseAlerts.length > 5 && (
                  <span className="text-[10px] text-muted">+{licenseAlerts.length - 5} más</span>
                )}
                <div className="ml-auto">
                  <DriverAlertsModal />
                </div>
              </div>
            )}
          </SectionCard>

          {/* Últimos Servicios */}
          <SectionCard
            title="Últimos Servicios"
            badge={recentServices.length > 0 ? <CountBadge n={recentServices.length} /> : undefined}
          >
            {recentServices.length === 0 ? (
              <EmptyState
                message="Sin servicios registrados"
                sub="Los servicios de conductores aparecerán aquí."
                icon={
                  <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                }
              />
            ) : (
              <ul className="divide-y divide-raised">
                {recentServices.map(s => {
                  const drv = s.drivers as { full_name: string | null; driver_code: string | null } | null
                  const veh = s.vehicles as { plate: string | null } | null
                  const sm  = serviceStatusMeta(s.status)
                  return (
                    <li key={s.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-fg leading-snug">
                          {drv?.full_name ?? '—'}
                        </p>
                        {drv?.driver_code && (
                          <p className="text-[10px] text-muted">{drv.driver_code}</p>
                        )}
                        <p className="text-[10px] text-muted mt-0.5 leading-snug">
                          {s.service_code ?? `#${s.id.slice(0, 8)}`}
                          {veh?.plate ? ` · ${veh.plate}` : ''}
                          {s.scheduled_date ? ` · ${formatDate(s.scheduled_date)}` : ''}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0 mt-0.5 whitespace-nowrap"
                        style={{ backgroundColor: sm.bg, color: sm.text }}
                      >
                        {sm.label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="px-4 py-2.5 border-t border-raised flex items-center justify-end">
              <ServiceHistoryModal />
            </div>
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
