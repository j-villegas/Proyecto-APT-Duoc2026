'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type PassengerRow = {
  id: string
  passenger_id: string
  service_stop_id: string | null
  attendance_status: string | null
  passengers: { id: string; full_name: string | null; rut: string | null } | null
  service_stops: { id: string; name: string | null; stop_order: number | null } | null
  access_code: string | null
}

type StopOption = {
  id: string
  stop_order: number
  stop_type: string | null
  name: string | null
}

type AddForm = {
  full_name: string
  rut: string
  phone: string
  email: string
  service_stop_id: string
}

const EMPTY_ADD: AddForm = {
  full_name: '', rut: '', phone: '', email: '',
  service_stop_id: '',
}

type FieldErrors = Partial<Record<keyof AddForm, string>>

function validateAdd(f: AddForm): FieldErrors {
  const e: FieldErrors = {}
  if (!f.full_name.trim())     e.full_name        = 'El nombre es obligatorio.'
  if (!f.rut.trim())           e.rut              = 'El RUT / DNI es obligatorio.'
  if (!f.service_stop_id)      e.service_stop_id  = 'Selecciona la parada de subida.'
  return e
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const attendanceLabel: Record<string, { label: string; bg: string; text: string }> = {
  pending:      { label: 'Pendiente',    bg: '#203650', text: '#a8b8cc' },
  boarded:      { label: 'Subió',        bg: '#123b35', text: '#55d9ad' },
  no_show:      { label: 'No subió',     bg: '#3d2332', text: '#fda4af' },
  cancelled:    { label: 'Cancelado',    bg: '#3d2332', text: '#fda4af' },
  not_required: { label: 'No requerido', bg: '#203650', text: '#a8b8cc' },
}

function getAttendance(status: string | null) {
  return attendanceLabel[status ?? ''] ?? { label: status ?? '—', bg: '#203650', text: '#a8b8cc' }
}

function resolveOne<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

async function generateUniqueCode(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = ''
    for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)]
    const { data } = await supabase
      .from('passenger_service_access')
      .select('id')
      .eq('company_id', companyId)
      .eq('access_code', code)
      .maybeSingle()
    if (!data) return code
  }
  throw new Error('No se pudo generar un código de acceso único. Inténtalo de nuevo.')
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

type TriggerVariant = 'primary' | 'action'
type Mode = 'editable' | 'readonly'

interface Props {
  serviceId: string
  serviceCode: string | null
  plate: string | null
  capacity: number | null
  triggerVariant?: TriggerVariant
  mode?: Mode
}

