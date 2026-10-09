'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type VehicleData = {
  id: string
  plate: string | null
  brand: string | null
  model: string | null
  vehicle_type: string | null
  capacity_passengers: number | null
  year: number | null
  status: string | null
  current_odometer_km: number | null
  next_maintenance_km: number | null
  estimated_fuel_efficiency_km_l: number | null
  base_location: string | null
  fuel_type: string | null
  tank_capacity_liters: number | null
  technical_review_expires_at: string | null
  circulation_permit_expires_at: string | null
  insurance_expires_at: string | null
  insurance_policy_number: string | null
  notes: string | null
  company_id: string | null
}

type FormState = {
  plate: string
  brand: string
  model: string
  vehicle_type: string
  capacity_passengers: string
  year: string
  status: string
  current_odometer_km: string
  next_maintenance_km: string
  estimated_fuel_efficiency_km_l: string
  base_location: string
  fuel_type: string
  tank_capacity_liters: string
  technical_review_expires_at: string
  circulation_permit_expires_at: string
  insurance_expires_at: string
  insurance_policy_number: string
  notes: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

type OpenOrder = {
  id: string
  title: string | null
  maintenance_type: string | null
  priority: string | null
  description: string | null
  started_at: string | null
  created_at: string | null
}

type FinishForm = { odometer_km: string; final_cost: string; finish_notes: string }
type FinishErrors = Partial<Record<keyof FinishForm, string>>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAINTENANCE_TYPE_LABEL: Record<string, string> = {
  mechanical:    'Mecánica',
  electrical:    'Eléctrica',
  tires:         'Neumáticos',
  brakes:        'Frenos',
  preventive:    'Mantención preventiva',
  documentation: 'Documentación',
  other:         'Otro',
}

const PRIORITY_LABEL: Record<string, string> = {
  low:      'Baja',
  medium:   'Media',
  high:     'Alta',
  critical: 'Crítica',
}

const PRIORITY_COLOR: Record<string, { text: string; bg: string }> = {
  low:      { text: '#7dbbff', bg: '#183352' },
  medium:   { text: '#f8cb78', bg: '#3b3020' },
  high:     { text: '#fdba74', bg: '#3b3020' },
  critical: { text: '#fda4af', bg: '#3d2332' },
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const EMPTY_FORM: FormState = {
  plate: '', brand: '', model: '', vehicle_type: '', capacity_passengers: '',
  year: '', status: 'available', current_odometer_km: '', next_maintenance_km: '',
  estimated_fuel_efficiency_km_l: '', base_location: '', fuel_type: '',
  tank_capacity_liters: '', technical_review_expires_at: '',
  circulation_permit_expires_at: '', insurance_expires_at: '',
  insurance_policy_number: '', notes: '',
}

function toForm(v: VehicleData): FormState {
  return {
    plate:                          v.plate ?? '',
    brand:                          v.brand ?? '',
    model:                          v.model ?? '',
    vehicle_type:                   v.vehicle_type ?? '',
    capacity_passengers:            v.capacity_passengers != null ? String(v.capacity_passengers) : '',
    year:                           v.year != null ? String(v.year) : '',
    status:                         v.status ?? 'available',
    current_odometer_km:            v.current_odometer_km != null ? String(v.current_odometer_km) : '',
    next_maintenance_km:            v.next_maintenance_km != null ? String(v.next_maintenance_km) : '',
    estimated_fuel_efficiency_km_l: v.estimated_fuel_efficiency_km_l != null ? String(v.estimated_fuel_efficiency_km_l) : '',
    base_location:                  v.base_location ?? '',
    fuel_type:                      v.fuel_type ?? '',
    tank_capacity_liters:           v.tank_capacity_liters != null ? String(v.tank_capacity_liters) : '',
    technical_review_expires_at:    v.technical_review_expires_at?.slice(0, 10) ?? '',
    circulation_permit_expires_at:  v.circulation_permit_expires_at?.slice(0, 10) ?? '',
    insurance_expires_at:           v.insurance_expires_at?.slice(0, 10) ?? '',
    insurance_policy_number:        v.insurance_policy_number ?? '',
    notes:                          v.notes ?? '',
  }
}

const statusMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  available:      { label: 'Disponible',       bg: '#123b35', text: '#55d9ad', dot: '#55d9ad' },
  in_service:     { label: 'En Servicio',      bg: '#3b3020', text: '#f8cb78', dot: '#f8cb78' },
  maintenance:    { label: 'Mantención',       bg: '#183352', text: '#7dbbff', dot: '#7dbbff' },
  out_of_service: { label: 'Fuera de Servicio',bg: '#3d2332', text: '#fda4af', dot: '#fda4af' },
}

function getStatusMeta(s: string | null) {
  return statusMeta[s ?? ''] ?? { label: s ?? '—', bg: '#203650', text: '#bac9db', dot: '#a8b8cc' }
}

function validateForm(f: FormState): FormErrors {
  const errs: FormErrors = {}
  if (!f.plate.trim())        errs.plate        = 'La patente es obligatoria.'
  if (!f.brand.trim())        errs.brand        = 'La marca es obligatoria.'
  if (!f.model.trim())        errs.model        = 'El modelo es obligatorio.'
  if (!f.vehicle_type.trim()) errs.vehicle_type = 'El tipo de vehículo es obligatorio.'
  if (!f.status.trim())       errs.status       = 'El estado es obligatorio.'

  if (f.year.trim()) {
    const y = Number(f.year)
    if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear() + 1)
      errs.year = 'Año inválido.'
  }
  for (const key of ['capacity_passengers', 'current_odometer_km', 'next_maintenance_km',
                      'estimated_fuel_efficiency_km_l', 'tank_capacity_liters'] as const) {
    if (f[key].trim() && Number(f[key]) < 0)
      errs[key] = 'Debe ser un valor >= 0.'
  }
  return errs
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 flex items-center gap-2 pt-1 mb-0.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8b8cc]">{children}</p>
      <div className="flex-1 h-px bg-[#203650]" />
    </div>
  )
}

