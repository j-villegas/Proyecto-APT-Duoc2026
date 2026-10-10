'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  serviceId: string
  serviceCode: string | null
  plate: string | null
  driverName: string | null
  serviceStatus: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StartRouteModal({
  serviceId,
  serviceCode,
  plate,
  driverName,
  serviceStatus,
}: Props) {
  const router = useRouter()

  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [startTime]                   = useState(() => new Date())

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose() {
    if (loading) return
    setOpen(false)
    setSubmitError(null)
  }

  async function handleConfirm() {
    if (serviceStatus !== 'scheduled') {
      setSubmitError('Este servicio ya no está en estado programado.')
      return
    }

    setLoading(true)
    setSubmitError(null)

    try {
      // Servicio, vehículo, conductor y bitácora en una sola transacción.
      const { error } = await createClient().rpc('admin_start_service', { p_service_id: serviceId })
      if (error) throw new Error(friendlyError(error, 'No se pudo iniciar el servicio'))

      handleClose()
      router.refresh()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const titleCode = serviceCode ?? `#${serviceId.slice(0, 8).toUpperCase()}`
  const timeLabel = startTime.toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const dateLabel = startTime.toLocaleDateString('es-CL', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger — primary orange button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90 cursor-pointer"
        style={{ backgroundColor: '#10b98b' }}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
        <span className="flex-1 text-left">Iniciar Ruta</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.50)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget && !loading) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 460 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#10b98b15' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Iniciar Ruta</h2>
                  <p className="text-[11px] text-muted mt-0.5">
                    Confirma el inicio del servicio.
                  </p>
                </div>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                disabled={loading}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer mt-0.5 flex-shrink-0 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              <p className="text-[12px] text-soft leading-relaxed">
                Desde este momento la ruta quedará <strong>en ejecución</strong>. El vehículo y el conductor serán marcados como <strong>En Servicio</strong>.
              </p>

              {/* Summary */}
              <div className="rounded-md border border-line overflow-hidden">
                <div className="px-4 py-2 border-b border-raised" style={{ backgroundColor: '#10223d' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Resumen del servicio</p>
                </div>
                <div className="divide-y divide-raised">
                  {[
                    { label: 'Ruta',      value: titleCode },
                    { label: 'Vehículo',  value: plate ?? '—' },
                    { label: 'Conductor', value: driverName ?? '—' },
                    { label: 'Hora inicio', value: `${timeLabel} · ${dateLabel}` },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-2 gap-4">
                      <span className="text-[11px] text-muted font-medium uppercase tracking-wide flex-shrink-0">
                        {row.label}
                      </span>
                      <span className="text-[12px] font-semibold text-fg text-right truncate">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {submitError && (
                <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px]">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-canvas transition-opacity disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: '#10b98b' }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Iniciando...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    Confirmar Inicio
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