export default function PassengersModal({
  serviceId,
  serviceCode,
  plate,
  capacity,
  triggerVariant = 'primary',
  mode = 'editable',
}: Props) {
  const isReadonly = mode === 'readonly'
  const router = useRouter()

  const [open, setOpen]           = useState(false)
  const [rows, setRows]           = useState<PassengerRow[]>([])
  const [stops, setStops]         = useState<StopOption[]>([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [form, setForm]           = useState<AddForm>(EMPTY_ADD)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [addLoading, setAddLoading]   = useState(false)
  const [addError, setAddError]       = useState<string | null>(null)
  const [copiedId, setCopiedId]       = useState<string | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [spResult, psaResult, stopsResult] = await Promise.all([
      supabase
        .from('service_passengers')
        .select(`
          id, passenger_id, service_stop_id, attendance_status,
          passengers ( id, full_name, rut ),
          service_stops ( id, name, stop_order )
        `)
        .eq('service_id', serviceId)
        .order('created_at', { ascending: true }),

      supabase
        .from('passenger_service_access')
        .select('service_passenger_id, access_code')
        .eq('service_id', serviceId)
        .eq('status', 'active'),

      supabase
        .from('service_stops')
        .select('id, stop_order, stop_type, name')
        .eq('service_id', serviceId)
        .in('stop_type', ['origin', 'pickup'])
        .order('stop_order', { ascending: true }),
    ])

    const accessMap = new Map<string, string>()
    for (const psa of psaResult.data ?? []) {
      if (psa.service_passenger_id && psa.access_code) {
        accessMap.set(psa.service_passenger_id, psa.access_code)
      }
    }

    const enriched: PassengerRow[] = (spResult.data ?? []).map(row => ({
      id:                row.id,
      passenger_id:      row.passenger_id,
      service_stop_id:   row.service_stop_id,
      attendance_status: row.attendance_status,
      passengers:        resolveOne(row.passengers as unknown as PassengerRow['passengers']),
      service_stops:     resolveOne(row.service_stops as unknown as PassengerRow['service_stops']),
      access_code:       accessMap.get(row.id) ?? null,
    }))

    setRows(enriched)
    setStops((stopsResult.data ?? []) as StopOption[])
    setLoading(false)
  }, [serviceId])


  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showAdd) handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
   
  }, [open, showAdd])

  function handleClose() {
    setOpen(false)
    setSearch('')
    setShowAdd(false)
    setForm(EMPTY_ADD)
    setFieldErrors({})
    setAddError(null)
  }

  function setF<K extends keyof AddForm>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key in fieldErrors) setFieldErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function cancelAdd() {
    setShowAdd(false)
    setForm(EMPTY_ADD)
    setFieldErrors({})
    setAddError(null)
  }

  async function handleCopy(code: string, rowId: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(rowId)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      // clipboard not available
    }
  }

  // ── Add passenger ──────────────────────────────────────────────────────────

  async function handleAddPassenger(e: React.FormEvent) {
    e.preventDefault()
    const errors = validateAdd(form)
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }

    setAddLoading(true)
    setAddError(null)
    const supabase = createClient()

    try {
      // 1. Auth
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      // 2. Profile → company_id
      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')
      const companyId = profile.company_id

      // 3. Find or create passenger by RUT + company_id
      const { data: existing } = await supabase
        .from('passengers')
        .select('id, phone, email')
        .eq('company_id', companyId)
        .eq('rut', form.rut.trim())
        .maybeSingle()

      let passengerId: string

      if (existing) {
        passengerId = existing.id
        // Update phone/email if they were missing and user provided them
        const updates: Record<string, string> = {}
        if (!existing.phone && form.phone.trim())  updates.phone = form.phone.trim()
        if (!existing.email && form.email.trim())  updates.email = form.email.trim()
        if (Object.keys(updates).length > 0) {
          await supabase.from('passengers').update(updates).eq('id', passengerId)
        }
      } else {
        const insertPayload: Record<string, unknown> = {
          company_id: companyId,
          full_name:  form.full_name.trim(),
          rut:        form.rut.trim(),
          status:     'active',
        }
        if (form.phone.trim())  insertPayload.phone = form.phone.trim()
        if (form.email.trim())  insertPayload.email = form.email.trim()

        const { data: newP, error: newPErr } = await supabase
          .from('passengers').insert(insertPayload).select('id').single()
        if (newPErr || !newP) throw new Error(friendlyError(newPErr, 'No se pudo crear pasajero'))
        passengerId = newP.id
      }

      // 4. Check if already assigned to this service
      const { data: alreadyAssigned } = await supabase
        .from('service_passengers')
        .select('id')
        .eq('service_id', serviceId)
        .eq('passenger_id', passengerId)
        .maybeSingle()
      if (alreadyAssigned) throw new Error('Este pasajero ya está asignado a esta ruta.')

      // 5. Insert service_passengers
      const spPayload: Record<string, unknown> = {
        company_id:        companyId,
        service_id:        serviceId,
        passenger_id:      passengerId,
        service_stop_id:   form.service_stop_id,
        attendance_status: 'pending',
      }

      const { data: spData, error: spErr } = await supabase
        .from('service_passengers').insert(spPayload).select('id').single()
      if (spErr || !spData) {
        if (spErr?.code === '23505') {
          throw new Error('Este pasajero ya está asignado a esta ruta.')
        }
        throw new Error(friendlyError(spErr, 'No se pudo asignar el pasajero'))
      }

      // 6. Generate unique access code
      const accessCode = await generateUniqueCode(supabase, companyId)

      // 7. Insert passenger_service_access
      const { error: psaErr } = await supabase
        .from('passenger_service_access')
        .insert({
          company_id:           companyId,
          service_id:           serviceId,
          passenger_id:         passengerId,
          service_passenger_id: spData.id,
          access_code:          accessCode,
          status:               'active',
        })
      if (psaErr) throw new Error(friendlyError(psaErr, 'No se pudo generar código de acceso'))

      // 8. Done
      setForm(EMPTY_ADD)
      setShowAdd(false)
      setFieldErrors({})
      await loadData()
      router.refresh()

    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setAddLoading(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredRows = rows.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const p = r.passengers
    return (
      (p?.full_name ?? '').toLowerCase().includes(q) ||
      (p?.rut ?? '').toLowerCase().includes(q)
    )
  })

  const titleCode  = serviceCode ?? `#${serviceId.slice(0, 8).toUpperCase()}`
  const modalTitle = `Pasajeros de la Ruta`
  const modalSub   = isReadonly
    ? `Vista operativa de pasajeros en ruta · ${titleCode}${plate ? ` · ${plate}` : ''}`
    : `Ruta ${titleCode}${plate ? ` · Vehículo ${plate}` : ''}`

  // ── Trigger ────────────────────────────────────────────────────────────────

  const trigger =
    triggerVariant === 'action' ? (
      <button
        onClick={() => { setOpen(true); loadData() }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-line text-[12px] font-medium text-soft hover:bg-sunken transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 text-fg flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
        <span className="flex-1">Pasajeros</span>
      </button>
    ) : (
      <button
        onClick={() => { setOpen(true); loadData() }}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-line text-[12px] font-semibold text-fg hover:bg-[#1b3552] transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
        {isReadonly ? 'Ver Pasajeros' : 'Gestionar Pasajeros'}
        {capacity != null && (
          <span className="text-[10px] text-muted font-normal ml-1">
            {rows.length} / {capacity}
          </span>
        )}
      </button>
    )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.50)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 920, maxHeight: '92vh' }}
          >

            {/* ── Modal header ── */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>{modalTitle}</h2>
                <p className="text-[11px] text-muted mt-0.5">{modalSub}</p>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer mt-0.5 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Toolbar ── */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-line flex-shrink-0">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar pasajero..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-line rounded-md bg-surface placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition"
                />
              </div>
              <span className="text-[11px] text-muted whitespace-nowrap flex-shrink-0">
                {filteredRows.length} pasajero{filteredRows.length !== 1 ? 's' : ''}
                {capacity != null && ` · Cap. ${capacity}`}
              </span>
              {!isReadonly && (
                <button
                  onClick={() => { setShowAdd(true); setAddError(null) }}
                  disabled={showAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex-shrink-0"
                  style={{ backgroundColor: '#10b98b' }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Añadir Pasajero
                </button>
              )}
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">

              {/* Add form — only in editable mode */}
              {!isReadonly && showAdd && (
                <div className="px-6 py-4 border-b border-line" style={{ backgroundColor: '#3b3020' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-1 h-4 rounded-full" style={{ backgroundColor: '#10b98b' }} />
                    <h4 className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#f1f5f9' }}>
                      Nuevo Pasajero
                    </h4>
                  </div>

                  {addError && (
                    <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px] mb-4">
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {addError}
                    </div>
                  )}

                  <form onSubmit={handleAddPassenger}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <Field label="Nombre Completo" required error={fieldErrors.full_name}>
                        <input type="text" placeholder="Juan Pérez" value={form.full_name}
                          onChange={e => setF('full_name', e.target.value)} className={inputCls} />
                      </Field>
                      <Field label="RUT / DNI" required error={fieldErrors.rut}>
                        <input type="text" placeholder="12.345.678-9" value={form.rut}
                          onChange={e => setF('rut', e.target.value)} className={inputCls} />
                      </Field>
                      <Field label="Teléfono">
                        <input type="tel" placeholder="+56 9 1234 5678" value={form.phone}
                          onChange={e => setF('phone', e.target.value)} className={inputCls} />
                      </Field>
                      <Field label="Correo">
                        <input type="email" placeholder="pasajero@mail.com" value={form.email}
                          onChange={e => setF('email', e.target.value)} className={inputCls} />
                      </Field>
                      <div className="col-span-2">
                        <Field label="Parada de Subida" required error={fieldErrors.service_stop_id}>
                          <select value={form.service_stop_id}
                            onChange={e => setF('service_stop_id', e.target.value)} className={inputCls}>
                            <option value="">— Seleccionar parada —</option>
                            {stops.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.stop_order}. {s.name ?? 'Parada sin nombre'}
                                {s.stop_type === 'origin' ? ' (Origen)' : ''}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <button type="button" onClick={cancelAdd} disabled={addLoading}
                        className="px-4 py-1.5 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors disabled:opacity-50 cursor-pointer">
                        Cancelar
                      </button>
                      <button type="submit" disabled={addLoading}
                        className="flex items-center gap-2 px-5 py-1.5 rounded-md text-[12px] font-semibold text-canvas disabled:opacity-50 cursor-pointer"
                        style={{ backgroundColor: '#10b98b' }}>
                        {addLoading ? (
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
                            Guardar Pasajero
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Passenger list */}
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-[12px] text-muted">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Cargando pasajeros...
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-raised flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-medium text-muted">
                    {search ? 'Sin resultados para la búsqueda.' : 'No hay pasajeros asignados a esta ruta.'}
                  </p>
                  {!search && (
                    <p className="text-[11px] text-muted mt-1">
                      Haz clic en &quot;+ Añadir Pasajero&quot; para agregar el primero.
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: '#10223d' }} className="border-b border-raised">
                        {['Pasajero', 'RUT', 'Parada', 'Estado', 'Código Acceso', 'Acciones'].map(col => (
                          <th key={col} className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2.5 text-muted whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(row => {
                        const p  = row.passengers
                        const ss = row.service_stops
                        const at = getAttendance(row.attendance_status)
                        return (
                          <tr key={row.id} className="border-b border-raised hover:bg-sunken transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-[12px] font-semibold" style={{ color: '#f1f5f9' }}>
                                {p?.full_name ?? '—'}
                              </p>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-[12px] text-muted">{p?.rut ?? '—'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[12px] text-soft">
                                {ss ? `${ss.stop_order}. ${ss.name ?? '—'}` : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
                                style={{ backgroundColor: at.bg, color: at.text }}
                              >
                                {at.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {row.access_code ? (
                                <span
                                  className="font-mono text-[13px] font-bold tracking-widest px-2 py-0.5 rounded"
                                  style={{ backgroundColor: '#123b35', color: '#55d9ad' }}
                                >
                                  {row.access_code}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted italic">Sin código</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {row.access_code && (
                                <button
                                  onClick={() => handleCopy(row.access_code!, row.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-line text-[11px] font-semibold text-muted hover:border-fg hover:text-fg transition-colors cursor-pointer"
                                >
                                  {copiedId === row.id ? (
                                    <>
                                      <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                      <span className="text-emerald-300">Copiado</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                      </svg>
                                      Copiar
                                    </>
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <p className="text-[11px] text-muted">
                {rows.length} pasajero{rows.length !== 1 ? 's' : ''} en esta ruta
                {capacity != null ? ` · Capacidad ${capacity}` : ''}
              </p>
              <button
                onClick={handleClose}
                className="px-4 py-1.5 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