function Field({
  label, error, required, children,
  span = 1,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
  span?: 1 | 2
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-rose-300 mt-0.5">{error}</p>}
    </div>
  )
}

const inputCls = (hasErr?: boolean) =>
  `w-full px-2.5 py-1.5 text-[12px] border rounded-md bg-[#142942] text-[#f1f5f9] placeholder-[#a8b8cc]
   focus:outline-none focus:ring-1 transition
   ${hasErr
     ? 'border-[#794052] focus:ring-red-300 focus:border-[#794052]'
     : 'border-[#2b405b] focus:ring-[#f1f5f9] focus:border-[#f1f5f9]'
   }`

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  vehicleId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VehicleDetailModal({ vehicleId }: Props) {
  const router = useRouter()

  const [open, setOpen]                     = useState(false)
  const [loadingData, setLoadingData]       = useState(false)
  const [vehicle, setVehicle]               = useState<VehicleData | null>(null)
  const [activeService, setActiveService]   = useState<{ service_code: string | null } | null | undefined>(undefined)
  const [openOrder, setOpenOrder]           = useState<OpenOrder | null | undefined>(undefined)
  const [form, setForm]                     = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors]                 = useState<FormErrors>({})
  const [saving, setSaving]                 = useState(false)
  const [submitError, setSubmitError]       = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess]       = useState(false)
  const [showDeactivate, setShowDeactivate] = useState(false)
  const [deactivating, setDeactivating]     = useState(false)
  // Finish maintenance
  const [showFinish, setShowFinish]         = useState(false)
  const [finishForm, setFinishForm]         = useState<FinishForm>({ odometer_km: '', final_cost: '', finish_notes: '' })
  const [finishErrors, setFinishErrors]     = useState<FinishErrors>({})
  const [finishing, setFinishing]           = useState(false)

  const loadVehicle = useCallback(async () => {
    setLoadingData(true)
    setSubmitError(null)
    const supabase = createClient()

    const [vResult, sResult, oResult] = await Promise.all([
      supabase
        .from('vehicles')
        .select(`
          id, plate, brand, model, vehicle_type, capacity_passengers, year, status,
          current_odometer_km, next_maintenance_km, estimated_fuel_efficiency_km_l,
          base_location, fuel_type, tank_capacity_liters,
          technical_review_expires_at, circulation_permit_expires_at,
          insurance_expires_at, insurance_policy_number, notes, company_id
        `)
        .eq('id', vehicleId)
        .single(),

      supabase
        .from('services')
        .select('service_code')
        .eq('vehicle_id', vehicleId)
        .eq('status', 'in_progress')
        .limit(1)
        .maybeSingle(),

      // Latest open maintenance order for this vehicle
      supabase
        .from('maintenance_orders')
        .select('id, title, maintenance_type, priority, description, started_at, created_at')
        .eq('vehicle_id', vehicleId)
        .eq('status', 'in_progress')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (vResult.data) {
      const v = vResult.data as VehicleData
      setVehicle(v)
      setForm(toForm(v))
      // Pre-fill finish form odometer from vehicle
      setFinishForm(f => ({ ...f, odometer_km: v.current_odometer_km != null ? String(v.current_odometer_km) : '' }))
    } else {
      setSubmitError('No se pudo cargar el vehículo.')
    }
    setActiveService(sResult.data ?? null)
    setOpenOrder((oResult.data ?? null) as OpenOrder | null)
    setLoadingData(false)
  }, [vehicleId])

  useEffect(() => { if (open) loadVehicle() }, [open, loadVehicle])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deactivating && !finishing) handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving, deactivating, finishing])

  function handleClose() {
    if (saving || deactivating || finishing) return
    setOpen(false)
    setErrors({})
    setSubmitError(null)
    setSaveSuccess(false)
    setShowDeactivate(false)
    setShowFinish(false)
    setOpenOrder(undefined)
    setVehicle(null)
    setActiveService(undefined)
    setForm(EMPTY_FORM)
    setFinishForm({ odometer_km: '', final_cost: '', finish_notes: '' })
    setFinishErrors({})
  }

  function set(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
    setSaveSuccess(false)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validateForm(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    setSubmitError(null)
    setSaveSuccess(false)
    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const num = (v: string) => v.trim() === '' ? null : Number(v)
      const str = (v: string) => v.trim() === '' ? null : v.trim()
      const dateStr = (v: string) => v.trim() === '' ? null : v.trim()

      const payload: Record<string, unknown> = {
        plate:                          form.plate.trim().toUpperCase(),
        brand:                          form.brand.trim(),
        model:                          form.model.trim(),
        vehicle_type:                   form.vehicle_type,
        status:                         form.status,
        capacity_passengers:            num(form.capacity_passengers),
        year:                           num(form.year),
        current_odometer_km:            num(form.current_odometer_km),
        next_maintenance_km:            num(form.next_maintenance_km),
        estimated_fuel_efficiency_km_l: num(form.estimated_fuel_efficiency_km_l),
        base_location:                  str(form.base_location),
        fuel_type:                      str(form.fuel_type),
        tank_capacity_liters:           num(form.tank_capacity_liters),
        technical_review_expires_at:    dateStr(form.technical_review_expires_at),
        circulation_permit_expires_at:  dateStr(form.circulation_permit_expires_at),
        insurance_expires_at:           dateStr(form.insurance_expires_at),
        insurance_policy_number:        str(form.insurance_policy_number),
        notes:                          str(form.notes),
      }

      const { error: updErr } = await supabase
        .from('vehicles')
        .update(payload)
        .eq('id', vehicleId)
        .eq('company_id', profile.company_id)
      if (updErr) throw new Error(`Error al guardar: ${updErr.message}`)

      setSaveSuccess(true)
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  // ── Deactivate ─────────────────────────────────────────────────────────────

  async function handleDeactivate() {
    setDeactivating(true)
    setSubmitError(null)
    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const { error: updErr } = await supabase
        .from('vehicles')
        .update({ deleted_at: new Date().toISOString(), status: 'out_of_service' })
        .eq('id', vehicleId)
        .eq('company_id', profile.company_id)
      if (updErr) throw new Error(`Error al desactivar el vehículo: ${updErr.message}`)

      handleClose()
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
      setShowDeactivate(false)
    } finally {
      setDeactivating(false)
    }
  }

  // ── Finish Maintenance ─────────────────────────────────────────────────────

  async function handleFinishMaintenance() {
    // Validate finish form
    const ferrs: FinishErrors = {}
    if (!finishForm.odometer_km.trim()) {
      ferrs.odometer_km = 'El km actual es obligatorio.'
    } else {
      const km = Number(finishForm.odometer_km)
      if (isNaN(km) || km < 0) {
        ferrs.odometer_km = 'Ingresa un km válido.'
      } else if (vehicle?.current_odometer_km != null && km < vehicle.current_odometer_km) {
        ferrs.odometer_km = `No puede ser menor al registrado (${vehicle.current_odometer_km.toLocaleString('es-CL')} km).`
      }
    }
    if (finishForm.final_cost.trim() && Number(finishForm.final_cost) < 0)
      ferrs.final_cost = 'El costo no puede ser negativo.'
    if (Object.keys(ferrs).length > 0) { setFinishErrors(ferrs); return }

    setFinishing(true)
    setSubmitError(null)
    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      // Validate vehicle still in maintenance
      const { data: freshVehicle } = await supabase
        .from('vehicles').select('status, current_odometer_km, company_id').eq('id', vehicleId).single()
      if (!freshVehicle) throw new Error('No se pudo verificar el estado del vehículo.')
      if (freshVehicle.company_id !== profile.company_id) throw new Error('Sin permisos sobre este vehículo.')
      if (freshVehicle.status !== 'maintenance') throw new Error('El vehículo ya no está en mantención.')

      const now  = new Date().toISOString()
      const newKm = Number(finishForm.odometer_km)

      // Update maintenance_order if it exists
      if (openOrder) {
        const orderUpdate: Record<string, unknown> = {
          status:       'completed',
          completed_at: now,
          odometer_km:  newKm,
        }
        if (finishForm.final_cost.trim())
          orderUpdate.final_cost = Number(finishForm.final_cost)
        if (finishForm.finish_notes.trim()) {
          const closingNote = `\n\nCierre de mantención:\n${finishForm.finish_notes.trim()}`
          orderUpdate.description = (openOrder.description ?? '') + closingNote
        }
        const { error: oErr } = await supabase
          .from('maintenance_orders')
          .update(orderUpdate)
          .eq('id', openOrder.id)
        if (oErr) throw new Error(`Error al cerrar la orden: ${oErr.message}`)
      }

      // Update vehicle to available; update km only if ≥ current
      const vehicleUpdate: Record<string, unknown> = { status: 'available' }
      if (freshVehicle.current_odometer_km == null || newKm >= freshVehicle.current_odometer_km)
        vehicleUpdate.current_odometer_km = newKm

      const { error: vErr } = await supabase
        .from('vehicles')
        .update(vehicleUpdate)
        .eq('id', vehicleId)
        .eq('company_id', profile.company_id)
      if (vErr) throw new Error(`Error al actualizar el vehículo: ${vErr.message}`)

      handleClose()
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setFinishing(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const sm = getStatusMeta(form.status || vehicle?.status)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold px-2.5 py-1 rounded border border-[#2b405b] text-[#f1f5f9] hover:bg-[#1b3552] transition-colors cursor-pointer whitespace-nowrap"
      >
        Ver detalle
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.52)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget && !saving && !deactivating) handleClose() }}
        >
          <div
            className="bg-[#142942] rounded-lg border border-[#2b405b] w-full flex flex-col"
            style={{ maxWidth: 780, maxHeight: '94vh' }}
          >
            {/* ── Header ── */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-[#2b405b] flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#a8b8cc12' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#f1f5f9" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-[15px] font-bold" style={{ color: '#f1f5f9' }}>
                      Detalle del Vehículo
                    </h2>
                    {vehicle && (
                      <span
                        className="text-[11px] font-bold px-2.5 py-0.5 rounded font-mono tracking-widest border"
                        style={{ backgroundColor: '#254b77', color: 'white', borderColor: '#355979' }}
                      >
                        {vehicle.plate ?? '—'}
                      </span>
                    )}
                    {vehicle && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: sm.bg, color: sm.text }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sm.dot }} />
                        {sm.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#a8b8cc] mt-0.5">
                    {loadingData
                      ? 'Cargando...'
                      : activeService
                        ? `Servicio en curso · ${activeService.service_code ?? activeService}`
                        : activeService === null
                          ? 'Sin servicio en curso'
                          : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={saving || deactivating}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[#a8b8cc] hover:text-[#f1f5f9] hover:bg-[#2b405b] transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {loadingData ? (
                <div className="flex items-center justify-center py-16 gap-3 text-[#a8b8cc]">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-[13px]">Cargando datos del vehículo...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">

                  {/* ── Información General ── */}
                  <SectionTitle>Información General</SectionTitle>

                  <Field label="Patente" error={errors.plate} required>
                    <input
                      className={inputCls(!!errors.plate)}
                      value={form.plate}
                      onChange={e => set('plate', e.target.value.toUpperCase())}
                      placeholder="ABCD12"
                    />
                  </Field>

                  <Field label="Estado" error={errors.status} required>
                    <select className={inputCls(!!errors.status)} value={form.status} onChange={e => set('status', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      <option value="available">Disponible</option>
                      <option value="in_service">En Servicio</option>
                      <option value="maintenance">Mantención</option>
                      <option value="out_of_service">Fuera de Servicio</option>
                    </select>
                  </Field>

                  <Field label="Marca" error={errors.brand} required>
                    <input className={inputCls(!!errors.brand)} value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Toyota, Mercedes..." />
                  </Field>

                  <Field label="Modelo" error={errors.model} required>
                    <input className={inputCls(!!errors.model)} value={form.model} onChange={e => set('model', e.target.value)} placeholder="Coaster, Sprinter..." />
                  </Field>

                  <Field label="Tipo de Vehículo" error={errors.vehicle_type} required>
                    <select className={inputCls(!!errors.vehicle_type)} value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      <option value="bus">Bus</option>
                      <option value="minibus">Minibús</option>
                      <option value="van">Van</option>
                      <option value="furgon">Furgón</option>
                      <option value="truck">Camión</option>
                      <option value="other">Otro</option>
                    </select>
                  </Field>

                  <Field label="Capacidad Pasajeros" error={errors.capacity_passengers}>
                    <input type="number" min={0} className={inputCls(!!errors.capacity_passengers)} value={form.capacity_passengers} onChange={e => set('capacity_passengers', e.target.value)} placeholder="0" />
                  </Field>

                  <Field label="Año" error={errors.year}>
                    <input type="number" min={1900} max={new Date().getFullYear() + 1} className={inputCls(!!errors.year)} value={form.year} onChange={e => set('year', e.target.value)} placeholder="2020" />
                  </Field>

                  {/* ── Operación ── */}
                  <SectionTitle>Operación</SectionTitle>

                  <Field label="KM Actual" error={errors.current_odometer_km}>
                    <input type="number" min={0} className={inputCls(!!errors.current_odometer_km)} value={form.current_odometer_km} onChange={e => set('current_odometer_km', e.target.value)} placeholder="0" />
                  </Field>

                  <Field label="Próxima Mantención (km)" error={errors.next_maintenance_km}>
                    <input type="number" min={0} className={inputCls(!!errors.next_maintenance_km)} value={form.next_maintenance_km} onChange={e => set('next_maintenance_km', e.target.value)} placeholder="0" />
                  </Field>

                  <Field label="Rendimiento Estimado (km/L)" error={errors.estimated_fuel_efficiency_km_l}>
                    <input type="number" min={0} step="0.1" className={inputCls(!!errors.estimated_fuel_efficiency_km_l)} value={form.estimated_fuel_efficiency_km_l} onChange={e => set('estimated_fuel_efficiency_km_l', e.target.value)} placeholder="10.5" />
                  </Field>

                  <Field label="Base / Ubicación Principal">
                    <input className={inputCls()} value={form.base_location} onChange={e => set('base_location', e.target.value)} placeholder="Santiago Centro..." />
                  </Field>

                  {/* ── Combustible ── */}
                  <SectionTitle>Combustible</SectionTitle>

                  <Field label="Tipo de Combustible">
                    <select className={inputCls()} value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      <option value="diesel">Diésel</option>
                      <option value="gasoline">Gasolina</option>
                      <option value="electric">Eléctrico</option>
                      <option value="hybrid">Híbrido</option>
                    </select>
                  </Field>

                  <Field label="Capacidad Estanque (litros)" error={errors.tank_capacity_liters}>
                    <input type="number" min={0} className={inputCls(!!errors.tank_capacity_liters)} value={form.tank_capacity_liters} onChange={e => set('tank_capacity_liters', e.target.value)} placeholder="80" />
                  </Field>

                  {/* ── Documentación ── */}
                  <SectionTitle>Documentación</SectionTitle>

                  <Field label="Venc. Revisión Técnica">
                    <input type="date" className={inputCls()} value={form.technical_review_expires_at} onChange={e => set('technical_review_expires_at', e.target.value)} />
                  </Field>

                  <Field label="Venc. Permiso de Circulación">
                    <input type="date" className={inputCls()} value={form.circulation_permit_expires_at} onChange={e => set('circulation_permit_expires_at', e.target.value)} />
                  </Field>

                  <Field label="Venc. Seguro">
                    <input type="date" className={inputCls()} value={form.insurance_expires_at} onChange={e => set('insurance_expires_at', e.target.value)} />
                  </Field>

                  <Field label="Nº Póliza Seguro">
                    <input className={inputCls()} value={form.insurance_policy_number} onChange={e => set('insurance_policy_number', e.target.value)} placeholder="POL-2024-XXXX" />
                  </Field>

                  {/* ── Observaciones ── */}
                  <SectionTitle>Observaciones</SectionTitle>

                  <Field label="Notas Internas" span={2}>
                    <textarea
                      rows={3}
                      className={inputCls() + ' resize-none'}
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      placeholder="Observaciones internas del vehículo..."
                    />
                  </Field>

                </div>
              )}

              {/* ── Mantención en curso (shown only when vehicle.status = maintenance) ── */}
              {!loadingData && vehicle?.status === 'maintenance' && (
                <div className="mt-4 rounded-md border overflow-hidden" style={{ borderColor: '#755538' }}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ backgroundColor: '#3b3020', borderColor: '#755538' }}>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#fdba74] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                      </svg>
                      <p className="text-[12px] font-bold text-[#fdba74]">Mantención en curso</p>
                    </div>
                    {!showFinish && (
                      <button
                        type="button"
                        onClick={() => { setShowFinish(true); setSubmitError(null); setSaveSuccess(false) }}
                        disabled={finishing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50 transition-colors"
                        style={{ backgroundColor: '#fdba74' }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {openOrder ? 'Finalizar Mantención' : 'Marcar Disponible'}
                      </button>
                    )}
                  </div>

                  {/* Order summary or "no order found" */}
                  <div className="px-4 py-3" style={{ backgroundColor: '#3b3020' }}>
                    {openOrder ? (
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[#f1f5f9] leading-snug">
                              {openOrder.title ?? MAINTENANCE_TYPE_LABEL[openOrder.maintenance_type ?? ''] ?? 'Orden sin título'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {openOrder.maintenance_type && (
                                <span className="text-[10px] text-[#a8b8cc]">
                                  {MAINTENANCE_TYPE_LABEL[openOrder.maintenance_type] ?? openOrder.maintenance_type}
                                </span>
                              )}
                              {openOrder.priority && (
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                  style={PRIORITY_COLOR[openOrder.priority] ?? { text: '#a8b8cc', bg: '#203650' }}
                                >
                                  {PRIORITY_LABEL[openOrder.priority] ?? openOrder.priority}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-[#a8b8cc] flex-shrink-0">
                            {fmtDatetime(openOrder.started_at ?? openOrder.created_at)}
                          </p>
                        </div>
                        {openOrder.description && (
                          <p className="text-[11px] text-[#a8b8cc] leading-snug line-clamp-2 mt-1">
                            {openOrder.description.replace(/\n/g, ' ').slice(0, 120)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#a8b8cc]">
                        No se encontró una orden abierta para este vehículo. Se marcará como disponible directamente.
                      </p>
                    )}
                  </div>

                  {/* Finish form (shown when showFinish = true) */}
                  {showFinish && (
                    <div className="px-4 py-4 border-t space-y-3" style={{ borderColor: '#755538', backgroundColor: '#142942' }}>
                      <p className="text-[11px] font-semibold text-[#d5e0ed]">
                        {openOrder
                          ? 'Confirma que el vehículo salió de taller y queda disponible para nuevos servicios.'
                          : '¿Deseas marcar el vehículo como disponible?'}
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        {/* KM actual */}
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1">
                            KM Actual <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="number" min={0}
                            className={`w-full px-2.5 py-1.5 text-[12px] border rounded-md bg-[#142942] text-[#f1f5f9] focus:outline-none focus:ring-1 transition ${finishErrors.odometer_km ? 'border-[#794052] focus:ring-red-300' : 'border-[#2b405b] focus:ring-[#f1f5f9] focus:border-[#f1f5f9]'}`}
                            value={finishForm.odometer_km}
                            onChange={e => { setFinishForm(f => ({ ...f, odometer_km: e.target.value })); setFinishErrors(fe => ({ ...fe, odometer_km: undefined })) }}
                            placeholder={vehicle?.current_odometer_km != null ? String(vehicle.current_odometer_km) : '0'}
                          />
                          {finishErrors.odometer_km && <p className="text-[10px] text-rose-300 mt-0.5">{finishErrors.odometer_km}</p>}
                          {vehicle?.current_odometer_km != null && !finishErrors.odometer_km && (
                            <p className="text-[10px] text-[#a8b8cc] mt-0.5">Último: {vehicle.current_odometer_km.toLocaleString('es-CL')} km</p>
                          )}
                        </div>

                        {/* Costo final */}
                        {openOrder && (
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1">
                              Costo Final ($)
                            </label>
                            <input
                              type="number" min={0}
                              className={`w-full px-2.5 py-1.5 text-[12px] border rounded-md bg-[#142942] text-[#f1f5f9] focus:outline-none focus:ring-1 transition ${finishErrors.final_cost ? 'border-[#794052] focus:ring-red-300' : 'border-[#2b405b] focus:ring-[#f1f5f9] focus:border-[#f1f5f9]'}`}
                              value={finishForm.final_cost}
                              onChange={e => { setFinishForm(f => ({ ...f, final_cost: e.target.value })); setFinishErrors(fe => ({ ...fe, final_cost: undefined })) }}
                              placeholder="0"
                            />
                            {finishErrors.final_cost && <p className="text-[10px] text-rose-300 mt-0.5">{finishErrors.final_cost}</p>}
                          </div>
                        )}
                      </div>

                      {/* Observación final */}
                      {openOrder && (
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1">
                            Observación Final
                          </label>
                          <textarea
                            rows={2}
                            className="w-full px-2.5 py-1.5 text-[12px] border border-[#2b405b] rounded-md bg-[#142942] text-[#f1f5f9] placeholder-[#a8b8cc] focus:outline-none focus:ring-1 focus:ring-[#f1f5f9] focus:border-[#f1f5f9] transition resize-none"
                            value={finishForm.finish_notes}
                            onChange={e => setFinishForm(f => ({ ...f, finish_notes: e.target.value }))}
                            placeholder="Observaciones del cierre de taller..."
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { setShowFinish(false); setFinishErrors({}) }}
                          disabled={finishing}
                          className="px-3 py-1.5 text-[11px] font-semibold rounded border border-[#2b405b] text-[#a8b8cc] hover:bg-[#203650] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleFinishMaintenance}
                          disabled={finishing}
                          className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold rounded text-white transition-colors cursor-pointer disabled:opacity-50"
                          style={{ backgroundColor: finishing ? '#a8b8cc' : '#fdba74' }}
                        >
                          {finishing ? (
                            <>
                              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Finalizando...
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              {openOrder ? 'Confirmar Finalización' : 'Sí, marcar disponible'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Global error */}
              {submitError && (
                <div className="flex items-start gap-2.5 bg-[#3d2332] border border-[#794052] text-rose-200 rounded-md px-4 py-3 text-[12px] mt-4">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}

              {saveSuccess && !submitError && (
                <div className="flex items-center gap-2 bg-[#123b35] border border-[#28684e] text-emerald-200 rounded-md px-4 py-2.5 text-[12px] mt-4">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Cambios guardados correctamente.
                </div>
              )}

              {/* Deactivate confirmation inline panel */}
              {showDeactivate && !loadingData && (
                <div className="mt-4 rounded-md border border-[#794052] bg-[#3d2332] p-4">
                  <p className="text-[12px] font-semibold text-rose-200 mb-1">¿Confirmar desactivación?</p>
                  <p className="text-[12px] text-rose-300 mb-3">
                    Esta acción desactivará el vehículo del inventario. No se eliminará el historial.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeactivate(false)}
                      disabled={deactivating}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded border border-[#2b405b] text-[#a8b8cc] hover:bg-[#142942] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleDeactivate}
                      disabled={deactivating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deactivating ? (
                        <>
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Desactivando...
                        </>
                      ) : (
                        'Sí, desactivar vehículo'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div
              className="flex items-center justify-between px-6 py-4 border-t border-[#2b405b] flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              {/* Danger left */}
              <button
                type="button"
                onClick={() => { setShowDeactivate(v => !v); setSubmitError(null); setSaveSuccess(false) }}
                disabled={saving || deactivating || loadingData}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold border border-[#794052] text-rose-300 hover:bg-[#3d2332] transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {showDeactivate ? 'Cancelar desactivación' : 'Desactivar Vehículo'}
              </button>

              {/* Right actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving || deactivating}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold border border-[#2b405b] text-[#a8b8cc] hover:bg-[#2b405b] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || deactivating || loadingData}
                  className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-[#0d1d37] transition-opacity disabled:opacity-50 cursor-pointer"
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
                      Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
