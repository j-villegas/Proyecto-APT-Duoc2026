'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverOption  = { id: string; full_name: string | null }
type VehicleOption = { id: string; plate: string | null; brand: string | null; model: string | null }

interface Props {
  serviceId: string
  serviceCode: string | null
  driverId: string | null
  vehicleId: string | null
  scheduledDate: string | null
  scheduledStartTime: string | null
  serviceStatus: string | null
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[12px] border border-line rounded-md bg-surface text-fg ' +
  'placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition'

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

function toDatetimeLocal(date: string | null, time: string | null): string {
  if (!date) return ''
  const t = (time ?? '00:00:00').slice(0, 5)
  return `${date}T${t}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditScheduleModal({
  serviceId,
  serviceCode,
  driverId,
  vehicleId,
  scheduledDate,
  scheduledStartTime,
  serviceStatus,
}: Props) {
  const router = useRouter()

  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [drivers, setDrivers]   = useState<DriverOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])

  const [form, setForm] = useState({
    driver_id: driverId ?? '',
    vehicle_id: vehicleId ?? '',
    scheduled_datetime: toDatetimeLocal(scheduledDate, scheduledStartTime),
  })

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true)
    const supabase = createClient()
    const [d, v] = await Promise.all([
      supabase
        .from('drivers')
        .select('id, full_name')
        .in('status', ['available', 'rest'])
        .is('deleted_at', null)
        .order('full_name', { ascending: true }),
      supabase
        .from('vehicles')
        .select('id, plate, brand, model')
        .eq('status', 'available')
        .is('deleted_at', null)
        .order('plate', { ascending: true }),
    ])
    setDrivers((d.data ?? []) as DriverOption[])
    setVehicles((v.data ?? []) as VehicleOption[])
    setLoadingOptions(false)
  }, [])


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
    setForm({
      driver_id: driverId ?? '',
      vehicle_id: vehicleId ?? '',
      scheduled_datetime: toDatetimeLocal(scheduledDate, scheduledStartTime),
    })
  }

  async function handleConfirm() {
    if (serviceStatus !== 'scheduled') {
      setSubmitError('Este servicio ya no está en estado programado.')
      return
    }
    if (!form.driver_id || !form.vehicle_id || !form.scheduled_datetime) {
      setSubmitError('Completa conductor, vehículo y fecha/hora.')
      return
    }

    setLoading(true)
    setSubmitError(null)
    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')
      const companyId = profile.company_id

      const [scheduled_date, scheduled_start_time] = form.scheduled_datetime.split('T')

      const { error: svcErr } = await supabase
        .from('services')
        .update({
          driver_id: form.driver_id,
          vehicle_id: form.vehicle_id,
          scheduled_date,
          scheduled_start_time,
        })
        .eq('id', serviceId)
        .eq('status', 'scheduled')
      if (svcErr) throw new Error(friendlyError(svcErr, 'No se pudo actualizar la programación'))

      // Bitácora: no bloquea la edición si falla (el cambio ya se guardó).
      await supabase.from('service_events').insert({
        company_id: companyId,
        service_id: serviceId,
        actor_type: 'admin',
        actor_id:   user.id,
        event_type: 'schedule_updated',
        payload: {
          source: 'panel',
          before: { driver_id: driverId, vehicle_id: vehicleId, scheduled_date: scheduledDate, scheduled_start_time: scheduledStartTime },
          after:  { driver_id: form.driver_id, vehicle_id: form.vehicle_id, scheduled_date, scheduled_start_time },
        },
      })

      setOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const titleCode = serviceCode ?? `#${serviceId.slice(0, 8).toUpperCase()}`

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        onClick={() => { setOpen(true); loadOptions() }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-line text-[12px] font-medium text-soft hover:bg-sunken transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 text-fg flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
        <span className="flex-1">Editar Programación</span>
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
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Editar Programación</h2>
                <p className="text-[11px] text-muted mt-0.5">Ruta {titleCode}</p>
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
              {loadingOptions ? (
                <div className="flex items-center justify-center py-6 text-[12px] text-muted gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Cargando opciones...
                </div>
              ) : (
                <>
                  <Field label="Conductor">
                    <select
                      value={form.driver_id}
                      onChange={e => setForm(prev => ({ ...prev, driver_id: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">— Selecciona un conductor —</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.full_name ?? d.id}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Vehículo">
                    <select
                      value={form.vehicle_id}
                      onChange={e => setForm(prev => ({ ...prev, vehicle_id: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">— Selecciona un vehículo —</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {[v.plate, v.brand, v.model].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Fecha y Hora de Salida">
                    <input
                      type="datetime-local"
                      value={form.scheduled_datetime}
                      onChange={e => setForm(prev => ({ ...prev, scheduled_datetime: e.target.value }))}
                      className={inputCls}
                    />
                  </Field>
                </>
              )}

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
                disabled={loading || loadingOptions}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-canvas transition-opacity disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: '#10b98b' }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Guardando...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Guardar Cambios
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
