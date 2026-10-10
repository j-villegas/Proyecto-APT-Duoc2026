import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { addDays, isPastCL, nowCL, todayCL } from '@/lib/date'
import { getServiceKpis } from '@/lib/service-kpis'
import AddRouteModal from './components/AddRouteModal'
import AddContractModal from './components/AddContractModal'
import ContractsPanel from './components/ContractsPanel'
import KpiCard from '../components/KpiCard'
import RoutesCatalog, { type CatalogRoute } from './components/RoutesCatalog'

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverRef  = { id: string; full_name: string | null } | null
type VehicleRef = { id: string; plate: string | null; model: string | null } | null

type ServiceRow = {
  id: string
  service_code: string | null
  status: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  drivers: DriverRef | NonNullable<DriverRef>[]
  vehicles: VehicleRef | NonNullable<VehicleRef>[]
}

type ContractRow = {
  id: string
  contract_name: string | null
  client_name: string | null
  start_date: string | null
  end_date: string | null
  priority: string | null
  status: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns a display-only virtual status; never writes to DB.
function visualStatus(
  dbStatus: string | null,
  scheduledDate: string | null,
  scheduledTime: string | null,
  now: ReturnType<typeof nowCL>,
): string {
  if (dbStatus !== 'scheduled') return dbStatus ?? ''
  return isPastCL(scheduledDate, scheduledTime, now) ? 'overdue' : 'scheduled'
}

function statusMeta(vstatus: string | null): { label: string; bg: string; text: string } {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    scheduled:   { label: 'Programado',   bg: '#183352', text: '#7dbbff' },
    overdue:     { label: 'No iniciada',  bg: '#3b3020', text: '#fdba74' },
    in_progress: { label: 'En Tránsito',  bg: '#3b3020', text: '#f8cb78' },
    completed:   { label: 'Finalizado',   bg: '#123b35', text: '#55d9ad' },
    cancelled:   { label: 'Cancelado',    bg: '#3d2332', text: '#fda4af' },
  }
  return map[vstatus ?? ''] ?? { label: vstatus ?? '—', bg: '#203650', text: '#bac9db' }
}

function formatTime(time: string | null): string {
  if (!time) return '—'
  return time.length >= 5 ? time.slice(0, 5) : time
}

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SectionCard({ title, badge, children }: {
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-[#142942] border border-[#2b405b] rounded-lg overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2b405b] gap-2 flex-shrink-0">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>
          {title}
        </h3>
        {badge}
      </div>
      {children}
    </div>
  )
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="text-[10px] bg-[#10223d] border border-[#2b405b] text-[#a8b8cc] px-2 py-0.5 rounded font-semibold">
      {count}
    </span>
  )
}

