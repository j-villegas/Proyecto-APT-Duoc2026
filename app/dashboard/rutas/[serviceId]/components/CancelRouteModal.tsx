'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  serviceId: string
  serviceCode: string | null
  vehicleId: string | null
  driverId: string | null
  serviceStatus: string | null
}

export default function CancelRouteModal({
  serviceId,
  serviceCode,
  vehicleId,
  driverId,
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

  async function handleConfirm() {
    if (serviceStatus !== 'scheduled') {
      setSubmitError('Este servicio ya no está en estado programado.')
      return
    }

    setLoading(true)
    setSubmitError(null)
    const supabase = createClient()

    try {
      // 1. Validate session
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      // 2. Cancel service — guard: only if still scheduled
      const { error: svcErr } = await supabase
        .from('services')
        .update({ status: 'cancelled' })
        .eq('id', serviceId)
        .eq('status', 'scheduled')
      if (svcErr) throw new Error(`Error al cancelar el servicio: ${svcErr.message}`)

      // 3. Free vehicle
      if (vehicleId) {
        const { error: vErr } = await supabase
          .from('vehicles').update({ status: 'available' }).eq('id', vehicleId)
        if (vErr) throw new Error(`Error al actualizar el vehículo: ${vErr.message}`)
      }

      // 4. Free driver
      if (driverId) {
        const { error: dErr } = await supabase
          .from('drivers').update({ status: 'available' }).eq('id', driverId)
        if (dErr) throw new Error(`Error al actualizar el conductor: ${dErr.message}`)
      }

      // 5. Log event — optional; silently ignore on failure
      try {
        const { data: profile } = await supabase
          .from('profiles').select('company_id').eq('id', user.id).single()
        if (profile?.company_id) {
          const desc = reason.trim()
            ? `Servicio cancelado desde panel web · ${reason.trim()}`
            : 'Servicio cancelado desde panel web'
          await supabase.from('service_events').insert({
            company_id:  profile.company_id,
            service_id:  serviceId,
            event_type:  'service_cancelled',
            description: desc,
          })
        }
      } catch {
        // optional — ignore
      }

      handleClose()
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Trigger — matches danger ActionButton style but active */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-[#794052] text-[12px] font-medium text-rose-300 hover:bg-[#3d2332] transition-colors text-left cursor-pointer"
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
          <div
            className="bg-[#142942] rounded-lg border border-[#2b405b] w-full flex flex-col"
            style={{ maxWidth: 480 }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-6 py-4 border-b border-[#2b405b] flex-shrink-0"
              style={{ backgroundColor: '#3b3020' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-[#3d2332]">
                  <svg className="w-4 h-4 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-rose-200">Cancelar Ruta</h2>
                  <p className="text-[11px] text-[#a8b8cc] mt-0.5">
                    Ruta {titleCode}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[#a8b8cc] hover:text-[#f1f5f9] hover:bg-[#2b405b] transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {submitError && (
                <div className="flex items-start gap-2.5 bg-[#3d2332] border border-[#794052] text-rose-200 rounded-md px-4 py-3 text-[12px]">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}

              {/* Warning message */}
              <div className="flex items-start gap-3 bg-[#3b3020] border border-[#755c33] rounded-md px-4 py-3">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-[12px] text-amber-200">
                  Esta acción cancelará el servicio programado. El vehículo y conductor quedarán disponibles nuevamente.
                </p>
              </div>

              {/* Reason textarea */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1">
                  Motivo de cancelación <span className="normal-case font-normal text-[#a8b8cc]">(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Describa el motivo de la cancelación..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 text-[12px] border border-[#2b405b] rounded-md bg-[#142942] text-[#f1f5f9] placeholder-[#a8b8cc] focus:outline-none focus:ring-1 focus:ring-red-300 focus:border-[#794052] transition resize-none disabled:opacity-60"
                />
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2b405b] flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 rounded-md text-[12px] font-semibold border border-[#2b405b] text-[#a8b8cc] hover:bg-[#2b405b] transition-colors disabled:opacity-50 cursor-pointer"
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
