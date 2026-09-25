'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceLog = {
  id: string
  service_code: string | null
  status: string | null
  scheduled_date: string | null
  origin: string | null
  destination: string | null
  driver_id: string | null
  drivers: { full_name: string | null; driver_code: string | null } | null
  vehicles: { plate: string | null } | null
}

type DriverOption = {
  id: string
  full_name: string | null
  driver_code: string | null
}

type StatusFilter = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
type DateFilter   = 'all' | 'today' | '7days' | '30days'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  scheduled:   { label: 'Programado', bg: '#183352', text: '#7dbbff' },
  in_progress: { label: 'En ruta',    bg: '#3b3020', text: '#f8cb78' },
  completed:   { label: 'Finalizado', bg: '#123b35', text: '#55d9ad' },
  cancelled:   { label: 'Cancelado',  bg: '#203650', text: '#a8b8cc' },
}

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all:         'Todos',
  scheduled:   'Programado',
  in_progress: 'En ruta',
  completed:   'Finalizado',
  cancelled:   'Cancelado',
}

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all:    'Todos',
  today:  'Hoy',
  '7days':  'Últimos 7 días',
  '30days': 'Últimos 30 días',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function matchSearch(log: ServiceLog, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  const name  = (log.drivers as { full_name: string | null } | null)?.full_name ?? ''
  const code  = (log.drivers as { driver_code: string | null } | null)?.driver_code ?? ''
  const plate = (log.vehicles as { plate: string | null } | null)?.plate ?? ''
  const svc   = log.service_code ?? ''
  return [name, code, plate, svc].some(s => s.toLowerCase().includes(lower))
}

