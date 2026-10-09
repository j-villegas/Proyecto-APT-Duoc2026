'use client'

import { createContext, useContext } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'

// ─── Stable constant — MUST live outside the component to prevent re-loading ──
const GOOGLE_MAP_LIBRARIES: ['places', 'geometry'] = ['places', 'geometry']

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

// ─── Context ──────────────────────────────────────────────────────────────────

type GoogleMapsContextType = {
  isLoaded: boolean
  loadError: Error | undefined
  hasApiKey: boolean
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: undefined,
  hasApiKey: false,
})

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGoogleMaps(): GoogleMapsContextType {
  return useContext(GoogleMapsContext)
}

// ─── Provider ─────────────────────────────────────────────────────────────────
// Render this once at the dashboard layout level.
// All child components (GoogleMapPanel, PlacesAutocompleteInput) consume the
// context instead of calling useLoadScript / useJsApiLoader themselves, which
// eliminates the "API loaded multiple times" warning.

export default function GoogleMapsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GMAPS_KEY,
    libraries: GOOGLE_MAP_LIBRARIES,
  })

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError, hasApiKey: !!GMAPS_KEY }}>
      {children}
    </GoogleMapsContext.Provider>
  )
}
