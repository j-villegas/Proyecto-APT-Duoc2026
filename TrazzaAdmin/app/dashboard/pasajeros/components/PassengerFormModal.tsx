'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// Alta y edición de pasajeros. El correo habilita su acceso a la app móvil:
// cuando existe (o se crea) un usuario de Auth con ese correo, el trigger de
// la migración 025 los vincula solo. Los contratos marcados definen en qué
// rutas aparece al crear un viaje (Rutas → Nueva ruta usa el roster del contrato).

export type ContractOption = { id: string; label: string }

export type PassengerData = {
  id: string
  full_name: string
  rut: string
  phone: string | null
  email: string | null
  status: string
  notes: string | null
  contractIds: string[]
}

type Props = {
  contracts: ContractOption[]
  passenger?: PassengerData
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputCls =
  'w-full px-3 py-2 text-[12px] border border-line rounded-md bg-surface text-fg ' +
  'placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition'
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1'

export default function PassengerFormModal({ contracts, passenger }: Props) {
  const router = useRouter()
  const editing = !!passenger
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => initial(passenger))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving])

  function openModal() {
    setForm(initial(passenger))
    setErrors({})
    setSubmitError(null)
    setOpen(true)
  }

  const set = (key: keyof ReturnType<typeof initial>, value: string) => setForm(f => ({ ...f, [key]: value }))
  const toggleContract = (id: string) =>
    setForm(f => ({ ...f, contractIds: f.contractIds.includes(id) ? f.contractIds.filter(c => c !== id) : [...f.contractIds, id] }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.full_name.trim()) errs.full_name = 'El nombre es obligatorio.'
    if (!form.rut.trim()) errs.rut = 'El RUT es obligatorio.'
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errs.email = 'Correo inválido.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    setSubmitError(null)
    const supabase = createClient()
    try {
      const payload = {
        full_name: form.full_name.trim(),
        rut: form.rut.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      }

      let passengerId = passenger?.id
      let companyId: string
      if (editing) {
        const { data, error } = await supabase.from('passengers').update(payload).eq('id', passengerId!)
          .select('company_id').single()
        if (error || !data) throw new Error(friendlyError(error, 'No se pudo guardar el pasajero'))
        companyId = data.company_id
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user?.id ?? '').single()
        if (!profile?.company_id) throw new Error('Perfil de usuario no encontrado.')
        companyId = profile.company_id
        const { data, error } = await supabase.from('passengers').insert({ ...payload, company_id: companyId })
          .select('id').single()
        if (error || !data) throw new Error(friendlyError(error, 'No se pudo guardar el pasajero'))
        passengerId = data.id
      }

      // Contratos: alta (o reactivación) de los marcados y baja lógica del resto.
      const { data: current } = await supabase.from('contract_passengers')
        .select('id, contract_id, deleted_at').eq('passenger_id', passengerId!)
      const rows = current ?? []
      for (const contractId of form.contractIds) {
        const existing = rows.find(r => r.contract_id === contractId)
        if (!existing) {
          const { error } = await supabase.from('contract_passengers')
            .insert({ company_id: companyId, contract_id: contractId, passenger_id: passengerId })
          if (error) throw new Error(friendlyError(error, 'El pasajero se guardó, pero no se pudo asociar al contrato'))
        } else if (existing.deleted_at) {
          await supabase.from('contract_passengers').update({ deleted_at: null }).eq('id', existing.id)
        }
      }
      const removed = rows.filter(r => !r.deleted_at && !form.contractIds.includes(r.contract_id))
      for (const r of removed) {
        await supabase.from('contract_passengers').update({ deleted_at: new Date().toISOString() }).eq('id', r.id)
      }

      setOpen(false)
      router.refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {editing ? (
        <button onClick={openModal} className="px-2.5 py-1 rounded-md border border-line text-[11px] text-muted hover:text-fg hover:bg-sunken">
          Editar
        </button>
      ) : (
        <button onClick={openModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-canvas hover:opacity-90"
          style={{ backgroundColor: '#10b98b' }}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Añadir Pasajero
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(5,12,25,0.7)' }}>
          <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="passenger-modal-title"
            className="w-full max-w-xl bg-surface border border-line rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between px-6 py-4 border-b border-line">
              <div>
                <h2 id="passenger-modal-title" className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>
                  {editing ? 'Editar Pasajero' : 'Registrar Pasajero'}
                </h2>
                <p className="text-[11px] text-muted mt-0.5">Con correo, el pasajero puede entrar a la app y ver sus viajes asignados.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} aria-label="Cerrar" className="text-muted hover:text-fg">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelCls}>Nombre Completo<span className="text-rose-300 ml-0.5">*</span></span>
                  <input type="text" placeholder="Juan Pérez" value={form.full_name} onChange={e => set('full_name', e.target.value)} className={inputCls} />
                  {errors.full_name && <span className="text-[11px] text-rose-300">{errors.full_name}</span>}
                </label>
                <label className="block">
                  <span className={labelCls}>RUT<span className="text-rose-300 ml-0.5">*</span></span>
                  <input type="text" placeholder="12.345.678-9" value={form.rut} onChange={e => set('rut', e.target.value)} className={inputCls} />
                  {errors.rut && <span className="text-[11px] text-rose-300">{errors.rut}</span>}
                </label>
                <label className="block">
                  <span className={labelCls}>Correo (acceso app)</span>
                  <input type="email" placeholder="pasajero@empresa.cl" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
                  {errors.email && <span className="text-[11px] text-rose-300">{errors.email}</span>}
                </label>
                <label className="block">
                  <span className={labelCls}>Teléfono</span>
                  <input type="tel" placeholder="+56 9 1234 5678" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} />
                </label>
                {editing && (
                  <label className="block">
                    <span className={labelCls}>Estado</span>
                    <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </label>
                )}
              </div>

              <div>
                <span className={labelCls}>Contratos</span>
                <p className="text-[11px] text-muted mb-2">Al crear un viaje sobre un contrato, sus pasajeros aparecen para asignarlos.</p>
                {contracts.length === 0 ? (
                  <p className="text-[12px] text-muted">No hay contratos activos. Créalos en Rutas.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {contracts.map(c => (
                      <label key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-line text-[12px] text-fg cursor-pointer hover:bg-sunken">
                        <input type="checkbox" checked={form.contractIds.includes(c.id)} onChange={() => toggleContract(c.id)} />
                        <span className="truncate">{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <label className="block">
                <span className={labelCls}>Notas</span>
                <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className={inputCls} />
              </label>

              {submitError && <p role="alert" className="text-[12px] text-rose-300">{submitError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
              <button type="button" onClick={() => setOpen(false)} disabled={saving}
                className="px-4 py-2 rounded-md border border-line text-[12px] text-muted hover:text-fg">Cancelar</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-md text-[12px] font-semibold text-canvas disabled:opacity-60" style={{ backgroundColor: '#10b98b' }}>
                {saving ? 'Guardando…' : 'Guardar Pasajero'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function initial(p?: PassengerData) {
  return {
    full_name: p?.full_name ?? '',
    rut: p?.rut ?? '',
    phone: p?.phone ?? '',
    email: p?.email ?? '',
    status: p?.status ?? 'active',
    notes: p?.notes ?? '',
    contractIds: p?.contractIds ?? [],
  }
}
