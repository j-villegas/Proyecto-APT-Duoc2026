import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PassengersModal from './components/PassengersModal'
import ReportIncidentModal from './components/ReportIncidentModal'
import StartRouteModal from './components/StartRouteModal'
import FinishRouteModal from './components/FinishRouteModal'
import CancelRouteModal from './components/CancelRouteModal'
import EditScheduleModal from './components/EditScheduleModal'
import GoogleMapPanel from '@/app/dashboard/components/GoogleMapPanel'
import { visualServiceStatus } from '@/lib/service-status'
import Plate from '@/app/components/Plate'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractRef = { id: string; contract_name: string | null; client_name: string | null } | null
type RouteRef    = { id: string; route_code: string | null; name: string | null; origin_name: string | null; destination_name: string | null } | null
type DriverRef   = { id: string; full_name: string | null; phone: string | null } | null
type VehicleRef  = { id: string; plate: string | null; brand: string | null; model: string | null; capacity_passengers: number | null } | null

type ServiceDetail = {
  id: string
  service_code: string | null
  status: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  actual_start_at: string | null
  route_id: string | null
  vehicle_id: string | null
  driver_id: string | null
  contracts: ContractRef
  routes: RouteRef
  drivers: DriverRef
  vehicles: VehicleRef
}

type StopRow = {
  id: string
  stop_order: number
  stop_type: string | null
  name: string | null
  status: string | null
  planned_arrival_time: string | null
  latitude: number | null
  longitude: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────



const stopStatusMeta: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente',  color: '#a8b8cc' },
  next:      { label: 'Próxima',    color: '#f59e0b' },
  arrived:   { label: 'Llegó',      color: '#7dbbff' },
  completed: { label: 'Completada', color: '#55d9ad' },
  skipped:   { label: 'Saltada',    color: '#fda4af' },
}

function getStopStatus(status: string | null) {
  return stopStatusMeta[status ?? ''] ?? { label: '—', color: '#a8b8cc' }
}

const stopTypeLabel: Record<string, string> = {
  origin:      'ORIGEN',
  pickup:      'PARADA',
  destination: 'DESTINO',
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function formatTime(t: string | null) {
  if (!t) return '—'
  return t.length >= 5 ? t.slice(0, 5) : t
}

function resolveOne<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line" style={{ backgroundColor: '#10223d' }}>
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>{title}</h3>
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-raised last:border-0">
      <span className="text-[11px] text-muted font-medium uppercase tracking-wide whitespace-nowrap flex-shrink-0">{label}</span>
      <span className="text-[12px] font-medium text-fg text-right">{value ?? '—'}</span>
    </div>
  )
}

// ─── Itinerary timeline ───────────────────────────────────────────────────────