function matchDate(log: ServiceLog, filter: DateFilter): boolean {
  if (filter === 'all' || !log.scheduled_date) return true
  const logDate = new Date(log.scheduled_date + 'T12:00:00')
  const now     = new Date()
  if (filter === 'today') {
    return logDate.toDateString() === now.toDateString()
  }
  const days   = filter === '7days' ? 7 : 30
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)
  return logDate >= cutoff
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ServiceHistoryModal() {
  const [open, setOpen]             = useState(false)
  const [logs, setLogs]             = useState<ServiceLog[]>([])
  const [drivers, setDrivers]       = useState<DriverOption[]>([])
  const [loading, setLoading]       = useState(false)

  const [search, setSearch]         = useState('')
  const [driverFilter, setDFilter]  = useState('')
  const [statusFilter, setSFilter]  = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [page, setPage]             = useState(1)

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [logsResult, driversResult] = await Promise.all([
      supabase
        .from('services')
        .select('id, service_code, status, scheduled_date, origin, destination, driver_id, drivers:driver_id(full_name, driver_code), vehicles:vehicle_id(plate)')
        .is('deleted_at', null)
        .not('driver_id', 'is', null)
        .order('scheduled_date', { ascending: false })
        .limit(200),

      supabase
        .from('drivers')
        .select('id, full_name, driver_code')
        .is('deleted_at', null)
        .order('full_name', { ascending: true }),
    ])
    setLogs((logsResult.data ?? []) as ServiceLog[])
    setDrivers((driversResult.data ?? []) as DriverOption[])
    setLoading(false)
  }, [])

  useEffect(() => { if (open) loadData() }, [open, loadData])
  useEffect(() => { setPage(1) }, [search, driverFilter, statusFilter, dateFilter])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose() {
    setOpen(false)
    setSearch(''); setDFilter(''); setSFilter('all'); setDateFilter('all'); setPage(1)
    setLogs([]); setDrivers([])
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = logs.filter(log => {
    if (!matchSearch(log, search))                             return false
    if (driverFilter && log.driver_id !== driverFilter)       return false
    if (statusFilter !== 'all' && log.status !== statusFilter) return false
    if (!matchDate(log, dateFilter))                           return false
    return true
  })

  const countCompleted   = filtered.filter(l => l.status === 'completed').length
  const countInProgress  = filtered.filter(l => l.status === 'in_progress').length
  const countCancelled   = filtered.filter(l => l.status === 'cancelled').length

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold transition-colors cursor-pointer"
        style={{ color: '#10b98b' }}
      >
        Ver historial →
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.52)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div
            className="bg-[#142942] rounded-lg border border-[#2b405b] w-full flex flex-col"
            style={{ maxWidth: 920, maxHeight: '92vh' }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-6 py-4 border-b border-[#2b405b] flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#a8b8cc15' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#f1f5f9" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Historial de Servicios</h2>
                  <p className="text-[11px] text-[#a8b8cc] mt-0.5">Consulta los servicios asociados a conductores.</p>
                </div>
              </div>
              <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-md text-[#a8b8cc] hover:text-[#f1f5f9] hover:bg-[#2b405b] transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-[#203650] flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#a8b8cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Conductor, código, patente, servicio..."
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-[#2b405b] rounded-md bg-[#142942] text-[#f1f5f9] placeholder-[#a8b8cc] focus:outline-none focus:ring-1 focus:ring-[#f1f5f9] focus:border-[#f1f5f9] transition"
                />
              </div>
              <select
                value={driverFilter} onChange={e => setDFilter(e.target.value)}
                className="py-1.5 pl-2.5 pr-7 text-[12px] border border-[#2b405b] rounded-md bg-[#142942] text-[#d5e0ed] focus:outline-none focus:ring-1 focus:ring-[#f1f5f9] transition cursor-pointer"
              >
                <option value="">Todos los conductores</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.full_name ?? '—'}{d.driver_code ? ` · ${d.driver_code}` : ''}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 flex-wrap">
                {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map(key => (
                  <button key={key} type="button" onClick={() => setSFilter(key)}
                    className="px-2 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors"
                    style={statusFilter === key ? { backgroundColor: '#254b77', color: 'white' } : { backgroundColor: '#142942', color: '#a8b8cc', border: '1px solid #2b405b' }}
                  >
                    {STATUS_FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map(key => (
                  <button key={key} type="button" onClick={() => setDateFilter(key)}
                    className="px-2 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors"
                    style={dateFilter === key ? { backgroundColor: '#254b77', color: 'white' } : { backgroundColor: '#142942', color: '#a8b8cc', border: '1px solid #2b405b' }}
                  >
                    {DATE_FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary bar */}
            {!loading && filtered.length > 0 && (
              <div className="flex items-center gap-6 px-6 py-2.5 border-b border-[#203650] flex-shrink-0 bg-[#142942]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc]">Total</span>
                  <span className="text-[13px] font-bold" style={{ color: '#f1f5f9' }}>{filtered.length}</span>
                </div>
                <div className="w-px h-4 bg-[#2b405b]" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc]">Finalizados</span>
                  <span className="text-[13px] font-bold" style={{ color: '#55d9ad' }}>{countCompleted}</span>
                </div>
                <div className="w-px h-4 bg-[#2b405b]" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc]">En ruta</span>
                  <span className="text-[13px] font-bold" style={{ color: '#f8cb78' }}>{countInProgress}</span>
                </div>
                <div className="w-px h-4 bg-[#2b405b]" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#a8b8cc]">Cancelados</span>
                  <span className="text-[13px] font-bold" style={{ color: '#a8b8cc' }}>{countCancelled}</span>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-3 py-16 text-[#a8b8cc]">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-[13px]">Cargando historial...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-10 h-10 rounded-full bg-[#203650] flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-[#a8b8cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-medium text-[#a8b8cc]">Sin servicios registrados</p>
                  <p className="text-[11px] text-[#a8b8cc] mt-0.5">Ajusta los filtros para ver más resultados.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#10223d' }} className="border-b border-[#203650]">
                      {['Fecha', 'Conductor', 'Servicio', 'Vehículo', 'Ruta', 'Estado'].map(col => (
                        <th key={col} className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2.5 text-[#a8b8cc] whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(log => {
                      const drv    = log.drivers as { full_name: string | null; driver_code: string | null } | null
                      const veh    = log.vehicles as { plate: string | null } | null
                      const sm     = STATUS_META[log.status ?? ''] ?? { label: log.status ?? '—', bg: '#203650', text: '#a8b8cc' }
                      const route  = [log.origin, log.destination].filter(Boolean).join(' → ') || '—'
                      return (
                        <tr key={log.id} className="border-b border-[#203650] hover:bg-[#10223d] transition-colors">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[11px] text-[#a8b8cc]">{fmtDate(log.scheduled_date)}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-[12px] font-semibold text-[#f1f5f9] leading-snug">{drv?.full_name ?? '—'}</p>
                            {drv?.driver_code && <p className="text-[10px] text-[#a8b8cc]">{drv.driver_code}</p>}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[12px] font-mono text-[#d5e0ed]">
                              {log.service_code ?? `#${log.id.slice(0, 8)}`}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[12px] font-mono font-bold" style={{ color: '#f1f5f9' }}>
                              {veh?.plate ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 max-w-[180px]">
                            <span className="text-[11px] text-[#a8b8cc] line-clamp-1">{route}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: sm.bg, color: sm.text }}>
                              {sm.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination / Footer */}
            <div
              className="flex items-center justify-between px-6 py-3 border-t border-[#2b405b] flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              {totalPages > 1 ? (
                <p className="text-[11px] text-[#a8b8cc]">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
                </p>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                {totalPages > 1 && (
                  <>
                    <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded border border-[#2b405b] text-[#d5e0ed] hover:bg-[#142942] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                      ← Anterior
                    </button>
                    <span className="px-3 py-1.5 text-[11px] font-bold rounded" style={{ backgroundColor: '#254b77', color: 'white' }}>
                      {page} / {totalPages}
                    </span>
                    <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded border border-[#2b405b] text-[#d5e0ed] hover:bg-[#142942] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                      Siguiente →
                    </button>
                  </>
                )}
                <button type="button" onClick={handleClose}
                  className="px-4 py-1.5 rounded-md text-[12px] font-semibold border border-[#2b405b] text-[#a8b8cc] hover:bg-[#2b405b] transition-colors cursor-pointer">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
