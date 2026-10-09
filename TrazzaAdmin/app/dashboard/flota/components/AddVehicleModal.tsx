'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Form shape ───────────────────────────────────────────────────────────────

type Form = {
  plate: string
  brand: string
  model: string
  vehicle_type: string
  year: string
  capacity_passengers: string
  status: string
  current_odometer_km: string
  next_maintenance_km: string
  estimated_fuel_efficiency_km_l: string
  fuel_type: string
  tank_capacity_liters: string
  base_location: string
  technical_review_expires_at: string
  circulation_permit_expires_at: string
  insurance_expires_at: string
  insurance_policy_number: string
  notes: string
}

const EMPTY: Form = {
  plate: '', brand: '', model: '', vehicle_type: '', year: '',
  capacity_passengers: '', status: '', current_odometer_km: '',
  next_maintenance_km: '', estimated_fuel_efficiency_km_l: '',
  fuel_type: '', tank_capacity_liters: '', base_location: '',
  technical_review_expires_at: '', circulation_permit_expires_at: '',
  insurance_expires_at: '', insurance_policy_number: '', notes: '',
}

type FieldErrors = Partial<Record<keyof Form, string>>

function validate(f: Form): FieldErrors {
  const e: FieldErrors = {}
  if (!f.plate.trim())        e.plate        = 'La patente es obligatoria.'
  if (!f.brand.trim())        e.brand        = 'La marca es obligatoria.'
  if (!f.model.trim())        e.model        = 'El modelo es obligatorio.'
  if (!f.vehicle_type)        e.vehicle_type = 'Selecciona el tipo de vehículo.'
  if (!f.status)              e.status       = 'Selecciona el estado inicial.'
  return e
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[12px] border border-[#2b405b] rounded-md bg-[#142942] text-[#f1f5f9] ' +
  'placeholder-[#a8b8cc] focus:outline-none focus:ring-1 focus:ring-[#10b98b] focus:border-[#10b98b] transition'

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1'

function Field({ label, error, required, children }: {
  label: string; error?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-rose-300 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-rose-300 mt-1">{error}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8b8cc] whitespace-nowrap">{children}</p>
      <div className="flex-1 h-px bg-[#2b405b]" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddVehicleModal() {
  const router  = useRouter()
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [form, setForm]         = useState<Form>(EMPTY)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose() {
    setOpen(false)
    setForm(EMPTY)
    setFieldErrors({})
    setSubmitError(null)
  }

  function set<K extends keyof Form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key in fieldErrors) setFieldErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function num(val: string): number | null {
    const n = parseFloat(val)
    return isNaN(n) ? null : n
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validate(form)
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }

    setLoading(true)
    setSubmitError(null)

    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('Perfil de usuario no encontrado.')

      const payload: Record<string, unknown> = {
        company_id:   profile.company_id,
        plate:        form.plate.trim().toUpperCase(),
        brand:        form.brand.trim(),
        model:        form.model.trim(),
        vehicle_type: form.vehicle_type,
        status:       form.status,
      }

      if (form.year)                             payload.year                             = parseInt(form.year)
      if (form.capacity_passengers)              payload.capacity_passengers              = parseInt(form.capacity_passengers)
      if (form.current_odometer_km)              payload.current_odometer_km              = num(form.current_odometer_km)
      if (form.next_maintenance_km)              payload.next_maintenance_km              = num(form.next_maintenance_km)
      if (form.estimated_fuel_efficiency_km_l)   payload.estimated_fuel_efficiency_km_l   = num(form.estimated_fuel_efficiency_km_l)
      if (form.fuel_type)                        payload.fuel_type                        = form.fuel_type
      if (form.tank_capacity_liters)             payload.tank_capacity_liters             = num(form.tank_capacity_liters)
      if (form.base_location.trim())             payload.base_location                    = form.base_location.trim()
      if (form.technical_review_expires_at)      payload.technical_review_expires_at      = form.technical_review_expires_at
      if (form.circulation_permit_expires_at)    payload.circulation_permit_expires_at    = form.circulation_permit_expires_at
      if (form.insurance_expires_at)             payload.insurance_expires_at             = form.insurance_expires_at
      if (form.insurance_policy_number.trim())   payload.insurance_policy_number          = form.insurance_policy_number.trim()
      if (form.notes.trim())                     payload.notes                            = form.notes.trim()

      const { error: insertErr } = await supabase.from('vehicles').insert(payload)
      if (insertErr) throw new Error(`Error al guardar: ${insertErr.message}`)

      handleClose()
      router.refresh()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-[#0d1d37] hover:opacity-90 transition-opacity cursor-pointer"
        style={{ backgroundColor: '#10b98b' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Añadir Vehículo
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div
            className="bg-[#142942] rounded-lg border border-[#2b405b] w-full flex flex-col"
            style={{ maxWidth: 900, maxHeight: '92vh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-[#2b405b] flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Registrar Vehículo</h2>
                <p className="text-[11px] text-[#a8b8cc] mt-0.5">Complete los datos del vehículo para incorporarlo a la flota.</p>
              </div>
              <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-md text-[#a8b8cc] hover:text-[#f1f5f9] hover:bg-[#2b405b] transition-colors cursor-pointer mt-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {submitError && (
                  <div className="flex items-start gap-2.5 bg-[#3d2332] border border-[#794052] text-rose-200 rounded-md px-4 py-3 text-[12px]">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {submitError}
                  </div>
                )}

                {/* ── Identificación ── */}
                <SectionTitle>Identificación</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Patente" required error={fieldErrors.plate}>
                    <input type="text" placeholder="LL-PP-24" value={form.plate}
                      onChange={e => set('plate', e.target.value.toUpperCase())} className={inputCls} />
                  </Field>
                  <Field label="Marca" required error={fieldErrors.brand}>
                    <input type="text" placeholder="Mercedes-Benz" value={form.brand}
                      onChange={e => set('brand', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Modelo" required error={fieldErrors.model}>
                    <input type="text" placeholder="Sprinter 516" value={form.model}
                      onChange={e => set('model', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Tipo de Vehículo" required error={fieldErrors.vehicle_type}>
                    <select value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)} className={inputCls}>
                      <option value="">— Seleccionar —</option>
                      <option value="bus">Bus</option>
                      <option value="minibus">Minibús</option>
                      <option value="van">Van</option>
                      <option value="furgon">Furgón</option>
                      <option value="truck">Camión</option>
                      <option value="other">Otro</option>
                    </select>
                  </Field>
                  <Field label="Año">
                    <input type="number" placeholder="2023" min={1990} max={2030} value={form.year}
                      onChange={e => set('year', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Capacidad Pasajeros">
                    <input type="number" placeholder="0" min={0} max={200} value={form.capacity_passengers}
                      onChange={e => set('capacity_passengers', e.target.value)} className={inputCls} />
                  </Field>
                </div>

                {/* ── Estado y Operación ── */}
                <SectionTitle>Estado y Operación</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Estado Inicial" required error={fieldErrors.status}>
                    <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                      <option value="">— Seleccionar —</option>
                      <option value="available">Disponible</option>
                      <option value="in_service">En Servicio</option>
                      <option value="maintenance">En Mantención</option>
                      <option value="out_of_service">Fuera de Servicio</option>
                    </select>
                  </Field>
                  <Field label="Kilometraje Actual">
                    <input type="number" placeholder="0" min={0} value={form.current_odometer_km}
                      onChange={e => set('current_odometer_km', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Próxima Mantención (km)">
                    <input type="number" placeholder="0" min={0} value={form.next_maintenance_km}
                      onChange={e => set('next_maintenance_km', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Base / Ubicación Principal">
                    <input type="text" placeholder="Terminal Santiago" value={form.base_location}
                      onChange={e => set('base_location', e.target.value)} className={inputCls} />
                  </Field>
                </div>

                {/* ── Combustible ── */}
                <SectionTitle>Combustible</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Tipo de Combustible">
                    <select value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)} className={inputCls}>
                      <option value="">— Seleccionar —</option>
                      <option value="diesel">Diésel</option>
                      <option value="gasoline_93">Gasolina 93</option>
                      <option value="gasoline_95">Gasolina 95</option>
                      <option value="gasoline_97">Gasolina 97</option>
                      <option value="electric">Eléctrico</option>
                      <option value="hybrid">Híbrido</option>
                      <option value="other">Otro</option>
                    </select>
                  </Field>
                  <Field label="Capacidad Estanque (L)">
                    <input type="number" placeholder="0" min={0} step="0.1" value={form.tank_capacity_liters}
                      onChange={e => set('tank_capacity_liters', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Rendimiento Est. (km/L)">
                    <input type="number" placeholder="0" min={0} step="0.1" value={form.estimated_fuel_efficiency_km_l}
                      onChange={e => set('estimated_fuel_efficiency_km_l', e.target.value)} className={inputCls} />
                  </Field>
                </div>

                {/* ── Documentación ── */}
                <SectionTitle>Documentación</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Venc. Revisión Técnica">
                    <input type="date" value={form.technical_review_expires_at}
                      onChange={e => set('technical_review_expires_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Venc. Permiso Circulación">
                    <input type="date" value={form.circulation_permit_expires_at}
                      onChange={e => set('circulation_permit_expires_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Venc. Seguro">
                    <input type="date" value={form.insurance_expires_at}
                      onChange={e => set('insurance_expires_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="N° Póliza de Seguro">
                    <input type="text" placeholder="POL-2024-XXXX" value={form.insurance_policy_number}
                      onChange={e => set('insurance_policy_number', e.target.value)} className={inputCls} />
                  </Field>
                </div>

                {/* ── Observaciones ── */}
                <SectionTitle>Observaciones</SectionTitle>
                <textarea
                  rows={3}
                  placeholder="Notas adicionales sobre el vehículo..."
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  className={inputCls + ' resize-none'}
                />

              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2b405b] flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
                <button type="button" onClick={handleClose} disabled={loading}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold border border-[#2b405b] text-[#a8b8cc] hover:bg-[#2b405b] transition-colors disabled:opacity-50 cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-[#0d1d37] transition-opacity disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: '#10b98b' }}>
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
                      Guardar Vehículo
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
