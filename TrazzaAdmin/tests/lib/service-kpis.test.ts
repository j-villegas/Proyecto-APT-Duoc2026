import { describe, expect, it, vi, afterEach } from 'vitest'
import { getServiceKpis } from '@/lib/service-kpis'

type Row = { id: string; status: string; deleted_at: string | null; actual_start_at: string | null; scheduled_date: string; scheduled_start_time: string | null; service_code: string }

/** Cliente de Supabase mínimo que aplica los filtros usados por getServiceKpis sobre filas en memoria. */
function fakeSupabase(rows: Row[]) {
  return {
    from: () => {
      const filters: ((r: Row) => boolean)[] = []
      let head = false
      const query = {
        select: (_cols: string, opts?: { head?: boolean }) => { head = !!opts?.head; return query },
        is: (col: keyof Row, value: null) => { filters.push(r => r[col] === value); return query },
        eq: (col: keyof Row, value: string) => { filters.push(r => r[col] === value); return query },
        lte: (col: keyof Row, value: string) => { filters.push(r => String(r[col]) <= value); return query },
        not: (col: keyof Row, _op: 'is', value: null) => { filters.push(r => r[col] !== value); return query },
        then: (resolve: (v: unknown) => void) => {
          const matched = rows.filter(r => filters.every(f => f(r)))
          resolve(head ? { count: matched.length, data: null, error: null } : { data: matched, count: null, error: null })
        },
      }
      return query
    },
  }
}

const row = (over: Partial<Row>): Row => ({
  id: Math.random().toString(36).slice(2), status: 'scheduled', deleted_at: null, actual_start_at: null,
  scheduled_date: '2026-10-20', scheduled_start_time: '08:00:00', service_code: 'S', ...over,
})

afterEach(() => vi.useRealTimers())

describe('getServiceKpis', () => {
  it('excluye eliminados, cuenta atrasos en hora de Chile y calcula el cumplimiento', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T15:00:00Z')) // 12:00 en Chile

    const rows = [
      row({ status: 'completed' }),
      row({ status: 'completed' }),
      row({ status: 'completed', deleted_at: '2026-10-01T00:00:00Z' }),          // eliminado: no cuenta
      row({ status: 'cancelled' }),                                             // cancelado antes de iniciar: no penaliza
      row({ status: 'cancelled', actual_start_at: '2026-10-09T11:00:00Z' }),    // interrumpido: penaliza
      row({ status: 'scheduled', scheduled_date: '2026-10-09', scheduled_start_time: '08:00:00' }), // no iniciado
      row({ status: 'scheduled', scheduled_date: '2026-10-09', scheduled_start_time: '18:00:00' }), // programado
      row({ status: 'in_progress', scheduled_date: '2026-08-22' }),
    ]

    const kpis = await getServiceKpis(fakeSupabase(rows) as never)

    expect(kpis.completedCount).toBe(2)
    expect(kpis.cancelledCount).toBe(2)
    expect(kpis.abandonedCount).toBe(1)
    expect(kpis.overdueRows).toHaveLength(1)
    expect(kpis.scheduledFutureCount).toBe(1)
    expect(kpis.inProgressCount).toBe(1)
    // 2 finalizados / (2 + 1 no iniciado + 1 interrumpido)
    expect(kpis.evaluableCount).toBe(4)
    expect(kpis.compliancePct).toBe(50)
  })

  it('sin servicios evaluables el cumplimiento queda vacío, no en 0%', async () => {
    const kpis = await getServiceKpis(fakeSupabase([row({ status: 'cancelled' })]) as never)
    expect(kpis.compliancePct).toBeNull()
  })
})
