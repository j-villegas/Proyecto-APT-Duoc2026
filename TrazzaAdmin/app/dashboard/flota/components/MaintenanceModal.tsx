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
}

type FormState = {
  vehicle_id: string
  odometer_km: string
  maintenance_type: string
  severity: string
  description: string
  action: string
  scheduled_date: string
  workshop_name: string
  estimated_cost: string
  notes: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

// ─── Constants ────────────────────────────────────────────────────────────────

const MAINTENANCE_TYPES = [
  { value: 'mechanical',   label: 'Mecánica' },
  { value: 'electrical',   label: 'Eléctrica' },
  { value: 'tires',        label: 'Neumáticos' },
  { value: 'brakes',       label: 'Frenos' },
  { value: 'preventive',   label: 'Mantención preventiva' },
  { value: 'documentation',label: 'Documentación' },
  { value: 'other',        label: 'Otro' },
]

const SEVERITY_OPTIONS = [
  { value: 'low',      label: 'Baja',     color: '#55d9ad', bg: '#123b35', border: '#28684e' },
  { value: 'medium',   label: 'Media',    color: '#f8cb78', bg: '#3b3020', border: '#755c33' },
  { value: 'high',     label: 'Alta',     color: '#fdba74', bg: '#3b3020', border: '#755538' },
  { value: 'critical', label: 'Crítica',  color: '#fda4af', bg: '#3d2332', border: '#794052' },
]

const EMPTY_FORM: FormState = {
  vehicle_id: '', odometer_km: '', maintenance_type: '',
  severity: 'medium', description: '', action: '',
  scheduled_date: '', workshop_name: '', estimated_cost: '', notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validate(f: FormState, vehicles: VehicleOption[]): FormErrors {
  const errs: FormErrors = {}
  if (!f.vehicle_id)           errs.vehicle_id        = 'Selecciona un vehículo.'
  if (!f.odometer_km.trim())   errs.odometer_km       = 'El km actual es obligatorio.'
  if (!f.maintenance_type)     errs.maintenance_type  = 'Selecciona el tipo.'
  if (!f.severity)             errs.severity          = 'Selecciona la severidad.'
  if (!f.description.trim())   errs.description       = 'La descripción es obligatoria.'
  if (!f.action)               errs.action            = 'Selecciona la acción a tomar.'

  if (f.odometer_km.trim()) {
    const km = Number(f.odometer_km)
    if (isNaN(km) || km < 0) {
      errs.odometer_km = 'Ingresa un km válido.'
    } else {
      const v = vehicles.find(v => v.id === f.vehicle_id)
      if (v?.current_odometer_km != null && km < v.current_odometer_km) {
        errs.odometer_km = `El km ingresado (${km.toLocaleString('es-CL')}) es menor al registrado (${v.current_odometer_km.toLocaleString('es-CL')} km).`
      }
    }
  }

  if (f.action === 'scheduled_maintenance' && !f.scheduled_date.trim())
    errs.scheduled_date = 'La fecha programada es obligatoria.'

  if (f.estimated_cost.trim() && Number(f.estimated_cost) < 0)
    errs.estimated_cost = 'El costo no puede ser negativo.'

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

export default function MaintenanceModal() {
  const router = useRouter()

  const [open, setOpen]               = useState(false)
  const [vehicles, setVehicles]       = useState<VehicleOption[]>([])
  const [loadingVehicles, setLoadingV]= useState(false)
  const [form, setForm]               = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors]           = useState<FormErrors>({})
  const [saving, setSaving]           = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadVehicles = useCallback(async () => {
    setLoadingV(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('vehicles')
      .select('id, plate, brand, model, current_odometer_km')
      .is('deleted_at', null)
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
    setForm(EMPTY_FORM)
    setErrors({})
    setSubmitError(null)
  }

  function set(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  function handleVehicleChange(vehicleId: string) {
    const v = vehicles.find(v => v.id === vehicleId)
    setForm(prev => ({
      ...prev,
      vehicle_id:  vehicleId,
      odometer_km: v?.current_odometer_km != null ? String(v.current_odometer_km) : '',
    }))
    if (errors.vehicle_id) setErrors(e => ({ ...e, vehicle_id: undefined }))
  }

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
        .from('profiles').select('id, company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const num = (v: string) => v.trim() === '' ? null : Number(v)
      const str = (v: string) => v.trim() === '' ? null : v.trim()

      const status = form.action === 'immediate_maintenance' ? 'in_progress' : 'scheduled'

      // Map visual form type to the allowed DB enum values
      const titleMap: Record<string, string> = {
        mechanical:    'Falla mecánica',
        electrical:    'Falla eléctrica',
        tires:         'Falla de neumáticos',
        brakes:        'Falla de frenos',
        preventive:    'Mantención preventiva',
        documentation: 'Mantención documentación',
        other:         'Mantención / falla',
      }
      const dbTypeMap: Record<string, 'corrective' | 'preventive'> = {
        mechanical:    'corrective',
        electrical:    'corrective',
        tires:         'corrective',
        brakes:        'corrective',
        preventive:    'preventive',
        documentation: 'corrective',
        other:         'corrective',
      }
      const title        = titleMap[form.maintenance_type]  ?? 'Mantención / falla'
      const dbType       = dbTypeMap[form.maintenance_type] ?? 'corrective'
      const visualLabel  = titleMap[form.maintenance_type]  ?? form.maintenance_type

      // Build description preserving visual type detail
      const descParts = [`Tipo reportado:\n${visualLabel}`]
      if (form.description.trim()) descParts.push(`Descripción del problema:\n${form.description.trim()}`)
      if (form.notes.trim())       descParts.push(`Observaciones internas:\n${form.notes.trim()}`)
      const mergedDescription = descParts.join('\n\n')

      // Exact columns from public.maintenance_orders schema
      const orderPayload: Record<string, unknown> = {
        company_id:            profile.company_id,
        vehicle_id:            form.vehicle_id,
        maintenance_type:      dbType,
        priority:              form.severity,   // severity maps 1:1 to priority
        status,
        title,
        description:           mergedDescription,
        odometer_km:           num(form.odometer_km),
        created_by_profile_id: profile.id,
      }

      // Only include optional columns when they have a value
      if (form.action === 'scheduled_maintenance' && form.scheduled_date.trim())
        orderPayload.scheduled_date = form.scheduled_date.trim()

      if (str(form.workshop_name))
        orderPayload.workshop_name = str(form.workshop_name)

      if (num(form.estimated_cost) != null)
        orderPayload.estimated_cost = num(form.estimated_cost)

      const { error: orderErr } = await supabase
        .from('maintenance_orders')
        .insert(orderPayload)

      if (orderErr) throw new Error(friendlyError(orderErr, 'No se pudo registrar'))

      // If immediate → set vehicle to maintenance status
      if (form.action === 'immediate_maintenance') {
        const { error: vErr } = await supabase
          .from('vehicles')
          .update({ status: 'maintenance' })
          .eq('id', form.vehicle_id)
        if (vErr) throw new Error(friendlyError(vErr, 'No se pudo actualizar el vehículo'))
      }

      // Optional: create operational_alert — silently ignore on failure
      try {
        await supabase.from('operational_alerts').insert({
          company_id:  profile.company_id,
          entity_type: 'vehicle',
          entity_id:   form.vehicle_id,
          severity:    form.severity,
          status:      'open',
          title:       `Falla reportada · ${MAINTENANCE_TYPES.find(t => t.value === form.maintenance_type)?.label ?? form.maintenance_type}`,
        })
      } catch {
        // optional — ignore
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
  const activeSeverity  = SEVERITY_OPTIONS.find(s => s.value === form.severity)

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => { setOpen(true); loadVehicles() }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-line text-[12px] font-medium text-soft hover:bg-sunken transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 text-danger-fg flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="flex-1">Avisar Falla Mecánica</span>
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
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 bg-danger-bg">
                  <svg className="w-5 h-5 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>
                    Avisar Falla / Ingreso a Mantención
                  </h2>
                  <p className="text-[11px] text-muted mt-0.5">
                    Registra una falla o mantenimiento asociado a un vehículo.
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
                </Field>

                <Field label="KM Actual" error={errors.odometer_km} required>
                  <input
                    type="number" min={0}
                    className={inputCls(!!errors.odometer_km)}
                    value={form.odometer_km}
                    onChange={e => set('odometer_km', e.target.value)}
                    placeholder={selectedVehicle?.current_odometer_km != null
                      ? String(selectedVehicle.current_odometer_km) : '0'}
                  />
                  {selectedVehicle?.current_odometer_km != null && !errors.odometer_km && (
                    <p className="text-[10px] text-muted mt-0.5">
                      Último registrado: {selectedVehicle.current_odometer_km.toLocaleString('es-CL')} km
                    </p>
                  )}
                </Field>

                <div /> {/* spacer */}

                {/* ── Falla ── */}
                <SectionTitle>Datos de la Falla</SectionTitle>

                <Field label="Tipo de Falla / Mantención" error={errors.maintenance_type} required>
                  <select
                    className={inputCls(!!errors.maintenance_type)}
                    value={form.maintenance_type}
                    onChange={e => set('maintenance_type', e.target.value)}
                  >
                    <option value="">Seleccionar tipo...</option>
                    {MAINTENANCE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>

                {/* Severity toggle buttons */}
                <Field label="Severidad" error={errors.severity} required>
                  <div className="flex gap-1.5 flex-wrap">
                    {SEVERITY_OPTIONS.map(s => {
                      const active = form.severity === s.value
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => set('severity', s.value)}
                          className="flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold border transition-all cursor-pointer min-w-[56px]"
                          style={{
                            borderColor: active ? s.color : '#2b405b',
                            backgroundColor: active ? s.bg : 'white',
                            color: active ? s.color : '#a8b8cc',
                          }}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                  {activeSeverity && (
                    <p className="text-[10px] mt-0.5" style={{ color: activeSeverity.color }}>
                      Severidad: {activeSeverity.label}
                    </p>
                  )}
                </Field>

                <Field label="Descripción del problema" error={errors.description} required span={2}>
                  <textarea
                    rows={3}
                    className={inputCls(!!errors.description) + ' resize-none'}
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                    placeholder="Describa el problema reportado..."
                  />
                </Field>

                {/* ── Acción ── */}
                <SectionTitle>Acción a Tomar</SectionTitle>

                <Field label="Acción" error={errors.action} required span={2}>
                  <div className="flex flex-col gap-2">
                    {[
                      {
                        value: 'immediate_maintenance',
                        label: 'Ingreso a taller inmediato',
                        sub: 'El vehículo pasará a estado "Mantención" de inmediato.',
                        iconColor: '#fda4af',
                        icon: (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                          </svg>
                        ),
                      },
                      {
                        value: 'scheduled_maintenance',
                        label: 'Programar mantención',
                        sub: 'El vehículo sigue operativo hasta la fecha programada.',
                        iconColor: '#7dbbff',
                        icon: (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                          </svg>
                        ),
                      },
                    ].map(opt => {
                      const active = form.action === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => set('action', opt.value)}
                          className="flex items-start gap-3 px-4 py-3 rounded-md border text-left transition-all cursor-pointer"
                          style={{
                            borderColor: active ? opt.iconColor : '#2b405b',
                            backgroundColor: active ? opt.iconColor + '08' : 'white',
                          }}
                        >
                          <span style={{ color: active ? opt.iconColor : '#a8b8cc', marginTop: 1 }}>
                            {opt.icon}
                          </span>
                          <div>
                            <p className="text-[12px] font-semibold" style={{ color: active ? opt.iconColor : '#d5e0ed' }}>
                              {opt.label}
                            </p>
                            <p className="text-[10px] text-muted mt-0.5">{opt.sub}</p>
                          </div>
                          {active && (
                            <svg className="w-4 h-4 ml-auto flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke={opt.iconColor} strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {errors.action && <p className="text-[10px] text-rose-300 mt-0.5">{errors.action}</p>}
                </Field>

                {/* Scheduled date — shown only for scheduled_maintenance */}
                {form.action === 'scheduled_maintenance' && (
                  <Field label="Fecha Programada" error={errors.scheduled_date} required>
                    <input
                      type="date"
                      className={inputCls(!!errors.scheduled_date)}
                      value={form.scheduled_date}
                      onChange={e => set('scheduled_date', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </Field>
                )}

                {/* ── Taller y Costos ── */}
                <SectionTitle>Taller y Costos</SectionTitle>

                <Field label="Taller / Proveedor">
                  <input
                    className={inputCls()}
                    value={form.workshop_name}
                    onChange={e => set('workshop_name', e.target.value)}
                    placeholder="Nombre del taller..."
                  />
                </Field>

                <Field label="Costo Estimado ($)" error={errors.estimated_cost}>
                  <input
                    type="number" min={0}
                    className={inputCls(!!errors.estimated_cost)}
                    value={form.estimated_cost}
                    onChange={e => set('estimated_cost', e.target.value)}
                    placeholder="0"
                  />
                </Field>

                {/* ── Observaciones ── */}
                <SectionTitle>Observaciones</SectionTitle>

                <Field label="Notas Internas" span={2}>
                  <textarea
                    rows={2}
                    className={inputCls() + ' resize-none'}
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Observaciones internas del aviso..."
                  />
                </Field>

              </div>

              {/* Action summary banner */}
              {form.action === 'immediate_maintenance' && (
                <div className="mt-4 flex items-start gap-3 bg-danger-bg border border-danger-line rounded-md px-4 py-3">
                  <svg className="w-4 h-4 text-rose-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-[12px] text-rose-200">
                    Al confirmar, <strong>el vehículo quedará en estado «Mantención»</strong> y no estará disponible para nuevos servicios hasta que se reintegre manualmente.
                  </p>
                </div>
              )}

              {form.action === 'scheduled_maintenance' && form.scheduled_date && (
                <div className="mt-4 flex items-start gap-3 bg-info-bg border border-[#355979] rounded-md px-4 py-3">
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[12px] text-blue-200">
                    Se creará una orden de mantención programada para el <strong>{new Date(form.scheduled_date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</strong>. El vehículo no cambiará de estado.
                  </p>
                </div>
              )}

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
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-white transition-opacity disabled:opacity-50 cursor-pointer"
                style={{
                  backgroundColor: form.action === 'immediate_maintenance' ? '#fda4af' : '#f1f5f9',
                }}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Registrando...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Confirmar Aviso
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
