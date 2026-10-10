'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

interface Props {
  serviceId: string
  serviceCode: string | null
  serviceStatus: string | null
}

export default function CancelRouteModal({
  serviceId,
  serviceCode,
  serviceStatus,
}: Props) {
  const router = useRouter()

  const [open, setOpen]               = useState(false)
  const [reason, setReason]           = useState('')
  const [loading, setLoading]         = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const titleCode = serviceCode ?? `#${serviceId.slice(0, 8).toUpperCase()}`

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading])

  function handleClose() {
    if (loading) return
    setOpen(false)
    setReason('')
    setSubmitError(null)
  }

  const isInProgress = serviceStatus === 'in_progress'

  async function handleConfirm() {
    if (serviceStatus !== 'scheduled' && serviceStatus !== 'in_progress') {
      setSubmitError('Este servicio ya no está programado ni en curso.')
      return
    }

    setLoading(true)
    setSubmitError(null)

    try {
      // Servicio, vehículo, conductor y bitácora en una sola transacción.
      const { error } = await createClient().rpc('admin_cancel_service', {
        p_service_id: serviceId,
        p_reason:     reason.trim() || null,
      })
      if (error) throw new Error(friendlyError(error, 'No se pudo cancelar el servicio'))

      handleClose()
      router.refresh()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Trigger — matches danger ActionButton style but active */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-danger-line text-[12px] font-medium text-rose-300 hover:bg-danger-bg transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 flex-shrink-0 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="flex-1">Cancelar Ruta</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.50)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget && !loading) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 480 }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0"
              style={{ backgroundColor: '#3b3020' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-danger-bg">
                  <svg className="w-4 h-4 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-rose-200">Cancelar Ruta</h2>
                  <p className="text-[11px] text-muted mt-0.5">
                    Ruta {titleCode}
                  </p>
                </div>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                disabled={loading}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {submitError && (
                <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px]">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}

              {/* Warning message */}
              <div className="flex items-start gap-3 bg-warn-bg border border-warn-line rounded-md px-4 py-3">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-[12px] text-amber-200">
                  {isInProgress
                    ? 'Esta acción cancelará el servicio en curso, aunque el conductor ya haya iniciado la ruta. El vehículo y conductor quedarán disponibles nuevamente.'
                    : 'Esta acción cancelará el servicio programado. El vehículo y conductor quedarán disponibles nuevamente.'}
                </p>
              </div>

              {/* Reason textarea */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
                  Motivo de cancelación <span className="normal-case font-normal text-muted">(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Describa el motivo de la cancelación..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 text-[12px] border border-line rounded-md bg-surface text-fg placeholder-muted focus:outline-none focus:ring-1 focus:ring-red-300 focus:border-danger-line transition resize-none disabled:opacity-60"
                />
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
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
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cancelando...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Confirmar Cancelación
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
