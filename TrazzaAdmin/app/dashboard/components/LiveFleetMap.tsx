'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { GoogleMap, OverlayViewF, OVERLAY_MOUSE_TARGET } from '@react-google-maps/api'
import { createClient } from '@/lib/supabase/client'
import { authenticateRealtime } from '@/lib/supabase/realtime'
import { useGoogleMaps } from './GoogleMapsProvider'

// Base de operación por defecto mientras no hay vehículos en ruta.
const DEFAULT_CENTER = { lat: -23.6509, lng: -70.3975 }
// Sin un ping en este tiempo, el vehículo se muestra "sin señal reciente".
const STALE_AFTER_MS = 5 * 60_000

type ActiveService = {
  id: string
  service_code: string | null
  drivers: { full_name: string | null } | { full_name: string | null }[] | null
  vehicles: { plate: string | null } | { plate: string | null }[] | null
}

type LocationRow = {
  service_id: string
  latitude: number | string
  longitude: number | string
  recorded_at: string
}

type Vehicle = {
  serviceId: string
  code: string
  plate: string
  driver: string
  position: { lat: number; lng: number } | null
  recordedAt: string | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function toPosition(row: LocationRow) {
  const lat = Number(row.latitude)
  const lng = Number(row.longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

function secondsAgo(iso: string | null, now: number) {
  return iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)) : null
}

function agoLabel(seconds: number | null) {
  if (seconds === null) return 'sin datos'
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `hace ${minutes} min` : `hace ${Math.round(minutes / 60)} h`
}

/** Mapa del dashboard con la última posición de cada vehículo en ruta, en vivo. */
export default function LiveFleetMap({ height = '300px' }: { height?: string }) {
  const { isLoaded, loadError, hasApiKey } = useGoogleMaps()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const mapRef = useRef<google.maps.Map | null>(null)
  const fittedRef = useRef(false)
  const knownIdsRef = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: services, error } = await supabase
      .from('services')
      .select('id, service_code, drivers:driver_id(full_name), vehicles:vehicle_id(plate)')
      .eq('status', 'in_progress')
      .is('deleted_at', null)
    if (error) {
      setFailed(true)
      return
    }

    const rows = (services ?? []) as ActiveService[]
    knownIdsRef.current = new Set(rows.map(s => s.id))
    const latest = await Promise.all(rows.map(s =>
      supabase
        .from('service_locations')
        .select('service_id, latitude, longitude, recorded_at')
        .eq('service_id', s.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => data as LocationRow | null)
    ))

    setVehicles(rows.map((s, i) => ({
      serviceId: s.id,
      code: s.service_code ?? `#${s.id.slice(0, 8).toUpperCase()}`,
      plate: one(s.vehicles)?.plate ?? 'Sin patente',
      driver: one(s.drivers)?.full_name ?? 'Sin conductor',
      position: latest[i] ? toPosition(latest[i]!) : null,
      recordedAt: latest[i]?.recorded_at ?? null,
    })))
    setFailed(false)
    setLoaded(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    // Primera carga en el siguiente tick, para no actualizar estado dentro del efecto.
    const initial = setTimeout(load, 0)

    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    // Autenticar Realtime antes de unirse al canal (ver lib/supabase/realtime.ts).
    authenticateRealtime(supabase)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        channel = supabase
          .channel('dashboard-fleet-map')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_locations' }, payload => {
            const row = payload.new as LocationRow
            const position = toPosition(row)
            if (!position) return
            // Ping de un servicio que aún no conocemos (recién iniciado): recargar la lista.
            if (!knownIdsRef.current.has(row.service_id)) {
              load()
              return
            }
            setVehicles(prev =>
              prev.map(v => v.serviceId === row.service_id ? { ...v, position, recordedAt: row.recorded_at } : v)
            )
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => { load() })
          .subscribe(status => setConnected(status === 'SUBSCRIBED'))
      })

    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelled = true
      clearTimeout(initial)
      clearInterval(clock)
      if (channel) supabase.removeChannel(channel)
    }
  }, [load])

  const located = useMemo(() => vehicles.filter(v => v.position), [vehicles])

  // Encuadra el mapa la primera vez que hay vehículos con posición.
  useEffect(() => {
    const map = mapRef.current
    if (!map || fittedRef.current || located.length === 0) return
    fittedRef.current = true
    if (located.length === 1) {
      map.setCenter(located[0].position!)
      map.setZoom(14)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    located.forEach(v => bounds.extend(v.position!))
    map.fitBounds(bounds, 64)
  }, [located, isLoaded])

  const mapOptions = useMemo(() => ({
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  }), [])

  const lastUpdate = located.reduce<string | null>(
    (acc, v) => (!acc || (v.recordedAt && v.recordedAt > acc) ? v.recordedAt : acc), null
  )
  const withoutSignal = vehicles.length - located.length

  let status: string
  if (failed) status = 'No pudimos cargar la flota en ruta. Reintentaremos automáticamente.'
  else if (!loaded) status = 'Buscando vehículos en ruta…'
  else if (vehicles.length === 0) status = 'Ningún vehículo en ruta ahora. Aparecerán aquí al iniciar un servicio.'
  else {
    status = `${vehicles.length} en ruta`
    if (lastUpdate) status += ` · última señal ${agoLabel(secondsAgo(lastUpdate, now))}`
    if (withoutSignal > 0) status += ` · ${withoutSignal} sin GPS aún`
  }

  if (!hasApiKey || loadError) {
    return (
      <div className="flex items-center justify-center bg-sunken px-6 text-center text-[12px] text-muted" style={{ height }}>
        {loadError ? 'No pudimos cargar Google Maps. Revisa la conexión o la API key.' : 'Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.'}
      </div>
    )
  }
  if (!isLoaded) return <div className="w-full animate-pulse bg-line" style={{ height }} />

  return (
    <div className="relative">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height }}
        center={DEFAULT_CENTER}
        zoom={12}
        options={mapOptions}
        onLoad={map => { mapRef.current = map }}
      >
        {located.map(v => {
          const stale = (secondsAgo(v.recordedAt, now) ?? Infinity) * 1000 > STALE_AFTER_MS
          return (
            <OverlayViewF key={v.serviceId} position={v.position!} mapPaneName={OVERLAY_MOUSE_TARGET}>
              <Link
                href={`/dashboard/rutas/${v.serviceId}`}
                title={`${v.code} · ${v.driver} · ${stale ? 'sin señal reciente' : 'en vivo'} (${agoLabel(secondsAgo(v.recordedAt, now))})`}
                className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-bold font-mono shadow-md"
                style={{
                  backgroundColor: stale ? '#203650' : '#0d1d37',
                  borderColor: stale ? '#3b526d' : '#10b98b',
                  color: stale ? '#a8b8cc' : '#f1f5f9',
                }}
              >
                <span className="relative flex h-2 w-2">
                  {!stale && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />}
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: stale ? '#64748b' : '#10b98b' }} />
                </span>
                {v.plate}
              </Link>
            </OverlayViewF>
          )
        })}
      </GoogleMap>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <div className="rounded-lg border border-line px-4 py-2 text-center shadow-sm" style={{ backgroundColor: 'rgba(20,41,66,0.94)' }}>
          <p className="text-[11px] text-muted whitespace-nowrap">{status}</p>
        </div>
      </div>

      <span className="sr-only" aria-live="polite">{connected ? 'Conectado en vivo' : 'Sin conexión en vivo'}</span>
    </div>
  )
}

/** Indicador para el encabezado de la tarjeta del mapa. */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-line bg-canvas px-2 py-0.5 text-[10px] font-semibold text-accent-soft">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      En vivo
    </span>
  )
}
