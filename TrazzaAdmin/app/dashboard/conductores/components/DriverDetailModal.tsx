'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverData = {
  id: string
  full_name: string | null
  rut: string | null
  phone: string | null
  email: string | null
  driver_code: string | null
  license_type: string | null
  license_number: string | null
  license_expires_at: string | null
  status: string | null
  notes: string | null
  company_id: string | null
}

type FormState = {
  full_name: string
  rut: string
  phone: string
  email: string
  driver_code: string
  license_type: string
  license_number: string
  license_expires_at: string
  status: string
  notes: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  full_name: '', rut: '', phone: '', email: '', driver_code: '',
  license_type: '', license_number: '', license_expires_at: '',
  status: 'available', notes: '',
}

function toForm(d: DriverData): FormState {
  return {
    full_name:          d.full_name ?? '',
    rut:                d.rut ?? '',
    phone:              d.phone ?? '',
    email:              d.email ?? '',
    driver_code:        d.driver_code ?? '',
    license_type:       d.license_type ?? '',
    license_number:     d.license_number ?? '',
    license_expires_at: d.license_expires_at?.slice(0, 10) ?? '',
    status:             d.status ?? 'available',
    notes:              d.notes ?? '',
  }
}

const statusMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  available:  { label: 'Disponible', bg: '#123b35', text: '#55d9ad', dot: '#55d9ad' },
  in_service: { label: 'En ruta',    bg: '#3b3020', text: '#f8cb78', dot: '#f8cb78' },
  rest:       { label: 'Descanso',   bg: '#183352', text: '#7dbbff', dot: '#7dbbff' },
  inactive:   { label: 'Inactivo',   bg: '#203650', text: '#a8b8cc', dot: '#a8b8cc' },
  suspended:  { label: 'Suspendido', bg: '#3d2332', text: '#fda4af', dot: '#fda4af' },
}

function getStatusMeta(s: string | null) {
  return statusMeta[s ?? ''] ?? { label: s ?? '—', bg: '#203650', text: '#bac9db', dot: '#a8b8cc' }
}

function validateForm(f: FormState): FormErrors {
  const e: FormErrors = {}
  if (!f.full_name.trim())   e.full_name    = 'El nombre completo es obligatorio.'
  if (!f.rut.trim())         e.rut          = 'El RUT / DNI es obligatorio.'
  if (!f.license_type)       e.license_type = 'Selecciona el tipo de licencia.'
  if (!f.status)             e.status       = 'El estado es obligatorio.'
  if (f.email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
      e.email = 'El correo no tiene un formato válido.'
  }
  return e
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 flex items-center gap-2 pt-1 mb-0.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{children}</p>
      <div className="flex-1 h-px bg-raised" />
    </div>
  )
}

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

