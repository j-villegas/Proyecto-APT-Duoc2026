'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractRow = {
  id: string
  contract_name: string | null
  client_name: string | null
  start_date: string | null
  end_date: string | null
  priority: string | null
  status: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityMeta(priority: string | null): { label: string; borderColor: string; dotColor: string } {
  const map: Record<string, { label: string; borderColor: string; dotColor: string }> = {
    high:   { label: 'Alta',   borderColor: '#10b98b', dotColor: '#10b98b' },
    urgent: { label: 'Urgente',borderColor: '#fda4af', dotColor: '#fda4af' },
    medium: { label: 'Media',  borderColor: '#f8cb78', dotColor: '#f8cb78' },
    low:    { label: 'Baja',   borderColor: '#55d9ad', dotColor: '#55d9ad' },
    normal: { label: 'Normal', borderColor: '#526881', dotColor: '#a8b8cc' },
  }
  return map[priority ?? ''] ?? { label: priority ?? '—', borderColor: '#526881', dotColor: '#a8b8cc' }
}

function formatDateShort(date: string | null): string {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContractsPanel({ contracts }: { contracts: ContractRow[] }) {
  const router = useRouter()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)

  async function handleDelete(contractId: string) {
    setDeletingId(contractId)
    setError(null)
    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const { error: updErr } = await supabase
        .from('contracts')
        .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
        .eq('id', contractId)
        .eq('company_id', profile.company_id)

      if (updErr) throw new Error(updErr.message)

      setConfirmingId(null)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el contrato. Inténtalo de nuevo.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <ul className="divide-y divide-[#203650]">
      {contracts.map((c) => {
        const pm = priorityMeta(c.priority)
        const isConfirming = confirmingId === c.id

        if (isConfirming) {
          return (
            <li key={c.id} className="px-3 py-2.5">
              <div className="rounded-md border border-[#794052] bg-[#3d2332] p-3">
                <p className="text-[12px] font-semibold text-rose-200 mb-1">
                  ¿Eliminar {c.contract_name ?? c.client_name ?? 'este contrato'}?
                </p>
                <p className="text-[11px] text-rose-300 mb-2.5">
                  Las rutas ya asignadas a este contrato seguirán su curso. Solo se bloqueará la creación de nuevas rutas.
                </p>
                {error && <p className="text-[11px] text-rose-200 font-medium mb-2">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setConfirmingId(null); setError(null) }}
                    disabled={deletingId === c.id}
                    className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold border border-[#2b405b] text-[#a8b8cc] hover:bg-[#142942] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {deletingId === c.id ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            </li>
          )
        }

        return (
          <li key={c.id} className="group px-3 py-2.5 hover:bg-[#10223d] transition-colors">
            <div className="flex items-start gap-2">
              <div
                className="flex-1 min-w-0 pl-3 border-l-2"
                style={{ borderColor: pm.borderColor }}
              >
                <p
                  className="text-[12px] font-semibold leading-tight truncate"
                  style={{ color: '#f1f5f9' }}
                >
                  {c.contract_name ?? c.client_name ?? `Contrato #${c.id.slice(0, 6)}`}
                </p>
                {c.client_name && c.contract_name && (
                  <p className="text-[11px] text-[#a8b8cc] truncate mt-0.5">{c.client_name}</p>
                )}
                <div className="flex items-center justify-between mt-1 gap-2">
                  {(c.start_date || c.end_date) && (
                    <span className="text-[10px] text-[#a8b8cc]">
                      {formatDateShort(c.start_date)} → {formatDateShort(c.end_date)}
                    </span>
                  )}
                  {c.priority && (
                    <span
                      className="text-[10px] font-bold flex-shrink-0"
                      style={{ color: pm.dotColor }}
                    >
                      {pm.label}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setConfirmingId(c.id); setError(null) }}
                title="Eliminar contrato"
                className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-[#a8b8cc] hover:text-rose-300 hover:bg-[#3d2332] transition-colors cursor-pointer flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397M4.772 5.79c.34-.059.68-.114 1.022-.166m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
