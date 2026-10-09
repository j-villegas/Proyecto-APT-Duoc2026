'use client'

import { useRef } from 'react'
import { Autocomplete } from '@react-google-maps/api'
import { useGoogleMaps } from './GoogleMapsProvider'

// ─── Public types ─────────────────────────────────────────────────────────────

export type PlaceResult = {
  name: string
  address: string
  lat: number
  lng: number
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (text: string) => void        // user typing — clears coords
  onPlaceSelect: (result: PlaceResult) => void  // Places suggestion confirmed
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────
// Consumes GoogleMapsContext — does NOT call useLoadScript / useJsApiLoader.
// Falls back to a plain input when the API is not available or not yet loaded.

export default function PlacesAutocompleteInput({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  className,
  id,
  disabled,
}: Props) {
  const { isLoaded, hasApiKey } = useGoogleMaps()
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  function handlePlaceChanged() {
    const place = autocompleteRef.current?.getPlace()
    if (!place?.geometry?.location) return

    onPlaceSelect({
      name:    place.name ?? value,
      address: place.formatted_address ?? place.name ?? value,
      lat:     place.geometry.location.lat(),
      lng:     place.geometry.location.lng(),
    })
  }

  // Plain input fallback: no API key, not yet loaded, or load error
  if (!hasApiKey || !isLoaded) {
    return (
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />
    )
  }

  return (
    <Autocomplete
      onLoad={ac => { autocompleteRef.current = ac }}
      onPlaceChanged={handlePlaceChanged}
      options={{
        componentRestrictions: { country: 'cl' },
        fields: ['name', 'formatted_address', 'geometry'],
      }}
    >
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />
    </Autocomplete>
  )
}
