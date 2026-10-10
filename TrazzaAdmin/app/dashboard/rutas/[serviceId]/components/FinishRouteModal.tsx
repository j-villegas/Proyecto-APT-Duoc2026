'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

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
  actualStartAt: string | null
  serviceStatus: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinishRouteModal({
  serviceId,
  serviceCode,
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

    try {
      // Servicio, vehículo, conductor y bitácora en una sola transacción.
      const { error } = await createClient().rpc('admin_finish_service', {
        p_service_id: serviceId,
        p_notes:      notes.trim() || null,
      })
      if (error) throw new Error(friendlyError(error, 'No se pudo finalizar el servicio'))

      handleClose()
      router.refresh()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : friendlyError(err))
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
        onClick={() => { setOpen(true); loadSummary() }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-line text-[12px] font-medium text-soft hover:bg-sunken transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 text-fg flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 560, maxHeight: '92vh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#a8b8cc12' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#f1f5f9" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Finalizar Ruta</h2>
                  <p className="text-[11px] text-muted mt-0.5">
                    Confirme el resumen del servicio antes de cerrar la operación.
                  </p>
                </div>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                disabled={loading}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer mt-0.5 disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {submitError && (
                <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px]">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}

              {/* Pending warning */}
              {hasPending && (
                <div className="flex items-start gap-2.5 bg-warn-bg border border-warn-line text-amber-200 rounded-md px-4 py-3 text-[12px]">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  Hay <strong className="mx-0.5">{summary!.pending}</strong> pasajero{summary!.pending !== 1 ? 's' : ''} pendiente{summary!.pending !== 1 ? 's' : ''} de confirmación. Puedes finalizar igualmente, pero quedarán registrados como pendientes.
                </div>
              )}

              {/* Route */}
              <div className="rounded-md border border-line overflow-hidden">
                <div className="px-4 py-2 border-b border-raised" style={{ backgroundColor: '#10223d' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Ruta</p>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[12px] font-bold" style={{ color: '#f1f5f9' }}>Ruta {titleCode}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#123b35', color: '#55d9ad' }}>
                    Finalizando
                  </span>
                </div>
              </div>

              {/* Passengers summary */}
              <div className="rounded-md border border-line overflow-hidden">
                <div className="px-4 py-2 border-b border-raised" style={{ backgroundColor: '#10223d' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Pasajeros</p>
                </div>
                {loadingSummary ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-muted">
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cargando...
                  </div>
                ) : (
                  <div className="grid grid-cols-4 divide-x divide-raised">
                    {[
                      { label: 'Total',      value: summary?.total    ?? 0, color: '#f1f5f9' },
                      { label: 'Subieron',   value: summary?.boarded  ?? 0, color: '#55d9ad' },
                      { label: 'No subieron',value: summary?.no_show  ?? 0, color: '#fda4af' },
                      { label: 'Pendientes', value: summary?.pending  ?? 0, color: '#f8cb78' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="px-3 py-3 text-center">
                        <p className="text-[18px] font-bold leading-none" style={{ color }}>{value}</p>
                        <p className="text-[10px] text-muted mt-1 leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Incidents + Timeline */}
              <div className="grid grid-cols-2 gap-3">
                {/* Incidentes */}
                <div className="rounded-md border border-line overflow-hidden">
                  <div className="px-3 py-2 border-b border-raised" style={{ backgroundColor: '#10223d' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Incidencias</p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    {loadingSummary ? (
                      <span className="text-[12px] text-muted">—</span>
                    ) : (
                      <>
                        <p
                          className="text-[22px] font-bold leading-none"
                          style={{ color: (summary?.incidents ?? 0) > 0 ? '#fda4af' : '#55d9ad' }}
                        >
                          {summary?.incidents ?? 0}
                        </p>
                        <p className="text-[10px] text-muted mt-1">
                          {(summary?.incidents ?? 0) === 0 ? 'Sin incidencias' : 'reportadas'}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Horario */}
                <div className="rounded-md border border-line overflow-hidden">
                  <div className="px-3 py-2 border-b border-raised" style={{ backgroundColor: '#10223d' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Horario</p>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    <div>
                      <p className="text-[10px] text-muted">Inicio real</p>
                      <p className="text-[11px] font-semibold text-soft">
                        {actualStartAt ? formatDateTime(actualStartAt) : 'Sin registro'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted">Fin</p>
                      <p className="text-[11px] font-semibold text-soft">{finishTimeLabel}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted">Duración</p>
                      <p className="text-[11px] font-semibold" style={{ color: '#f1f5f9' }}>
                        {formatDuration(actualStartAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
                  Observaciones del Cierre
                </label>
                <textarea
                  rows={3}
                  placeholder="Observaciones internas del cierre de ruta..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] border border-line rounded-md bg-surface text-fg placeholder-muted focus:outline-none focus:ring-1 focus:ring-fg focus:border-fg transition resize-none"
                />
              </div>

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