function Itinerary({ stops, serviceStatus }: { stops: StopRow[]; serviceStatus: string | null }) {
  if (stops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center px-4">
        <div className="w-8 h-8 rounded-full bg-raised flex items-center justify-center mb-2.5">
          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
        </div>
        <p className="text-[12px] font-medium text-muted">Sin paradas registradas</p>
        <p className="text-[11px] text-muted mt-0.5">El itinerario se definió sin paradas específicas.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      {stops.map((stop, idx) => {
        const isLast    = idx === stops.length - 1
        const typeLabel = stopTypeLabel[stop.stop_type ?? ''] ?? 'PARADA'
        const rawSs     = getStopStatus(stop.status)
        // When a service is completed but the stop still shows 'pending',
        // the conductor app never confirmed it — show a neutral visual label.
        const ss = (serviceStatus === 'completed' && stop.status === 'pending')
          ? { label: 'Sin confirmación conductor', color: '#a8b8cc' }
          : rawSs
        const isOD      = stop.stop_type === 'origin' || stop.stop_type === 'destination'
        const dotColor  =
          stop.stop_type === 'origin'      ? '#10b98b' :
          stop.stop_type === 'destination' ? '#f1f5f9' : '#94a3b8'

        return (
          <div key={stop.id} className="flex gap-4">
            {/* Timeline column */}
            <div className="flex flex-col items-center flex-shrink-0 w-6">
              <div
                className="w-3 h-3 rounded-full border-2 flex-shrink-0 z-10"
                style={{
                  borderColor: dotColor,
                  backgroundColor: isOD ? dotColor : 'white',
                  marginTop: 2,
                }}
              />
              {!isLast && (
                <div className="flex-1 w-px mt-1" style={{ backgroundColor: '#2b405b', minHeight: 28 }} />
              )}
            </div>

            {/* Content */}
            <div className={`flex-1 min-w-0 pb-4 ${isLast ? '' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: isOD ? dotColor + '18' : '#203650',
                        color: isOD ? dotColor : '#a8b8cc',
                      }}
                    >
                      {typeLabel}
                    </span>
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: ss.color }}
                    >
                      {ss.label}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold mt-1 truncate" style={{ color: '#f1f5f9' }}>
                    {stop.name ?? '—'}
                  </p>
                </div>
                {stop.planned_arrival_time && (
                  <span className="text-[11px] text-muted flex-shrink-0 mt-0.5">
                    {formatTime(stop.planned_arrival_time)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ serviceId: string }>
}) {
  const { serviceId } = await params
  const supabase = await createClient()

  const [
    { data: rawService },
    { data: rawStops },
    { count: passengerCount },
    { count: incidentCount },
  ] = await Promise.all([
    supabase
      .from('services')
      .select(`
        id, service_code, status, scheduled_date, scheduled_start_time,
        actual_start_at, route_id, vehicle_id, driver_id,
        contracts ( id, contract_name, client_name ),
        routes    ( id, route_code, name, origin_name, destination_name ),
        drivers   ( id, full_name, phone ),
        vehicles  ( id, plate, brand, model, capacity_passengers )
      `)
      .eq('id', serviceId)
      .single(),

    supabase
      .from('service_stops')
      .select('id, stop_order, stop_type, name, status, planned_arrival_time, latitude, longitude')
      .eq('service_id', serviceId)
      .order('stop_order', { ascending: true }),

    supabase
      .from('service_passengers')
      .select('*', { count: 'exact', head: true })
      .eq('service_id', serviceId),

    supabase
      .from('incidents')
      .select('*', { count: 'exact', head: true })
      .eq('service_id', serviceId),
  ])

  if (!rawService) notFound()

// supabase-js sin tipos generados infiere las relaciones embebidas como arreglos;
  // en ejecución las many-to-one llegan como objeto, de ahí el doble cast.
  const service  = rawService as unknown as ServiceDetail
  const stops    = (rawStops ?? []) as StopRow[]
  const contract = resolveOne(service.contracts)
  const route    = resolveOne(service.routes)
  const driver   = resolveOne(service.drivers)
  const vehicle  = resolveOne(service.vehicles)

  const sm          = visualServiceStatus(service.status, service.scheduled_date, service.scheduled_start_time)
  const title       = service.service_code ?? `#${service.id.slice(0, 8).toUpperCase()}`
  const capacity    = vehicle?.capacity_passengers ?? null
  const passengers  = passengerCount ?? 0
  const incidents   = incidentCount ?? 0

  // ── Map data derived from service_stops ──────────────────────────────────────
  // Stops are already ordered by stop_order (ascending) from the query.
  const stopsWithCoords = stops.filter(s => s.latitude !== null && s.longitude !== null)
  const hasCoords       = stopsWithCoords.length > 0
  const allHaveCoords   = stops.length > 0 && stopsWithCoords.length === stops.length

  // Intermediate-stop counter used for iconLabel: origin is stop_order=1 so
  // the first intermediate is stop_order=2 → rendered as "1", etc.
  const mapMarkers = stopsWithCoords.map(s => {
    const isOrigin = s.stop_type === 'origin'
    const isDest   = s.stop_type === 'destination'
    const stopNum  = s.stop_order - 1   // 1-based intermediate index
    return {
      id:         s.id,
      lat:        s.latitude!,
      lng:        s.longitude!,
      label:      isOrigin ? 'Origen' : isDest ? 'Destino' : (s.name ?? `Parada ${stopNum}`),
      iconLabel:  isOrigin ? 'A' : isDest ? 'B' : String(stopNum),
      type:       isOrigin ? 'origin'      as const
                : isDest   ? 'destination' as const
                :            'stop'        as const,
    }
  })

  const mapPolyline = stopsWithCoords.length >= 2
    ? stopsWithCoords.map(s => ({ lat: s.latitude!, lng: s.longitude! }))
    : undefined

  const mapCenter = hasCoords
    ? { lat: stopsWithCoords[0].latitude!, lng: stopsWithCoords[0].longitude! }
    : undefined

  const mapOverlay = allHaveCoords
    ? undefined
    : 'Algunas paradas no tienen coordenadas confirmadas.'

  return (
    <div className="space-y-4">

      {/* ── Breadcrumb + header ── */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted mb-3">
          <Link href="/dashboard/rutas" className="hover:text-fg transition-colors">
            Gestión de Rutas
          </Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-muted font-medium">Detalle de Ruta</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">
              Detalle de Ruta
            </p>
            <div className="flex items-center gap-3">
              <h2 className="text-[18px] font-bold" style={{ color: '#f1f5f9' }}>
                Ruta {title}
              </h2>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold"
                style={{ backgroundColor: sm.bg, color: sm.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sm.dot }} />
                {sm.label}
              </span>
              {incidents > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-danger-bg border border-danger-line text-[10px] font-bold text-rose-300">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {incidents} incidente{incidents !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {(contract?.client_name || contract?.contract_name) && (
              <p className="text-[12px] text-muted mt-1">
                {contract.client_name}
                {contract.contract_name && contract.client_name && ' · '}
                {contract.contract_name}
              </p>
            )}
          </div>

          <Link
            href="/dashboard/rutas"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line text-[11px] font-semibold text-muted hover:bg-line transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Volver a Rutas
          </Link>
        </div>
      </div>

      {/* ── Two-column main ── */}
      <div
        className="grid grid-cols-1 gap-4"
        style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,34%)' }}
      >
        {/* ── LEFT ── */}
        <div className="space-y-4">

          {/* Map card */}
          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line" style={{ backgroundColor: '#10223d' }}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>
                Mapa de Ruta
              </h3>
              <div className="flex items-center gap-2">
                {route?.origin_name && (
                  <span className="text-[11px] text-muted">
                    {route.origin_name}
                    <span className="mx-1.5">→</span>
                    {route.destination_name ?? '—'}
                  </span>
                )}
                <span className="text-[10px] bg-warn-bg border border-warn-line text-amber-300 px-2 py-0.5 rounded font-semibold">
                  {stops.length} parada{stops.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <GoogleMapPanel
              height="260px"
              center={mapCenter}
              markers={mapMarkers}
              polyline={mapPolyline}
              overlayMessage={mapOverlay}
            />
          </div>

          {/* Itinerary card */}
          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line" style={{ backgroundColor: '#10223d' }}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>
                Itinerario
              </h3>
              {stops.length > 0 && (
                <span className="text-[10px] bg-sunken border border-line text-muted px-2 py-0.5 rounded font-semibold">
                  {stops.length} parada{stops.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <Itinerary stops={stops} serviceStatus={service.status} />
          </div>

        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-3">

          {/* Información General */}
          <InfoCard title="Información General">
            <InfoRow label="Contrato"    value={contract?.contract_name ?? '—'} />
            <InfoRow label="Cliente"     value={contract?.client_name ?? '—'} />
            <InfoRow label="Fecha"       value={formatDate(service.scheduled_date)} />
            <InfoRow label="Horario"     value={service.scheduled_start_time ? `${formatTime(service.scheduled_start_time)} hrs` : '—'} />
            {route && (
              <InfoRow label="Código Ruta" value={route.route_code ?? route.id.slice(0, 8)} />
            )}
            <InfoRow
              label="Pasajeros"
              value={capacity != null ? `${passengers} / ${capacity}` : passengers}
            />
            {(service.status === 'scheduled' ||
              service.status === 'completed' ||
              (service.status === 'cancelled' && passengers > 0)) && (
              <div className="pt-2.5">
                <PassengersModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  plate={vehicle?.plate ?? null}
                  capacity={capacity}
                  triggerVariant="action"
                  mode={service.status === 'scheduled' ? 'editable' : 'readonly'}
                />
              </div>
            )}
          </InfoCard>

          {/* Asignación */}
          <InfoCard title="Asignación">
            {/* Vehicle */}
            <div className="flex items-center gap-3 py-2 border-b border-raised">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#254b77' + '12' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#f1f5f9" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Vehículo</p>
                {vehicle ? (
                  <>
                    <div className="my-1"><Plate value={vehicle.plate} size="md" /></div>
                    {(vehicle.brand || vehicle.model) && (
                      <p className="text-[11px] text-muted">{[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}</p>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-muted">Sin asignar</p>
                )}
              </div>
            </div>

            {/* Driver */}
            <div className="flex items-center gap-3 py-2">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#10b98b' + '12' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Conductor</p>
                {driver ? (
                  <>
                    <p className="text-[13px] font-bold" style={{ color: '#f1f5f9' }}>{driver.full_name ?? '—'}</p>
                    {driver.phone && (
                      <p className="text-[11px] text-muted">{driver.phone}</p>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-muted">Sin asignar</p>
                )}
              </div>
            </div>
          </InfoCard>

          {/* Acciones Operativas */}
          <InfoCard title="Acciones Operativas">
            {service.status === 'completed' ? (
              <div className="flex items-center gap-2 py-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <p className="text-[12px] font-medium text-muted">Servicio finalizado</p>
              </div>
            ) : service.status === 'cancelled' ? (
              <div className="flex items-center gap-2 py-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <p className="text-[12px] font-medium text-muted">Servicio cancelado</p>
              </div>
            ) : service.status === 'scheduled' ? (
              <div className="space-y-2">
                <StartRouteModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  plate={vehicle?.plate ?? null}
                  driverName={driver?.full_name ?? null}
                  serviceStatus={service.status}
                />
                <ReportIncidentModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  routeId={service.route_id}
                  vehicleId={service.vehicle_id}
                  driverId={service.driver_id}
                  plate={vehicle?.plate ?? null}
                  driverName={driver?.full_name ?? null}
                  serviceStatus={service.status}
                />
                <EditScheduleModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  driverId={service.driver_id}
                  vehicleId={service.vehicle_id}
                  scheduledDate={service.scheduled_date}
                  scheduledStartTime={service.scheduled_start_time}
                  serviceStatus={service.status}
                />
                <CancelRouteModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  serviceStatus={service.status}
                />
              </div>
            ) : service.status === 'in_progress' ? (
              <div className="space-y-2">
                <PassengersModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  plate={vehicle?.plate ?? null}
                  capacity={capacity}
                  triggerVariant="action"
                  mode="readonly"
                />
                <ReportIncidentModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  routeId={service.route_id}
                  vehicleId={service.vehicle_id}
                  driverId={service.driver_id}
                  plate={vehicle?.plate ?? null}
                  driverName={driver?.full_name ?? null}
                  serviceStatus={service.status}
                />
                <FinishRouteModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  actualStartAt={service.actual_start_at}
                  serviceStatus={service.status}
                />
                <CancelRouteModal
                  serviceId={service.id}
                  serviceCode={service.service_code}
                  serviceStatus={service.status}
                />
              </div>
            ) : null}
          </InfoCard>

        </div>
      </div>
    </div>
  )
}
