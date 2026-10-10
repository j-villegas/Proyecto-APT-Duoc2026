'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type VehicleOption = {
  id: string
  plate: string | null
  brand: string | null
  model: string | null
  current_odometer_km: number | null
  fuel_type: string | null
}

type FormState = {
  vehicle_id: string
  odometer_km: string
  fuel_datetime: string
  station_name: string
  fuel_type: string
  liters: string
  total_amount: string
  fuel_level_before_eighths: string
  fuel_level_after_eighths: string
  receipt_number: string
  notes: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowLocalDatetime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EMPTY_FORM: FormState = {
  vehicle_id: '', odometer_km: '', fuel_datetime: nowLocalDatetime(),
  station_name: '', fuel_type: '', liters: '', total_amount: '',
  fuel_level_before_eighths: '', fuel_level_after_eighths: '', receipt_number: '', notes: '',
}

// Vehicles use simpler fuel_type values; map them to the log's fuel_type options
const vehicleFuelMap: Record<string, string> = {
  diesel:   'diesel',
  electric: 'electric',
  hybrid:   'hybrid',
}

const FUEL_TYPE_LABELS: Record<string, string> = {
  diesel:       'Diésel',
  gasoline_93:  'Gasolina 93',
  gasoline_95:  'Gasolina 95',
  gasoline_97:  'Gasolina 97',
  electric:     'Eléctrico',
  hybrid:       'Híbrido',
  other:        'Otro',
}

const LEVEL_OPTIONS = Array.from({ length: 9 }, (_, i) => i) // 0–8

function validate(f: FormState, vehicles: VehicleOption[]): FormErrors {
  const errs: FormErrors = {}
  if (!f.vehicle_id)         errs.vehicle_id  = 'Selecciona un vehículo.'
  if (!f.odometer_km.trim()) errs.odometer_km = 'El km actual es obligatorio.'
  if (!f.fuel_datetime.trim()) errs.fuel_datetime = 'La fecha y hora son obligatorias.'
  if (!f.fuel_type)          errs.fuel_type   = 'Selecciona el tipo de combustible.'
  if (!f.liters.trim())      errs.liters      = 'Los litros son obligatorios.'
  else if (Number(f.liters) <= 0) errs.liters = 'Los litros deben ser mayores a 0.'

  if (f.odometer_km.trim()) {
    const km = Number(f.odometer_km)
    if (isNaN(km) || km < 0) errs.odometer_km = 'Ingresa un km válido.'
    else {
      const v = vehicles.find(v => v.id === f.vehicle_id)
      if (v?.current_odometer_km != null && km < v.current_odometer_km) {
        errs.odometer_km = `El km ingresado (${km.toLocaleString('es-CL')}) es menor al registrado (${v.current_odometer_km.toLocaleString('es-CL')} km). Verifica antes de continuar.`
      }
    }
  }

  if (f.total_amount.trim() && Number(f.total_amount) < 0)
    errs.total_amount = 'El monto no puede ser negativo.'

  // Level ordering: after-charge level cannot be lower than before-charge level
  if (f.fuel_level_before_eighths !== '' && f.fuel_level_after_eighths !== '') {
    const before = parseInt(f.fuel_level_before_eighths)
    const after  = parseInt(f.fuel_level_after_eighths)
    if (after < before)
      errs.fuel_level_after_eighths = 'El nivel después de cargar no puede ser menor que el nivel antes.'
  }

  return errs
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label, error, required, children, span = 1,
}: {
  label: string; error?: string; required?: boolean
  children: React.ReactNode; span?: 1 | 2
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-rose-300 mt-0.5">{error}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 flex items-center gap-2 pt-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{children}</p>
      <div className="flex-1 h-px bg-raised" />
    </div>
  )
}

const inputCls = (hasErr?: boolean) =>
  `w-full px-2.5 py-1.5 text-[12px] border rounded-md bg-surface text-fg placeholder-muted
   focus:outline-none focus:ring-1 transition
   ${hasErr
     ? 'border-danger-line focus:ring-red-300 focus:border-danger-line'
     : 'border-line focus:ring-fg focus:border-fg'}`

// ─── Component ────────────────────────────────────────────────────────────────

