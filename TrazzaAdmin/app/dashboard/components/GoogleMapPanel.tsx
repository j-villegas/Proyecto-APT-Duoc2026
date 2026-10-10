'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api'
import { useGoogleMaps } from './GoogleMapsProvider'

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

// ─── Public types ─────────────────────────────────────────────────────────────

export type MapMarkerType = 'origin' | 'destination' | 'stop' | 'vehicle' | 'base'

export type MapMarker = {
  id: string
  lat: number
  lng: number
  /** Shown as tooltip on hover */
  label?: string
  /** Short text rendered inside the coloured circle pin (e.g. "A", "B", "1") */
  iconLabel?: string
  type?: MapMarkerType
}

export interface GoogleMapPanelProps {
  height?: string
  center?: { lat: number; lng: number }
  markers?: MapMarker[]
  polyline?: Array<{ lat: number; lng: number }>
  overlayMessage?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTOFAGASTA = { lat: -23.6509, lng: -70.3975 }

// Fill colours per marker type
const MARKER_FILL: Record<MapMarkerType, string> = {
  origin:      '#087d61', // VLXLOGISTIC orange
  destination: '#254b77', // VLXLOGISTIC navy
  stop:        '#64748b', // slate-500
  vehicle:     '#059669', // emerald-600
  base:        '#64748b', // slate-500
}

// ─── Marker helpers (called only after isLoaded — google global is available) ─

function buildMarkerIcon(type: MapMarkerType | undefined): google.maps.Symbol {
  return {
    path:         google.maps.SymbolPath.CIRCLE,
    fillColor:    MARKER_FILL[type ?? 'base'],
    fillOpacity:  1,
    scale:        14,
    strokeColor:  '#ffffff',
    strokeWeight: 2.5,
  }
}

function buildMarkerLabel(text: string): google.maps.MarkerLabel {
  return {
    text,
    color:      '#ffffff',
    fontWeight: 'bold',
    fontSize:   '11px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function MapFallback({ message }: { message?: string }) {
  return (
    <div
      className="relative w-full flex items-center justify-center overflow-hidden"
      style={{ minHeight: 280, backgroundColor: '#10223d' }}
    >
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="mpgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#2b405b" strokeWidth="0.7" />
          </pattern>
          <pattern id="mpgrid-big" width="128" height="128" patternUnits="userSpaceOnUse">
            <rect width="128" height="128" fill="url(#mpgrid)" />
            <path d="M 128 0 L 0 0 0 128" fill="none" stroke="#3b526d" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#10223d" />
        <rect width="100%" height="100%" fill="url(#mpgrid-big)" />
      </svg>

      <div className="relative z-10 bg-surface border border-line rounded-lg px-5 py-4 text-center shadow-sm max-w-xs">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-2"
          style={{ backgroundColor: '#3b3020' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </div>
        <p className="text-[12px] font-semibold" style={{ color: '#f1f5f9' }}>
          {message ?? 'Google Maps pendiente de configurar.'}
        </p>
      </div>
    </div>
  )
}

// ─── Skeleton while loading ───────────────────────────────────────────────────

function MapSkeleton({ height }: { height: string }) {
  return (
    <div
      className="w-full animate-pulse bg-line rounded-b-lg"
      style={{ height }}
    />
  )
}

// ─── Overlay chip ─────────────────────────────────────────────────────────────

function OverlayChip({ message }: { message: string }) {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div
        className="rounded-lg px-4 py-2 text-center border border-line shadow-sm"
        style={{ backgroundColor: 'rgba(20,41,66,0.94)' }}
      >
        <p className="text-[11px] text-muted whitespace-nowrap">{message}</p>
      </div>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function GoogleMapPanel({
  height = '280px',
  center,
  markers = [],
  polyline,
  overlayMessage,
}: GoogleMapPanelProps) {
  const { isLoaded, loadError, hasApiKey } = useGoogleMaps()

  // Never show two different lines for the same trip in sequence — that swap
  // is what left stray segments behind on the map. Instead: draw nothing
  // while the real route is loading, then draw exactly one line — the real
  // route if it resolved, the straight fallback only if it genuinely failed.
  type RouteState =
    | { status: 'loading' }
    | { status: 'ready'; path: google.maps.LatLngLiteral[] }
    | { status: 'failed' }

  const [routeState, setRouteState] = useState<RouteState>({ status: 'loading' })

  // Fetch the real driving route (follows streets) via Routes API whenever we
  // have ≥ 2 stops. Uses Routes API (not the legacy Directions API, which new
  // Google Cloud projects can no longer enable).
  useEffect(() => {
    if (!isLoaded || !polyline || polyline.length < 2 || !hasApiKey) {
      queueMicrotask(() => setRouteState({ status: 'failed' }))
      return
    }

    const controller = new AbortController()
    const [origin, ...rest] = polyline
    const destination = rest[rest.length - 1]
    const intermediates = rest.slice(0, -1)
    const toWaypoint = (p: { lat: number; lng: number }) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    })

    fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':       'application/json',
        'X-Goog-Api-Key':     GMAPS_KEY,
        'X-Goog-FieldMask':   'routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin:      toWaypoint(origin),
        destination: toWaypoint(destination),
        intermediates: intermediates.map(toWaypoint),
        travelMode: 'DRIVE',
        polylineQuality: 'HIGH_QUALITY',
      }),
    })
      .then(res => res.json())
      .then(data => {
        const encoded: string | undefined = data?.routes?.[0]?.polyline?.encodedPolyline
        if (!encoded) { setRouteState({ status: 'failed' }); return }
        const decoded = google.maps.geometry.encoding.decodePath(encoded)
        setRouteState({ status: 'ready', path: decoded.map(p => ({ lat: p.lat(), lng: p.lng() })) })
      })
      .catch(err => { if (err.name !== 'AbortError') setRouteState({ status: 'failed' }) })

    return () => controller.abort()
  }, [isLoaded, polyline, hasApiKey])

  const containerStyle = useMemo(() => ({ width: '100%', height }), [height])

  const mapCenter = center ?? ANTOFAGASTA

  const mapOptions = useMemo(
    () => ({
      streetViewControl: false,
      mapTypeControl:    false,
      fullscreenControl: false,
      zoomControl:       true,
      clickableIcons:    false,
    }),
    []
  )

  // Fit the viewport to all markers when ≥ 2 are present
  const handleMapLoad = useCallback(
    (map: google.maps.Map) => {
      if (markers.length < 2) return
      const bounds = new google.maps.LatLngBounds()
      markers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }))
      map.fitBounds(bounds, 56)
    },
    // markers array reference is stable for static server-rendered pages
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  if (!hasApiKey) return <MapFallback />
  if (loadError)  return <MapFallback message="Error al cargar Google Maps. Verifica la API key." />
  if (!isLoaded)  return <MapSkeleton height={height} />

  return (
    <div className="relative">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={12}
        options={mapOptions}
        onLoad={handleMapLoad}
      >
        {markers.map(m => (
          <Marker
            key={m.id}
            position={{ lat: m.lat, lng: m.lng }}
            title={m.label}
            icon={buildMarkerIcon(m.type)}
            label={m.iconLabel ? buildMarkerLabel(m.iconLabel) : undefined}
          />
        ))}

        {routeState.status === 'ready' && (
          <Polyline
            path={routeState.path}
            options={{ strokeColor: '#10b98b', strokeWeight: 4, strokeOpacity: 0.85 }}
          />
        )}
        {routeState.status === 'failed' && polyline && polyline.length >= 2 && (
          <Polyline
            path={polyline}
            options={{ strokeColor: '#10b98b', strokeWeight: 4, strokeOpacity: 0.85 }}
          />
        )}
      </GoogleMap>

      {overlayMessage && <OverlayChip message={overlayMessage} />}
    </div>
  )
}