const inputCls = (hasErr?: boolean) =>
  `w-full px-2.5 py-1.5 text-[12px] border rounded-md bg-surface text-fg placeholder-muted
   focus:outline-none focus:ring-1 transition
   ${hasErr
     ? 'border-danger-line focus:ring-red-300 focus:border-danger-line'
     : 'border-line focus:ring-fg focus:border-fg'
   }`

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props { driverId: string }

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverDetailModal({ driverId }: Props) {
  const router = useRouter()

  const [open, setOpen]                     = useState(false)
  const [loadingData, setLoadingData]       = useState(false)
  const [driver, setDriver]                 = useState<DriverData | null>(null)
  const [activeService, setActiveService]   = useState<{ service_code: string | null } | null | undefined>(undefined)
  const [form, setForm]                     = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors]                 = useState<FormErrors>({})
  const [saving, setSaving]                 = useState(false)
  const [submitError, setSubmitError]       = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess]       = useState(false)
  const [showDeactivate, setShowDeactivate] = useState(false)
  const [deactivating, setDeactivating]     = useState(false)

  const loadDriver = useCallback(async () => {
    setLoadingData(true)
    setSubmitError(null)
    const supabase = createClient()

    const [dResult, sResult] = await Promise.all([
      supabase
        .from('drivers')
        .select('id, full_name, rut, phone, email, driver_code, license_type, license_number, license_expires_at, status, notes, company_id')
        .eq('id', driverId)
        .single(),

      supabase
        .from('services')
        .select('service_code')
        .eq('driver_id', driverId)
        .eq('status', 'in_progress')
        .limit(1)
        .maybeSingle(),
    ])

    if (dResult.data) {
      const d = dResult.data as DriverData
      setDriver(d)
      setForm(toForm(d))
    } else {
      setSubmitError('No se pudo cargar el conductor.')
    }
    setActiveService(sResult.data ?? null)
    setLoadingData(false)
  }, [driverId])


  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deactivating) handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving, deactivating])

  function handleClose() {
    if (saving || deactivating) return
    setOpen(false)
    setErrors({})
    setSubmitError(null)
    setSaveSuccess(false)
    setShowDeactivate(false)
    setDriver(null)
    setActiveService(undefined)
    setForm(EMPTY_FORM)
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

      const str = (v: string) => v.trim() === '' ? null : v.trim()

      const payload: Record<string, unknown> = {
        full_name:          form.full_name.trim(),
        rut:                form.rut.trim(),
        phone:              str(form.phone),
        email:              str(form.email),
        driver_code:        str(form.driver_code),
        license_type:       form.license_type,
        license_number:     str(form.license_number),
        license_expires_at: str(form.license_expires_at),
        status:             form.status,
        notes:              str(form.notes),
      }

      const { error: updErr } = await supabase
        .from('drivers')
        .update(payload)
        .eq('id', driverId)
        .eq('company_id', profile.company_id)
      if (updErr) throw new Error(friendlyError(updErr, 'No se pudo guardar'))

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
    // Re-check for active service before deactivating
    const supabase = createClient()
    const { data: activeSvc } = await supabase
      .from('services')
      .select('service_code')
      .eq('driver_id', driverId)
      .eq('status', 'in_progress')
      .limit(1)
      .maybeSingle()

    if (activeSvc) {
      setSubmitError('No se puede desactivar un conductor con servicio en curso.')
      setShowDeactivate(false)
      return
    }

    setDeactivating(true)
    setSubmitError(null)

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const { error: updErr } = await supabase
        .from('drivers')
        .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
        .eq('id', driverId)
        .eq('company_id', profile.company_id)
      if (updErr) throw new Error(friendlyError(updErr, 'No se pudo desactivar'))

      handleClose()
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
      setShowDeactivate(false)
    } finally {
      setDeactivating(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const sm = getStatusMeta(form.status || driver?.status || null)

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(true); loadDriver() }}
        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-line text-soft hover:bg-sunken transition-colors cursor-pointer whitespace-nowrap"
      >
        Ver detalle
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.52)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget && !saving && !deactivating) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 780, maxHeight: '94vh' }}
          >
            {/* ── Header ── */}
            <div
              className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#a8b8cc15' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#f1f5f9" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>
                    Detalle del Conductor
                  </h2>
                  {driver && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-muted">
                        {driver.full_name ?? '—'}
                        {driver.driver_code ? ` · ${driver.driver_code}` : ''}
                      </p>
                      {!loadingData && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ backgroundColor: sm.bg, color: sm.text }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sm.dot }} />
                          {sm.label}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                disabled={saving || deactivating}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Servicio activo banner ── */}
            {!loadingData && activeService !== undefined && (
              <div
                className="flex items-center gap-2.5 px-6 py-2.5 border-b border-line flex-shrink-0"
                style={{ backgroundColor: activeService ? '#3b3020' : '#10223d' }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: activeService ? '#f8cb78' : '#a8b8cc' }}
                />
                <p className="text-[11px]" style={{ color: activeService ? '#f8cb78' : '#a8b8cc' }}>
                  {activeService
                    ? `Servicio en curso: ${activeService.service_code ?? 'En progreso'}`
                    : 'Sin servicio en curso'}
                </p>
              </div>
            )}

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loadingData ? (
                <div className="flex items-center justify-center py-16 gap-3 text-muted">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-[13px]">Cargando datos del conductor...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">

                  {/* ── Datos Personales ── */}
                  <SectionTitle>Datos Personales</SectionTitle>

                  <Field label="Nombre Completo" error={errors.full_name} required span={2}>
                    <input
                      className={inputCls(!!errors.full_name)}
                      value={form.full_name}
                      onChange={e => set('full_name', e.target.value)}
                      placeholder="Juan Pérez González"
                    />
                  </Field>

                  <Field label="RUT / DNI" error={errors.rut} required>
                    <input
                      className={inputCls(!!errors.rut)}
                      value={form.rut}
                      onChange={e => set('rut', e.target.value)}
                      placeholder="12.345.678-9"
                    />
                  </Field>

                  <Field label="Código Interno" error={errors.driver_code}>
                    <input
                      className={inputCls(!!errors.driver_code)}
                      value={form.driver_code}
                      onChange={e => set('driver_code', e.target.value)}
                      placeholder="DRV-001"
                    />
                  </Field>

                  <Field label="Teléfono" error={errors.phone}>
                    <input
                      className={inputCls(!!errors.phone)}
                      value={form.phone}
                      onChange={e => set('phone', e.target.value)}
                      placeholder="+56 9 1234 5678"
                    />
                  </Field>

                  <Field label="Correo Electrónico" error={errors.email}>
                    <input
                      type="email"
                      className={inputCls(!!errors.email)}
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder="conductor@empresa.cl"
                    />
                  </Field>

                  {/* ── Licencia de Conducir ── */}
                  <SectionTitle>Licencia de Conducir</SectionTitle>

                  <Field label="Tipo de Licencia" error={errors.license_type} required>
                    <select
                      className={inputCls(!!errors.license_type)}
                      value={form.license_type}
                      onChange={e => set('license_type', e.target.value)}
                    >
                      <option value="">— Seleccionar —</option>
                      <option value="A1">A1</option>
                      <option value="A2">A2</option>
                      <option value="A3">A3</option>
                      <option value="A4">A4</option>
                      <option value="A5">A5</option>
                      <option value="B">B</option>
                      <option value="other">Otro</option>
                    </select>
                  </Field>

                  <Field label="Número de Licencia" error={errors.license_number}>
                    <input
                      className={inputCls(!!errors.license_number)}
                      value={form.license_number}
                      onChange={e => set('license_number', e.target.value)}
                      placeholder="LIC-123456"
                    />
                  </Field>

                  <Field label="Vencimiento de Licencia" error={errors.license_expires_at}>
                    <input
                      type="date"
                      className={inputCls(!!errors.license_expires_at)}
                      value={form.license_expires_at}
                      onChange={e => set('license_expires_at', e.target.value)}
                    />
                  </Field>

                  {/* ── Estado Operacional ── */}
                  <SectionTitle>Estado Operacional</SectionTitle>

                  <Field label="Estado" error={errors.status} required>
                    <select
                      className={inputCls(!!errors.status)}
                      value={form.status}
                      onChange={e => set('status', e.target.value)}
                    >
                      <option value="">— Seleccionar —</option>
                      <option value="available">Disponible</option>
                      <option value="in_service">En Ruta</option>
                      <option value="rest">Descanso</option>
                      <option value="inactive">Inactivo</option>
                      <option value="suspended">Suspendido</option>
                    </select>
                  </Field>

                  {/* ── Observaciones ── */}
                  <SectionTitle>Observaciones</SectionTitle>

                  <Field label="Notas internas" span={2}>
                    <textarea
                      rows={3}
                      className={inputCls() + ' resize-none'}
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      placeholder="Observaciones internas del conductor..."
                    />
                  </Field>

                </div>
              )}

              {/* Global error */}
              {submitError && (
                <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px] mt-4">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {submitError}
                </div>
              )}

              {saveSuccess && !submitError && (
                <div className="flex items-center gap-2 bg-success-bg border border-[#28684e] text-emerald-200 rounded-md px-4 py-2.5 text-[12px] mt-4">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Cambios guardados correctamente.
                </div>
              )}

              {/* Deactivate confirmation inline panel */}
              {showDeactivate && !loadingData && (
                <div className="mt-4 rounded-md border border-danger-line bg-danger-bg p-4">
                  <p className="text-[12px] font-semibold text-rose-200 mb-1">¿Confirmar desactivación?</p>
                  <p className="text-[12px] text-rose-300 mb-3">
                    Esta acción desactivará el conductor del directorio. No se eliminará su historial.
                  </p>
                  {activeService && (
                    <p className="text-[11px] font-semibold text-rose-200 mb-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Conductor con servicio en curso — no se puede desactivar.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeactivate(false)}
                      disabled={deactivating}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded border border-line text-muted hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleDeactivate}
                      disabled={deactivating || !!activeService}
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
                        'Sí, desactivar conductor'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div
              className="flex items-center justify-between px-6 py-4 border-t border-line flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              {/* Danger left */}
              <button
                type="button"
                onClick={() => { setShowDeactivate(v => !v); setSubmitError(null); setSaveSuccess(false) }}
                disabled={saving || deactivating || loadingData}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold border border-danger-line text-rose-300 hover:bg-danger-bg transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {showDeactivate ? 'Cancelar desactivación' : 'Desactivar Conductor'}
              </button>

              {/* Right actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving || deactivating}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || deactivating || loadingData}
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