function EmptyStateCompact({ icon, message, sub }: {
  icon?: React.ReactNode
  message: string
  sub?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
      <div className="w-8 h-8 rounded-full bg-[#203650] flex items-center justify-center mb-2.5">
        {icon ?? (
          <svg className="w-4 h-4 text-[#a8b8cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        )}
      </div>
      <p className="text-[12px] font-medium text-[#a8b8cc]">{message}</p>
      {sub && <p className="text-[11px] text-[#a8b8cc] mt-0.5">{sub}</p>}
    </div>
  )
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RutasPage() {
  const supabase = await createClient()

  const today = todayCL()
  const [{ data: catalogRoutes, error: catalogError }, { data: auth }] = await Promise.all([
    supabase.from('routes').select('id, route_code, name, origin_name, destination_name, status, notes, estimated_duration_minutes, estimated_distance_km').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ])
  const { data: catalogProfile } = auth.user
    ? await supabase.from('profiles').select('role, status, deleted_at').eq('id', auth.user.id).single()
    : { data: null }

  const [
    kpis,
    { data: rawServices },
    { data: rawContracts },
  ] = await Promise.all([
    getServiceKpis(supabase),

    supabase
      .from('services')
      .select(`
        id,
        service_code,
        status,
        scheduled_date,
        scheduled_start_time,
        drivers ( id, full_name ),
        vehicles ( id, plate, model )
      `)
      .in('status', ['scheduled', 'in_progress'])
      .is('deleted_at', null)
      .gte('scheduled_date', addDays(today, -7))
      .order('scheduled_date', { ascending: true })
      .order('scheduled_start_time', { ascending: true })
      .limit(30),

    supabase
      .from('contracts')
      .select('id, contract_name, client_name, start_date, end_date, priority, status')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .limit(100),
  ])

  const services  = (rawServices  ?? []) as ServiceRow[]
  const contracts = (rawContracts ?? []) as ContractRow[]
  const { compliancePct: efficiencyPct, completedCount, evaluableCount } = kpis
  const overdueCount = kpis.overdueRows.length

  return (
    <div className="space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4">
        <h2
          className="text-[13px] font-bold uppercase tracking-widest"
          style={{ color: '#f1f5f9' }}
        >
          Gestión de Rutas
        </h2>
        <AddRouteModal />
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Cumplimiento de Rutas"
          value={efficiencyPct !== null ? `${efficiencyPct}%` : '—'}
          sub={efficiencyPct !== null ? `${completedCount} / ${evaluableCount} servicios` : 'Sin servicios evaluables'}
          tone="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#55d9ad" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          label="Programadas"
          value={kpis.scheduledFutureCount}
          sub="Servicios pendientes"
          tone="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#7dbbff" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>}
        />
        <KpiCard
          label="En Ruta"
          value={kpis.inProgressCount}
          sub="Servicios activos"
          tone="orange"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>}
        />
        <KpiCard
          label="No Iniciadas"
          value={overdueCount}
          sub="Requieren revisión"
          tone="red"
          variant="alert"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fda4af" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
        />
      </div>

      {/* ── Main two-column ── */}
      <RoutesCatalog routes={(catalogRoutes ?? []) as CatalogRoute[]} error={Boolean(catalogError)} canManage={catalogProfile?.role === 'admin' && catalogProfile.status === 'active' && !catalogProfile.deleted_at} />
      <div
        className="grid grid-cols-1 gap-4"
        style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,35%)' }}
      >

        {/* ── Routes table ── */}
        <SectionCard
          title="Rutas en Ejecución"
          badge={services.length > 0 ? <CountBadge count={services.length} /> : undefined}
        >
          {services.length === 0 ? (
            <EmptyStateCompact
              message="No hay rutas en ejecución o programadas"
              sub="Los servicios activos y programados aparecerán aquí."
              icon={
                <svg className="w-4 h-4 text-[#a8b8cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#10223d' }} className="border-b border-[#203650]">
                    {['ID / Servicio', 'Conductor', 'Vehículo', 'Estado', 'ETA'].map((col) => (
                      <th
                        key={col}
                        className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[#a8b8cc] whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc) => {
                    const vstatus = visualStatus(svc.status, svc.scheduled_date, svc.scheduled_start_time, kpis.now)
                    const sm      = statusMeta(vstatus)
                    const driver  = Array.isArray(svc.drivers)  ? svc.drivers[0]  : svc.drivers
                    const vehicle = Array.isArray(svc.vehicles) ? svc.vehicles[0] : svc.vehicles

                    return (
                      <tr
                        key={svc.id}
                        className="border-b border-[#203650] hover:bg-[#10223d] transition-colors cursor-default"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Link
                            href={`/dashboard/rutas/${svc.id}`}
                            className="group inline-block"
                          >
                            <p
                              className="text-[12px] font-semibold group-hover:underline transition-colors"
                              style={{ color: '#f1f5f9' }}
                            >
                              {svc.service_code ?? `#${svc.id.slice(0, 8).toUpperCase()}`}
                            </p>
                            {svc.scheduled_date && (
                              <p className="text-[10px] text-[#a8b8cc]">{formatDate(svc.scheduled_date)}</p>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[12px] text-[#d5e0ed]">
                            {driver?.full_name ?? <span className="text-[#a8b8cc]">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {vehicle ? (
                            <div>
                              <p className="text-[12px] font-medium text-[#d5e0ed]">{vehicle.plate ?? '—'}</p>
                              {vehicle.model && (
                                <p className="text-[10px] text-[#a8b8cc]">{vehicle.model}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[12px] text-[#a8b8cc]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
                            style={{ backgroundColor: sm.bg, color: sm.text }}
                          >
                            {sm.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-[12px] text-[#a8b8cc]">
                            {formatTime(svc.scheduled_start_time)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Contracts panel ── */}
        <SectionCard
          title="Contratos Activos"
          badge={
            <div className="flex items-center gap-2">
              {contracts.length > 0 && <CountBadge count={contracts.length} />}
              <AddContractModal />
            </div>
          }
        >
          {contracts.length === 0 ? (
            <EmptyStateCompact
              message="Sin contratos activos"
              sub="Los contratos activos aparecerán aquí."
              icon={
                <svg className="w-4 h-4 text-[#a8b8cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              }
            />
          ) : (
            <ContractsPanel contracts={contracts} />
          )}
        </SectionCard>

      </div>
    </div>
  )
}
