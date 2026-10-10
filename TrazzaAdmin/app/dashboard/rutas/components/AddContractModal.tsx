'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError, friendlyReason } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type Form = {
  client_name: string
  contract_name: string
  start_date: string
  end_date: string
}

const EMPTY: Form = {
  client_name: '', contract_name: '', start_date: '', end_date: '',
}

type FieldErrors = Partial<Record<keyof Form, string>>

function validate(f: Form): FieldErrors {
  const e: FieldErrors = {}
  if (!f.client_name.trim())    e.client_name    = 'El cliente es obligatorio.'
  if (!f.contract_name.trim())  e.contract_name  = 'El nombre del contrato es obligatorio.'
  if (f.start_date && f.end_date && f.end_date < f.start_date) {
    e.end_date = 'La fecha de término no puede ser anterior a la fecha de inicio.'
  }
  return e
}

// ─── Passenger roster ─────────────────────────────────────────────────────────

type PassengerEntry = {
  localId: string
  full_name: string
  rut: string
  phone: string
}

const EMPTY_PASSENGER = (): PassengerEntry => ({
  localId: crypto.randomUUID(), full_name: '', rut: '', phone: '',
})

type PassengerErrors = Partial<Record<'full_name' | 'rut', string>>

function validatePassengers(rows: PassengerEntry[]): Map<string, PassengerErrors> {
  const errors = new Map<string, PassengerErrors>()
  for (const row of rows) {
    const touched = row.full_name.trim() || row.rut.trim() || row.phone.trim()
    if (!touched) continue
    const e: PassengerErrors = {}
    if (!row.full_name.trim()) e.full_name = 'Nombre requerido.'
    if (!row.rut.trim())       e.rut       = 'RUT requerido.'
    if (Object.keys(e).length > 0) errors.set(row.localId, e)
  }
  return errors
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddContractModal() {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [form, setForm]               = useState<Form>(EMPTY)
  const [passengers, setPassengers]   = useState<PassengerEntry[]>([])
  const [passengerErrors, setPassengerErrors] = useState<Map<string, PassengerErrors>>(new Map())

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
    setPassengers([])
    setPassengerErrors(new Map())
  }

  function set<K extends keyof Form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key in fieldErrors) setFieldErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function addPassenger() {
    setPassengers(prev => [...prev, EMPTY_PASSENGER()])
  }

  function updatePassenger(localId: string, key: keyof Omit<PassengerEntry, 'localId'>, value: string) {
    setPassengers(prev => prev.map(p => p.localId === localId ? { ...p, [key]: value } : p))
    setPassengerErrors(prev => {
      if (!prev.has(localId)) return prev
      const next = new Map(prev)
      next.delete(localId)
      return next
    })
  }

  function removePassenger(localId: string) {
    setPassengers(prev => prev.filter(p => p.localId !== localId))
    setPassengerErrors(prev => {
      if (!prev.has(localId)) return prev
      const next = new Map(prev)
      next.delete(localId)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validate(form)
    const pErrors = validatePassengers(passengers)
    if (Object.keys(errors).length > 0 || pErrors.size > 0) {
      setFieldErrors(errors)
      setPassengerErrors(pErrors)
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
      if (profileErr || !profile?.company_id) throw new Error('Perfil de usuario no encontrado.')
      const companyId = profile.company_id

      const payload: Record<string, unknown> = {
        company_id:    companyId,
        client_name:   form.client_name.trim(),
        contract_name: form.contract_name.trim(),
        priority:      'normal',
        status:        'active',
      }
      if (form.start_date) payload.start_date = form.start_date
      if (form.end_date)   payload.end_date   = form.end_date

      const { data: contractData, error: insertErr } = await supabase
        .from('contracts').insert(payload).select('id').single()
      if (insertErr || !contractData) throw new Error(friendlyError(insertErr, 'No se pudo guardar'))

      const contractId = contractData.id
      const passengerRows = passengers.filter(p => p.full_name.trim() && p.rut.trim())

      for (const row of passengerRows) {
        const rut = row.rut.trim()

        const { data: existing } = await supabase
          .from('passengers')
          .select('id, phone')
          .eq('company_id', companyId)
          .eq('rut', rut)
          .maybeSingle()

        let passengerId: string

        if (existing) {
          passengerId = existing.id
          if (!existing.phone && row.phone.trim()) {
            await supabase.from('passengers').update({ phone: row.phone.trim() }).eq('id', passengerId)
          }
        } else {
          const insertPayload: Record<string, unknown> = {
            company_id: companyId,
            full_name:  row.full_name.trim(),
            rut,
            status:     'active',
          }
          if (row.phone.trim()) insertPayload.phone = row.phone.trim()

          const { data: newP, error: newPErr } = await supabase
            .from('passengers').insert(insertPayload).select('id').single()
          if (newPErr || !newP) {
            throw new Error(`El contrato se creó, pero no se pudo registrar a ${row.full_name.trim()}. ${friendlyReason(newPErr)}`)
          }
          passengerId = newP.id
        }

        const { error: cpErr } = await supabase
          .from('contract_passengers')
          .insert({ company_id: companyId, contract_id: contractId, passenger_id: passengerId })
        if (cpErr && cpErr.code !== '23505') {
          throw new Error(`El contrato se creó, pero no se pudo asociar a ${row.full_name.trim()}. ${friendlyReason(cpErr)}`)
        }
      }

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
      {/* Small "+" button shown in section card header */}
      <button
        onClick={() => setOpen(true)}
        title="Añadir Contrato"
        className="w-6 h-6 flex items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent hover:bg-warn-bg transition-colors cursor-pointer flex-shrink-0"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 640, maxHeight: '92vh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Añadir Contrato</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Registra un contrato operativo y sus pasajeros para asociarlo a rutas y servicios.
                </p>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer mt-0.5"
              >
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label="Cliente" required error={fieldErrors.client_name}>
                      <input type="text" placeholder="Empresa cliente" value={form.client_name}
                        onChange={e => set('client_name', e.target.value)} className={inputCls} />
                    </Field>
                  </div>

                  <div className="col-span-2">
                    <Field label="Nombre del Contrato" required error={fieldErrors.contract_name}>
                      <input type="text" placeholder="Contrato Traslado Regular 2024" value={form.contract_name}
                        onChange={e => set('contract_name', e.target.value)} className={inputCls} />
                    </Field>
                  </div>

                  <Field label="Fecha Inicio">
                    <input type="date" value={form.start_date}
                      onChange={e => set('start_date', e.target.value)} className={inputCls} />
                  </Field>

                  <Field label="Fecha Término" error={fieldErrors.end_date}>
                    <input type="date" value={form.end_date}
                      onChange={e => set('end_date', e.target.value)} className={inputCls} />
                  </Field>
                </div>

                {/* Pasajeros */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={labelCls}>Pasajeros</span>
                    <button
                      type="button"
                      onClick={addPassenger}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors cursor-pointer"
                      style={{ color: '#10b98b', borderColor: '#10b98b' }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Añadir Pasajero
                    </button>
                  </div>

                  {passengers.length === 0 ? (
                    <div
                      className="border border-dashed border-line rounded-md px-4 py-3 text-center"
                      style={{ backgroundColor: '#10223d' }}
                    >
                      <p className="text-[11px] text-muted">
                        Sin pasajeros registrados. La dirección de cada uno se define al crear la ruta.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {passengers.map((p, idx) => {
                        const pErr = passengerErrors.get(p.localId)
                        return (
                          <div key={p.localId} className="flex items-start gap-2">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-1.5"
                              style={{ backgroundColor: '#a8b8cc' }}
                            >
                              {idx + 1}
                            </span>
                            <div className="flex-1 grid grid-cols-3 gap-2">
                              <Field label="Nombre Completo" error={pErr?.full_name}>
                                <input type="text" placeholder="Juan Pérez" value={p.full_name}
                                  onChange={e => updatePassenger(p.localId, 'full_name', e.target.value)}
                                  className={inputCls} />
                              </Field>
                              <Field label="RUT" error={pErr?.rut}>
                                <input type="text" placeholder="12.345.678-9" value={p.rut}
                                  onChange={e => updatePassenger(p.localId, 'rut', e.target.value)}
                                  className={inputCls} />
                              </Field>
                              <Field label="Teléfono">
                                <input type="tel" placeholder="+56 9 1234 5678" value={p.phone}
                                  onChange={e => updatePassenger(p.localId, 'phone', e.target.value)}
                                  className={inputCls} />
                              </Field>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePassenger(p.localId)}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-rose-300 hover:bg-danger-bg transition-colors flex-shrink-0 cursor-pointer mt-1"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

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
                      Guardar Contrato
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
