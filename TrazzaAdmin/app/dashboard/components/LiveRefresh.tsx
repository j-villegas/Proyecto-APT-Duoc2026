'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Respaldo para datos sin realtime (incidentes, combustible, alertas, etc.).
const FALLBACK_REFRESH_MS = 30_000
// Agrupa ráfagas de cambios (p. ej. finalizar una ruta toca varias filas).
const DEBOUNCE_MS = 1_000

/**
 * Mantiene el dashboard en vivo: vuelve a renderizar los Server Components
 * cuando cambian servicios o paradas (Supabase Realtime) y, como respaldo,
 * cada 30 s mientras la pestaña está visible. Conserva el estado de modales.
 */
export default function LiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let pending: ReturnType<typeof setTimeout> | null = null

    const refreshSoon = () => {
      if (pending) return
      pending = setTimeout(() => {
        pending = null
        router.refresh()
      }, DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_stops' }, refreshSoon)
      .subscribe()

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, FALLBACK_REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSoon()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (pending) clearTimeout(pending)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
