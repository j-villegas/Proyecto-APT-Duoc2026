'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { auditService, recalculateMetrics } from '../../actions'

interface Props {
  serviceId: string
  closed: boolean
  currentStatus: string | null
}

/** Aprobar u observar un servicio cerrado, y recalcular sus métricas. */
export default function AuditActions({ serviceId, closed, currentStatus }: Props) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ success: true } | { error: string }>, ok: string) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) {
        setError(result.error)
        return
      }
      setNotes('')
      setMessage(ok)
      router.refresh()
    })
  }

  if (!closed) {
    return (
      <p className="text-[12px] text-muted">
        El servicio aún no está cerrado. Podrás auditarlo cuando se finalice o cancele; las métricas se consolidan solas al cierre.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Comentario de auditoría</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Obligatorio para dejar observado. Ej: desvío no justificado en Av. Grecia."
          className="mt-1 w-full bg-sunken border border-line rounded-md px-3 py-2 text-[12px] text-fg placeholder:text-muted focus:outline-none focus:border-[#246354]"
        />
      </label>

      {error && <p role="alert" className="text-[12px] text-rose-300">{error}</p>}
      {message && <p role="status" className="text-[12px] text-[#55d9ad]">{message}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => auditService(serviceId, 'approved', notes), 'Servicio aprobado.')}
          className="px-3 py-2 rounded-md text-[12px] font-semibold border border-[#246354] bg-[#143c39] text-[#62e7bd] hover:bg-[#185049] disabled:opacity-50"
        >
          {currentStatus === 'approved' ? 'Aprobar de nuevo' : 'Aprobar'}
        </button>
        <button
          type="button"
          disabled={pending || !notes.trim()}
          title={!notes.trim() ? 'Escribe un comentario para observar' : undefined}
          onClick={() => run(() => auditService(serviceId, 'observed', notes), 'Servicio marcado como observado.')}
          className="px-3 py-2 rounded-md text-[12px] font-semibold border border-[#7a5a2b] bg-[#3b3020] text-[#fdba74] hover:bg-[#4a3b26] disabled:opacity-50"
        >
          Dejar observado
        </button>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => recalculateMetrics(serviceId), 'Métricas recalculadas.')}
        className="w-full px-3 py-2 rounded-md text-[12px] border border-line text-muted hover:text-fg disabled:opacity-50"
      >
        Recalcular métricas
      </button>
      <p className="text-[10px] text-muted">
        Cada decisión queda en el historial con tu usuario y la hora; no se puede editar ni borrar.
      </p>
    </div>
  )
}
