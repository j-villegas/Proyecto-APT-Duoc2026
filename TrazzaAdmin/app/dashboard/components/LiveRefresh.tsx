'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { authenticateRealtime } from '@/lib/supabase/realtime'

// Respaldo para datos sin realtime (incidentes, combustible, alertas, etc.).
const FALLBACK_REFRESH_MS = 30_000
// Agrupa ráfagas de cambios (p. ej. finalizar una ruta toca varias filas).
const DEBOUNCE_MS = 800

type LiveStatus = 'connecting' | 'live' | 'offline'

/**
 * Mantiene el panel en vivo: vuelve a renderizar los Server Components cuando
 * cambian servicios o paradas (Supabase Realtime) y, como respaldo, cada 30 s
 * mientras la pestaña está visible. Conserva el estado de los modales abiertos.
 * Muestra un indicador discreto del estado de la conexión.
 */
export default function LiveRefresh() {
  const router = useRouter()
  const [status, setStatus] = useState<LiveStatus>('connecting')

  useEffect(() => {
    const supabase = createClient()
    let pending: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const refreshSoon = () => {
      if (pending) return
      pending = setTimeout(() => {
        pending = null
        router.refresh()
      }, DEBOUNCE_MS)
    }

    authenticateRealtime(supabase)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        channel = supabase
          .channel('dashboard-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, refreshSoon)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'service_stops' }, refreshSoon)
          .subscribe(state => {
            if (state === 'SUBSCRIBED') setStatus('live')
            else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setStatus('offline')
          })
      })

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, FALLBACK_REFRESH_MS)

    // Al volver a la pestaña, ponerse al día de inmediato.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSoon()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (pending) clearTimeout(pending)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [router])

  const label = status === 'live' ? 'En vivo' : status === 'connecting' ? 'Conectando…' : 'Reconectando…'
  const color = status === 'live' ? 'var(--color-accent)' : 'var(--color-warn-fg)'

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-40 flex items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2.5 py-1 text-[10px] font-semibold text-muted shadow-md"
      role="status"
      aria-live="polite"
      title={status === 'live' ? 'Los cambios de los conductores aparecen sin recargar.' : 'Sin conexión en vivo: los datos se actualizan cada 30 s.'}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === 'live' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: color }} />}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      </span>
      {label}
    </div>
  )
}
