import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { isPastCL, nowCL } from '@/lib/date'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type OverdueService = {
  id: string
  service_code: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
}

/**
 * Indicadores de servicios compartidos por el dashboard y Gestión de Rutas.
 * Excluye servicios eliminados (deleted_at) y evalúa los atrasos en hora de Chile.
 */
export async function getServiceKpis(supabase: Supabase) {
  const now = nowCL()
  const countByStatus = (status: string) =>
    supabase.from('services')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('status', status)

  const [completed, cancelled, inProgress, scheduled, overdueCandidates] = await Promise.all([
    countByStatus('completed'),
    countByStatus('cancelled'),
    countByStatus('in_progress'),
    countByStatus('scheduled'),
    supabase.from('services')
      .select('id, service_code, scheduled_date, scheduled_start_time')
      .is('deleted_at', null)
      .eq('status', 'scheduled')
      .lte('scheduled_date', now.date),
  ])

  const overdueRows = ((overdueCandidates.data ?? []) as OverdueService[])
    .filter(s => isPastCL(s.scheduled_date, s.scheduled_start_time, now))

  const completedCount = completed.count ?? 0
  const evaluableCount = completedCount + (cancelled.count ?? 0) + overdueRows.length

  return {
    now,
    completedCount,
    inProgressCount: inProgress.count ?? 0,
    scheduledFutureCount: Math.max(0, (scheduled.count ?? 0) - overdueRows.length),
    overdueRows,
    evaluableCount,
    compliancePct: evaluableCount > 0 ? Math.round(completedCount / evaluableCount * 100) : null,
  }
}
