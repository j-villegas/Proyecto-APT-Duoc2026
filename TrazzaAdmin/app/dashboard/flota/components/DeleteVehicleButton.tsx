'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteVehicle } from './deleteVehicle'

interface Props {
  vehicleId: string
  plate: string | null
}

export default function DeleteVehicleButton({ vehicleId, plate }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, deleting])

  function handleOpen() {
    setError(null)
    setOpen(true)
  }

  async function handleConfirm() {
    setDeleting(true)
    setError(null)
    try {
      await deleteVehicle(vehicleId)
      setOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-[11px] font-semibold px-2.5 py-1 rounded border border-danger-line text-rose-300 hover:bg-danger-bg transition-colors cursor-pointer whitespace-nowrap"
      >
        Eliminar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(5, 12, 25, 0.75)' }}
          onClick={() => { if (!deleting) setOpen(false) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-vehicle-${vehicleId}`}
            className="w-full max-w-md rounded-lg border border-line bg-surface p-6 whitespace-normal"
            onClick={e => e.stopPropagation()}
          >
            <h3 id={`delete-vehicle-${vehicleId}`} className="text-[14px] font-bold text-slate-100">
              ¿Eliminar el vehículo {plate ?? ''}?
            </h3>
            <p className="mt-2 text-[12px] text-muted">
              Dejará de aparecer en el inventario y no se podrá asignar a nuevas rutas.
              Su historial de servicios, combustible y mantenciones se conserva.
            </p>

            {error && (
              <div className="mt-4 rounded-md border border-danger-line bg-danger-bg px-3 py-2 text-[12px] text-rose-200">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={deleting}
                className="px-4 py-2 rounded-md text-[12px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
