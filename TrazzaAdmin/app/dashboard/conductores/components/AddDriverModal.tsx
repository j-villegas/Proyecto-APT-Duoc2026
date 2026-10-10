'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type Form = {
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

const EMPTY: Form = {
  full_name: '', rut: '', phone: '', email: '',
  driver_code: '', license_type: '', license_number: '',
  license_expires_at: '', status: '', notes: '',
}

type FieldErrors = Partial<Record<keyof Form, string>>

function validate(f: Form): FieldErrors {
  const e: FieldErrors = {}
  if (!f.full_name.trim())  e.full_name     = 'El nombre completo es obligatorio.'
  if (!f.rut.trim())        e.rut           = 'El RUT / DNI es obligatorio.'
  if (!f.license_type)      e.license_type  = 'Selecciona el tipo de licencia.'
  if (!f.status)            e.status        = 'Selecciona el estado inicial.'
  return e
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[12px] border border-line rounded-md bg-surface text-fg ' +
  'placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition'

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1'

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
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted whitespace-nowrap">{children}</p>
      <div className="flex-1 h-px bg-line" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddDriverModal() {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [form, setForm]               = useState<Form>(EMPTY)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
   
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
        full_name:    form.full_name.trim(),
        rut:          form.rut.trim(),
        license_type: form.license_type,
        status:       form.status,
      }

      if (form.driver_code.trim())      payload.driver_code         = form.driver_code.trim()
      if (form.phone.trim())            payload.phone               = form.phone.trim()
      if (form.email.trim())            payload.email               = form.email.trim()
      if (form.license_number.trim())   payload.license_number      = form.license_number.trim()
      if (form.license_expires_at)      payload.license_expires_at  = form.license_expires_at
      if (form.notes.trim())            payload.notes               = form.notes.trim()

      const { error: insertErr } = await supabase.from('drivers').insert(payload)
      if (insertErr) throw new Error(friendlyError(insertErr, 'No se pudo guardar'))

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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-canvas hover:opacity-90 transition-opacity cursor-pointer"
        style={{ backgroundColor: '#10b98b' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Añadir Conductor
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 720, maxHeight: '92vh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Registrar Conductor</h2>
                <p className="text-[11px] text-muted mt-0.5">Complete los datos del conductor para incorporarlo a la operación.</p>
              </div>
              <button aria-label="Cerrar" onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer mt-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {submitError && (
                  <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px]">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {submitError}
                  </div>
                )}

                {/* ── Datos Personales ── */}
                <SectionTitle>Datos Personales</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nombre Completo" required error={fieldErrors.full_name}>
                    <input type="text" placeholder="Juan Pérez González" value={form.full_name}
                      onChange={e => set('full_name', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="RUT / DNI" required error={fieldErrors.rut}>
                    <input type="text" placeholder="12.345.678-9" value={form.rut}
                      onChange={e => set('rut', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Teléfono">
                    <input type="tel" placeholder="+56 9 1234 5678" value={form.phone}
                      onChange={e => set('phone', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Correo Electrónico">
                    <input type="email" placeholder="conductor@empresa.cl" value={form.email}
                      onChange={e => set('email', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Código Interno">
                    <input type="text" placeholder="DRV-001" value={form.driver_code}
                      onChange={e => set('driver_code', e.target.value)} className={inputCls} />
                  </Field>
                </div>

                {/* ── Licencia ── */}
                <SectionTitle>Licencia de Conducir</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tipo de Licencia" required error={fieldErrors.license_type}>
                    <select value={form.license_type} onChange={e => set('license_type', e.target.value)} className={inputCls}>
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
                  <Field label="Número de Licencia">
                    <input type="text" placeholder="LIC-XXXXXXXX" value={form.license_number}
                      onChange={e => set('license_number', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Vencimiento Licencia">
                    <input type="date" value={form.license_expires_at}
                      onChange={e => set('license_expires_at', e.target.value)} className={inputCls} />
                  </Field>
                </div>

                {/* ── Estado ── */}
                <SectionTitle>Estado Operacional</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Estado Inicial" required error={fieldErrors.status}>
                    <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                      <option value="">— Seleccionar —</option>
                      <option value="available">Disponible</option>
                      <option value="rest">Descanso</option>
                      <option value="inactive">Inactivo</option>
                      <option value="suspended">Suspendido</option>
                    </select>
                  </Field>
                </div>

                {/* ── Observaciones ── */}
                <SectionTitle>Observaciones</SectionTitle>
                <textarea
                  rows={3}
                  placeholder="Notas adicionales sobre el conductor..."
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  className={inputCls + ' resize-none'}
                />

              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
                <button type="button" onClick={handleClose} disabled={loading}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors disabled:opacity-50 cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-canvas transition-opacity disabled:opacity-50 cursor-pointer"
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
                      Guardar Conductor
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
