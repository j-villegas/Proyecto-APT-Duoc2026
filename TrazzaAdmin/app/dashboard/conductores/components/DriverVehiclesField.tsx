'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { formatPlate } from '@/app/components/Plate'

// Vehículos que puede manejar un conductor (driver_vehicles, migración 031).
// Un conductor puede tener varios y un vehículo varios conductores. Cada
// cambio se guarda al instante. Al crear un viaje, el panel propone primero
// estos vehículos para el conductor elegido.

type Vehicle = { id: string; plate: string; brand: string | null; model: string | null; status: string }

const STATUS_LABEL: Record<string, string> = {
  available: 'Disponible', in_service: 'En servicio', maintenance: 'Mantención', out_of_service: 'Fuera de servicio',
}

export default function DriverVehiclesField({ driverId, companyId }: { driverId: string; companyId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    Promise.all([
      supabase.from('vehicles').select('id, plate, brand, model, status').is('deleted_at', null).order('plate'),
      supabase.from('driver_vehicles').select('vehicle_id').eq('driver_id', driverId),
    ]).then(([v, dv]) => {
      if (!active) return
      if (v.error || dv.error) setError(friendlyError(v.error ?? dv.error, 'No se pudieron cargar los vehículos'))
      setVehicles((v.data ?? []) as Vehicle[])
      setAssigned(new Set((dv.data ?? []).map(r => r.vehicle_id as string)))
      setLoading(false)
    })
    return () => { active = false }
  }, [driverId])

  async function toggle(vehicleId: string) {
    const supabase = createClient()
    const isAssigned = assigned.has(vehicleId)
    setBusy(vehicleId)
    setError(null)
    const { error: err } = isAssigned
      ? await supabase.from('driver_vehicles').delete().eq('driver_id', driverId).eq('vehicle_id', vehicleId)
      : await supabase.from('driver_vehicles').insert({ company_id: companyId, driver_id: driverId, vehicle_id: vehicleId })
    if (err) {
      setError(friendlyError(err, isAssigned ? 'No se pudo quitar el vehículo' : 'No se pudo asignar el vehículo'))
    } else {
      setAssigned(prev => {
        const next = new Set(prev)
        if (isAssigned) next.delete(vehicleId)
        else next.add(vehicleId)
        return next
      })
    }
    setBusy(null)
  }

  return (
    <div className="col-span-2">
      <p className="text-[11px] text-muted mb-2">
        {assigned.size === 0
          ? 'Sin vehículos asignados. Marca los que puede manejar este conductor.'
          : `${assigned.size} vehículo${assigned.size === 1 ? '' : 's'} asignado${assigned.size === 1 ? '' : 's'}. Se proponen primero al crear un viaje.`}
      </p>
      {loading ? (
        <p className="text-[12px] text-muted">Cargando vehículos…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-[12px] text-muted">No hay vehículos registrados en Flota.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
          {vehicles.map(v => {
            const checked = assigned.has(v.id)
            return (
              <label key={v.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[12px] cursor-pointer transition-colors ${checked ? 'border-[#246354] bg-[#143c39]' : 'border-line hover:bg-sunken'}`}>
                <input type="checkbox" checked={checked} disabled={busy === v.id} onChange={() => toggle(v.id)} />
                <span className="font-mono font-semibold text-fg">{formatPlate(v.plate)}</span>
                <span className="text-muted truncate">{[v.brand, v.model].filter(Boolean).join(' ')}</span>
                <span className="ml-auto text-[10px] text-muted whitespace-nowrap">{STATUS_LABEL[v.status] ?? v.status}</span>
              </label>
            )
          })}
        </div>
      )}
      {error && <p role="alert" className="text-[11px] text-rose-300 mt-1">{error}</p>}
    </div>
  )
}