export default function FuelLogModal() {
  const router = useRouter()

  const [open, setOpen]                 = useState(false)
  const [vehicles, setVehicles]         = useState<VehicleOption[]>([])
  const [loadingVehicles, setLoadingV]  = useState(false)
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors]             = useState<FormErrors>({})
  const [saving, setSaving]             = useState(false)
  const [submitError, setSubmitError]   = useState<string | null>(null)

  const loadVehicles = useCallback(async () => {
    setLoadingV(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('vehicles')
      .select('id, plate, brand, model, current_odometer_km, fuel_type')
      .is('deleted_at', null)
      .neq('status', 'out_of_service')
      .order('plate', { ascending: true })
    setVehicles((data ?? []) as VehicleOption[])
    setLoadingV(false)
  }, [])


  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving])

  function handleClose() {
    if (saving) return
    setOpen(false)
    setForm({ ...EMPTY_FORM, fuel_datetime: nowLocalDatetime() })
    setErrors({})
    setSubmitError(null)
  }

  function set(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  /*
   * En app conductor, el check-in/check-out del servicio actualizará km y nivel de
   * combustible del servicio. Este modal usa el último fuel_log como referencia
   * mientras no exista check-out operativo.
   */
  async function handleVehicleChange(vehicleId: string) {
    const v = vehicles.find(v => v.id === vehicleId)

    // Always override km and fuel_type with vehicle's current values on vehicle change
    setForm(prev => ({
      ...prev,
      vehicle_id:                vehicleId,
      odometer_km:               v?.current_odometer_km != null ? String(v.current_odometer_km) : '',
      fuel_type:                 v?.fuel_type ? (vehicleFuelMap[v.fuel_type] ?? '') : '',
      fuel_level_before_eighths: '', // reset while we look up the last log
    }))
    if (errors.vehicle_id) setErrors(e => ({ ...e, vehicle_id: undefined }))

    if (!vehicleId) return

    // Fetch last fuel_log to pre-fill "nivel antes" from the last known "nivel después"
    const supabase = createClient()
    const { data: lastLog } = await supabase
      .from('fuel_logs')
      .select('fuel_level_after_eighths')
      .eq('vehicle_id', vehicleId)
      .order('fuel_datetime', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastLog?.fuel_level_after_eighths != null) {
      setForm(f => ({ ...f, fuel_level_before_eighths: String(lastLog.fuel_level_after_eighths) }))
    }
  }

  // ── Calculated summary ─────────────────────────────────────────────────────

  const litersNum      = parseFloat(form.liters)
  const amountNum      = parseFloat(form.total_amount)
  const levelBefore    = form.fuel_level_before_eighths !== '' ? parseInt(form.fuel_level_before_eighths) : null
  const levelAfter     = form.fuel_level_after_eighths  !== '' ? parseInt(form.fuel_level_after_eighths)  : null
  const costPerLiter   = !isNaN(litersNum) && litersNum > 0 && !isNaN(amountNum) && amountNum > 0
    ? (amountNum / litersNum).toFixed(2)
    : null
  const levelDiff      = levelBefore != null && levelAfter != null
    ? levelAfter - levelBefore
    : null
  const showSummary    = costPerLiter != null || levelDiff != null

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const errs = validate(form, vehicles)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    setSubmitError(null)
    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const num       = (v: string) => v.trim() === '' ? null : Number(v)
      const str       = (v: string) => v.trim() === '' ? null : v.trim()
      const intOrNull = (v: string) => v === '' ? null : parseInt(v)

      const liters      = num(form.liters)
      const totalAmount = num(form.total_amount)
      const unitPrice   = liters != null && liters > 0 && totalAmount != null && totalAmount > 0
        ? totalAmount / liters
        : null

      // Build insert payload — only confirmed public.fuel_logs columns
      const payload: Record<string, unknown> = {
        company_id:                 profile.company_id,
        vehicle_id:                 form.vehicle_id,
        fuel_datetime:              new Date(form.fuel_datetime).toISOString(),
        station_name:               str(form.station_name),
        fuel_type:                  form.fuel_type,
        liters,
        total_amount:               totalAmount,
        unit_price:                 unitPrice,
        odometer_km:                num(form.odometer_km),
        fuel_level_before_eighths:  intOrNull(form.fuel_level_before_eighths),
        fuel_level_after_eighths:   intOrNull(form.fuel_level_after_eighths),
        receipt_number:             str(form.receipt_number),
        notes:                      str(form.notes),
        created_by_profile_id:      user.id,
      }

      const { error: insertErr } = await supabase.from('fuel_logs').insert(payload)
      if (insertErr) throw new Error(friendlyError(insertErr, 'No se pudo registrar la carga'))

      // Update vehicle odometer if new km is greater
      const newKm = num(form.odometer_km)
      if (newKm != null && newKm > 0) {
        const v = vehicles.find(v => v.id === form.vehicle_id)
        if (v?.current_odometer_km == null || newKm > v.current_odometer_km) {
          await supabase
            .from('vehicles')
            .update({ current_odometer_km: newKm })
            .eq('id', form.vehicle_id)
          // Silently ignore error — not critical
        }
      }

      handleClose()
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const selectedVehicle = vehicles.find(v => v.id === form.vehicle_id)

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => { setOpen(true); loadVehicles() }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-line text-[12px] font-medium text-soft hover:bg-sunken transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
        <span className="flex-1">Registrar Carga de Combustible</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.52)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget && !saving) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 760, maxHeight: '94vh' }}
          >
            {/* ── Header ── */}
            <div
              className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#10b98b18' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>
                    Registrar Carga de Combustible
                  </h2>
                  <p className="text-[11px] text-muted mt-0.5">
                    Registra una nueva carga asociada a un vehículo de la flota.
                  </p>
                </div>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                disabled={saving}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">

                {/* ── Vehículo ── */}
                <SectionTitle>Vehículo</SectionTitle>

                <Field label="Vehículo" error={errors.vehicle_id} required span={2}>
                  <select
                    className={inputCls(!!errors.vehicle_id)}
                    value={form.vehicle_id}
                    onChange={e => handleVehicleChange(e.target.value)}
                    disabled={loadingVehicles}
                  >
                    <option value="">{loadingVehicles ? 'Cargando vehículos...' : 'Seleccionar vehículo...'}</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.plate ?? '—'}{(v.brand || v.model) ? ` · ${[v.brand, v.model].filter(Boolean).join(' ')}` : ''}
                        {v.current_odometer_km != null ? ` · ${v.current_odometer_km.toLocaleString('es-CL')} km` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedVehicle?.fuel_type && (
                    <p className="text-[10px] text-muted mt-0.5">
                      Combustible registrado: {FUEL_TYPE_LABELS[vehicleFuelMap[selectedVehicle.fuel_type] ?? selectedVehicle.fuel_type] ?? selectedVehicle.fuel_type}
                    </p>
                  )}
                </Field>

                {/* ── Carga ── */}
                <SectionTitle>Datos de la Carga</SectionTitle>

                <Field label="KM Actual" error={errors.odometer_km} required>
                  <input
                    type="number" min={0}
                    className={inputCls(!!errors.odometer_km)}
                    value={form.odometer_km}
                    onChange={e => set('odometer_km', e.target.value)}
                    placeholder={selectedVehicle?.current_odometer_km != null
                      ? String(selectedVehicle.current_odometer_km)
                      : '0'}
                  />
                  {selectedVehicle?.current_odometer_km != null && !errors.odometer_km && (
                    <p className="text-[10px] text-muted mt-0.5">
                      Último registrado: {selectedVehicle.current_odometer_km.toLocaleString('es-CL')} km
                    </p>
                  )}
                </Field>

                <Field label="Fecha y Hora" error={errors.fuel_datetime} required>
                  <input
                    type="datetime-local"
                    className={inputCls(!!errors.fuel_datetime)}
                    value={form.fuel_datetime}
                    onChange={e => set('fuel_datetime', e.target.value)}
                  />
                </Field>

                <Field label="Tipo de Combustible" error={errors.fuel_type} required>
                  <select
                    className={inputCls(!!errors.fuel_type)}
                    value={form.fuel_type}
                    onChange={e => set('fuel_type', e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {Object.entries(FUEL_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Estación de Servicio">
                  <input
                    className={inputCls()}
                    value={form.station_name}
                    onChange={e => set('station_name', e.target.value)}
                    placeholder="COPEC, Shell, Petrobras..."
                  />
                </Field>

                <Field label="Litros Cargados" error={errors.liters} required>
                  <input
                    type="number" min={0} step="0.01"
                    className={inputCls(!!errors.liters)}
                    value={form.liters}
                    onChange={e => set('liters', e.target.value)}
                    placeholder="0.00"
                  />
                </Field>

                <Field label="Monto Total ($)" error={errors.total_amount}>
                  <input
                    type="number" min={0}
                    className={inputCls(!!errors.total_amount)}
                    value={form.total_amount}
                    onChange={e => set('total_amount', e.target.value)}
                    placeholder="0"
                  />
                </Field>

                {/* ── Nivel de Combustible ── */}
                <SectionTitle>Nivel del Estanque</SectionTitle>

                <Field label="Nivel Antes (0–8 octavos)">
                  <select
                    className={inputCls()}
                    value={form.fuel_level_before_eighths}
                    onChange={e => set('fuel_level_before_eighths', e.target.value)}
                  >
                    <option value="">—</option>
                    {LEVEL_OPTIONS.map(n => (
                      <option key={n} value={n}>{n}/8</option>
                    ))}
                  </select>
                </Field>

                <Field label="Nivel Después (0–8 octavos)" error={errors.fuel_level_after_eighths}>
                  <select
                    className={inputCls(!!errors.fuel_level_after_eighths)}
                    value={form.fuel_level_after_eighths}
                    onChange={e => set('fuel_level_after_eighths', e.target.value)}
                  >
                    <option value="">—</option>
                    {LEVEL_OPTIONS.map(n => (
                      <option key={n} value={n}>{n}/8</option>
                    ))}
                  </select>
                </Field>

                {/* ── Comprobante ── */}
                <SectionTitle>Comprobante y Notas</SectionTitle>

                <Field label="Nº Comprobante / Boleta">
                  <input
                    className={inputCls()}
                    value={form.receipt_number}
                    onChange={e => set('receipt_number', e.target.value)}
                    placeholder="B-00123456..."
                  />
                </Field>

                <div /> {/* spacer */}

                <Field label="Observaciones" span={2}>
                  <textarea
                    rows={2}
                    className={inputCls() + ' resize-none'}
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Observaciones internas de la carga..."
                  />
                </Field>

              </div>

              {/* ── Resumen calculado ── */}
              {showSummary && (
                <div
                  className="mt-4 rounded-md border border-line overflow-hidden"
                >
                  <div
                    className="px-4 py-2 border-b border-raised"
                    style={{ backgroundColor: '#10223d' }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                      Resumen Calculado
                    </p>
                  </div>
                  <div className="flex divide-x divide-raised">
                    {costPerLiter != null && (
                      <div className="flex-1 px-5 py-3 text-center">
                        <p className="text-[22px] font-bold leading-none" style={{ color: '#10b98b' }}>
                          ${costPerLiter}
                        </p>
                        <p className="text-[10px] text-muted mt-1">Costo por litro</p>
                      </div>
                    )}
                    {levelDiff != null && (
                      <div className="flex-1 px-5 py-3 text-center">
                        <p
                          className="text-[22px] font-bold leading-none"
                          style={{ color: levelDiff >= 0 ? '#55d9ad' : '#fda4af' }}
                        >
                          {levelDiff > 0 ? '+' : ''}{levelDiff}/8
                        </p>
                        <p className="text-[10px] text-muted mt-1">Diferencia de nivel</p>
                      </div>
                    )}
                    {!isNaN(litersNum) && litersNum > 0 && (
                      <div className="flex-1 px-5 py-3 text-center">
                        <p className="text-[22px] font-bold leading-none" style={{ color: '#f1f5f9' }}>
                          {litersNum.toFixed(litersNum % 1 === 0 ? 0 : 2)} L
                        </p>
                        <p className="text-[10px] text-muted mt-1">Total cargado</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error message */}
              {submitError && (
                <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px] mt-4">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div
              className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="px-4 py-2 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || loadingVehicles}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-canvas transition-opacity disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: '#10b98b' }}
              >
                {saving ? (
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
                    Guardar Carga
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
