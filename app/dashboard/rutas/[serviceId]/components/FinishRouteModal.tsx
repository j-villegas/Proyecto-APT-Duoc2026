'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type SummaryData = {
  total: number
  boarded: number
  no_show: number
  pending: number
  incidents: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatDuration(startISO: string | null): string {
  if (!startISO) return 'Sin hora de inicio registrada'
  const diffMs = Date.now() - new Date(startISO).getTime()
  if (diffMs < 0) return 'Duración no disponible'
  const h = Math.floor(diffMs / 3_600_000)
  const m = Math.floor((diffMs % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}min` : `${m} minutos`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  serviceId: string
  serviceCode: string | null
  vehicleId: string | null
  driverId: string | null
  actualStartAt: string | null
  serviceStatus: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinishRouteModal({
  serviceId,
  serviceCode,
  vehicleId,
  driverId,
  actualStartAt,
  serviceStatus,
}: Props) {
  const router = useRouter()

  const [open, setOpen]               = useState(false)
  const [summary, setSummary]         = useState<SummaryData | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [notes, setNotes]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [finishTime]                  = useState(() => new Date())

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true)
    const supabase = createClient()
    const [spResult, incResult] = await Promise.all([
      supabase
        .from('service_passengers')
        .select('attendance_status')
        .eq('service_id', serviceId),
      supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', serviceId),
    ])

    const passengers = spResult.data ?? []
    setSummary({
      total:     passengers.length,
      boarded:   passengers.filter(p => p.attendance_status === 'boarded').length,
      no_show:   passengers.filter(p => p.attendance_status === 'no_show').length,
      pending:   passengers.filter(p => p.attendance_status === 'pending').length,
      incidents: incResult.count ?? 0,
    })
    setLoadingSummary(false)
  }, [serviceId])

  useEffect(() => { if (open) loadSummary() }, [open, loadSummary])

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
    setNotes('')
    setSubmitError(null)
    setSummary(null)
  }

  // ── Confirm ────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (serviceStatus !== 'in_progress') {
      setSubmitError('Este servicio ya no está en ejecución.')
      return
    }

    setLoading(true)
    setSubmitError(null)
    const supabase = createClient()
    const now = new Date().toISOString()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('id, company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const companyId = profile.company_id

      // 1. Update service → completed
      const { error: svcErr } = await supabase
        .from('services')
        .update({ status: 'completed', actual_end_at: now })
        .eq('id', serviceId)
        .eq('status', 'in_progress')   // guard: only update if still in_progress
      if (svcErr) throw new Error(`Error al finalizar el servicio: ${svcErr.message}`)

      // 2. Update vehicle → available
      if (vehicleId) {
        const { error: vErr } = await supabase
          .from('vehicles').update({ status: 'available' }).eq('id', vehicleId)
        if (vErr) throw new Error(`Error al actualizar el vehículo: ${vErr.message}`)
      }

      // 3. Update driver → available
      if (driverId) {
        const { error: dErr } = await supabase
          .from('drivers').update({ status: 'available' }).eq('id', driverId)
        if (dErr) throw new Error(`Error al actualizar el conductor: ${dErr.message}`)
      }

      // 4. service_events — optional; silently skip on any error
      try {
        const evPayload: Record<string, unknown> = {
          company_id:  companyId,
          service_id:  serviceId,
          event_type:  'service_completed',
          description: 'Servicio finalizado desde panel web',
        }
        if (notes.trim()) evPayload.description += ` · ${notes.trim()}`
        await supabase.from('service_events').insert(evPayload)
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

  // ── Derived ────────────────────────────────────────────────────────────────

  const titleCode    = serviceCode ?? `#${serviceId.slice(0, 8).toUpperCase()}`
  const hasPending   = (summary?.pending ?? 0) > 0
  const finishTimeLabel = finishTime.toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-[#2b405b] text-[12px] font-medium text-[#d5e0ed] hover:bg-[#10223d] transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 text-[#f1f5f9] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="flex-1">Finalizar Ruta</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.50)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget && !loading) handleClose() }}
        >
          <div
            className="bg-[#142942] rounded-lg border border-[#2b405b] w-full flex flex-col"
            style={{ maxWidth: 560, maxHeight: '92vh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-[#2b405b] flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#a8b8cc12' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#f1f5f9" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Finalizar Ruta</h2>
                  <p className="text-[11px] text-[#a8b8cc] mt-0.5">
                    Confirme el resumen del servicio antes de cerrar la operación.
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[#a8b8cc] hover:text-[#f1f5f9] hover:bg-[#2b405b] transition-colors cursor-pointer mt-0.5 disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {submitError && (
                <div className="flex items-start gap-2.5 bg-[#3d2332] border border-[#794052] text-rose-200 rounded-md px-4 py-3 text-[12px]">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}

              {/* Pending warning */}
              {hasPending && (
                <div className="flex items-start gap-2.5 bg-[#3b3020] border border-[#755c33] text-amber-200 rounded-md px-4 py-3 text-[12px]">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  Hay <strong className="mx-0.5">{summary!.pending}</strong> pasajero{summary!.pending !== 1 ? 's' : ''} pendiente{summary!.pending !== 1 ? 's' : ''} de confirmación. Puedes finalizar igualmente, pero quedarán registrados como pendientes.
                </div>
              )}

              {/* Route */}
              <div className="rounded-md border border-[#2b405b] overflow-hidden">
                <div className="px-4 py-2 border-b border-[#203650]" style={{ backgroundColor: '#10223d' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#a8b8cc]">Ruta</p>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[12px] font-bold" style={{ color: '#f1f5f9' }}>Ruta {titleCode}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#123b35', color: '#55d9ad' }}>
                    Finalizando
                  </span>
                </div>
              </div>

              {/* Passengers summary */}
              <div className="rounded-md border border-[#2b405b] overflow-hidden">
                <div className="px-4 py-2 border-b border-[#203650]" style={{ backgroundColor: '#10223d' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#a8b8cc]">Pasajeros</p>
                </div>
                {loadingSummary ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-[#a8b8cc]">
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cargando...
                  </div>
                ) : (
                  <div className="grid grid-cols-4 divide-x divide-[#203650]">
                    {[
                      { label: 'Total',      value: summary?.total    ?? 0, color: '#f1f5f9' },
                      { label: 'Subieron',   value: summary?.boarded  ?? 0, color: '#55d9ad' },
                      { label: 'No subieron',value: summary?.no_show  ?? 0, color: '#fda4af' },
                      { label: 'Pendientes', value: summary?.pending  ?? 0, color: '#f8cb78' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="px-3 py-3 text-center">
                        <p className="text-[18px] font-bold leading-none" style={{ color }}>{value}</p>
                        <p className="text-[10px] text-[#a8b8cc] mt-1 leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Incidents + Timeline */}
              <div className="grid grid-cols-2 gap-3">
                {/* Incidentes */}
                <div className="rounded-md border border-[#2b405b] overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#203650]" style={{ backgroundColor: '#10223d' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#a8b8cc]">Incidencias</p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    {loadingSummary ? (
                      <span className="text-[12px] text-[#a8b8cc]">—</span>
                    ) : (
                      <>
                        <p
                          className="text-[22px] font-bold leading-none"
                          style={{ color: (summary?.incidents ?? 0) > 0 ? '#fda4af' : '#55d9ad' }}
                        >
                          {summary?.incidents ?? 0}
                        </p>
                        <p className="text-[10px] text-[#a8b8cc] mt-1">
                          {(summary?.incidents ?? 0) === 0 ? 'Sin incidencias' : 'reportadas'}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Horario */}
                <div className="rounded-md border border-[#2b405b] overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#203650]" style={{ backgroundColor: '#10223d' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#a8b8cc]">Horario</p>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    <div>
                      <p className="text-[10px] text-[#a8b8cc]">Inicio real</p>
                      <p className="text-[11px] font-semibold text-[#d5e0ed]">
                        {actualStartAt ? formatDateTime(actualStartAt) : 'Sin registro'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#a8b8cc]">Fin</p>
                      <p className="text-[11px] font-semibold text-[#d5e0ed]">{finishTimeLabel}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#a8b8cc]">Duración</p>
                      <p className="text-[11px] font-semibold" style={{ color: '#f1f5f9' }}>
                        {formatDuration(actualStartAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1">
                  Observaciones del Cierre
                </label>
                <textarea
                  rows={3}
                  placeholder="Observaciones internas del cierre de ruta..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] border border-[#2b405b] rounded-md bg-[#142942] text-[#f1f5f9] placeholder-[#a8b8cc] focus:outline-none focus:ring-1 focus:ring-[#f1f5f9] focus:border-[#f1f5f9] transition resize-none"
                />
              </div>

            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2b405b] flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
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
                disabled={loading || loadingSummary}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-white transition-opacity disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: '#254b77' }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Finalizando...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Confirmar y Finalizar
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
