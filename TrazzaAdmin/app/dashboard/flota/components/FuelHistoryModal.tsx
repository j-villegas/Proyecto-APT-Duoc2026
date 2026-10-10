'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type FuelLog = {
  id: string
  fuel_datetime: string | null
  liters: number | null
  total_amount: number | null
  station_name: string | null
  odometer_km: number | null
  fuel_level_before_eighths: number | null
  fuel_level_after_eighths: number | null
  receipt_number: string | null
  vehicle_id: string | null
  vehicles: { plate: string | null; brand: string | null; model: string | null } | null
}

type VehicleOption = {
  id: string
  plate: string | null
  brand: string | null
  model: string | null
}

type DateFilter = 'all' | 'today' | '7days' | '30days'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all:    'Todos',
  today:  'Hoy',
  '7days':  'Últimos 7 días',
  '30days': 'Últimos 30 días',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function levelStr(before: number | null, after: number | null): string {
  if (before == null && after == null) return '—'
  if (before == null) return `${after}/8`
  if (after == null)  return `${before}/8`
  return `${before}/8 → ${after}/8`
}

function matchSearch(log: FuelLog, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  const plate   = (log.vehicles as { plate: string | null } | null)?.plate ?? ''
  const station = log.station_name ?? ''
  const receipt = log.receipt_number ?? ''
  return [plate, station, receipt].some(s => s.toLowerCase().includes(lower))
}

function matchDate(log: FuelLog, filter: DateFilter): boolean {
  if (filter === 'all' || !log.fuel_datetime) return true
  const logDate = new Date(log.fuel_datetime)
  const now     = new Date()
  if (filter === 'today') {
    return logDate.toDateString() === now.toDateString()
  }
  const days  = filter === '7days' ? 7 : 30
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)
  return logDate >= cutoff
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FuelHistoryModal() {
  const [open, setOpen]               = useState(false)
  const [logs, setLogs]               = useState<FuelLog[]>([])
  const [vehicles, setVehicles]       = useState<VehicleOption[]>([])
  const [loading, setLoading]         = useState(false)

  // Filters
  const [search, setSearch]           = useState('')
  const [vehicleFilter, setVFilter]   = useState('')
  const [dateFilter, setDateFilter]   = useState<DateFilter>('all')

  // Pagination
  const [page, setPage]               = useState(1)

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [logsResult, vehiclesResult] = await Promise.all([
      supabase
        .from('fuel_logs')
        .select('id, fuel_datetime, liters, total_amount, station_name, odometer_km, fuel_level_before_eighths, fuel_level_after_eighths, receipt_number, vehicle_id, vehicles:vehicle_id(plate, brand, model)')
        .is('deleted_at', null)
        .order('fuel_datetime', { ascending: false })
        .limit(200),

      supabase
        .from('vehicles')
        .select('id, plate, brand, model')
        .is('deleted_at', null)
        .order('plate', { ascending: true }),
    ])
// supabase-js sin tipos generados infiere las relaciones embebidas como arreglos;
    // en ejecución las many-to-one llegan como objeto, de ahí el doble cast.
    setLogs((logsResult.data ?? []) as unknown as FuelLog[])
    setVehicles((vehiclesResult.data ?? []) as VehicleOption[])
    setLoading(false)
  }, [])


  // Reset to page 1 whenever filters change
  // Volver a la página 1 al cambiar un filtro (ajuste durante el render, sin efecto).
  const filterKey = String(search) + "|" + String(vehicleFilter) + "|" + String(dateFilter)
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
   
  }, [open])

  function handleClose() {
    setOpen(false)
    setSearch('')
    setVFilter('')
    setDateFilter('all')
    setPage(1)
    setLogs([])
    setVehicles([])
  }

  // ── Derived filtered list ──────────────────────────────────────────────────

  const filtered = logs.filter(log => {
    if (!matchSearch(log, search))           return false
    if (vehicleFilter && log.vehicle_id !== vehicleFilter) return false
    if (!matchDate(log, dateFilter))         return false
    return true
  })

  const totalLiters = filtered.reduce((s, l) => s + (l.liters ?? 0), 0)
  const totalAmount = filtered.reduce((s, l) => s + (l.total_amount ?? 0), 0)

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(true); loadData() }}
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
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 920, maxHeight: '92vh' }}
          >
            {/* ── Header ── */}
            <div
              className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#10b98b18' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#10b98b" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>
                    Historial de Combustible
                  </h2>
                  <p className="text-[11px] text-muted mt-0.5">
                    Consulta las cargas registradas para la flota.
                  </p>
                </div>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Filters ── */}
            <div
              className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-raised flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Patente, estación, comprobante..."
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-line rounded-md bg-surface text-fg placeholder-muted focus:outline-none focus:ring-1 focus:ring-fg focus:border-fg transition"
                />
              </div>

              {/* Vehicle filter */}
              <select
                value={vehicleFilter}
                onChange={e => setVFilter(e.target.value)}
                className="py-1.5 pl-2.5 pr-7 text-[12px] border border-line rounded-md bg-surface text-soft focus:outline-none focus:ring-1 focus:ring-fg transition cursor-pointer"
              >
                <option value="">Todos los vehículos</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.plate ?? '—'}{v.brand || v.model ? ` · ${[v.brand, v.model].filter(Boolean).join(' ')}` : ''}
                  </option>
                ))}
              </select>

              {/* Date filter */}
              <div className="flex items-center gap-1">
                {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDateFilter(key)}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors"
                    style={
                      dateFilter === key
                        ? { backgroundColor: '#254b77', color: 'white' }
                        : { backgroundColor: '#142942', color: '#a8b8cc', border: '1px solid #2b405b' }
                    }
                  >
                    {DATE_FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Summary bar ── */}
            {!loading && filtered.length > 0 && (
              <div className="flex items-center gap-6 px-6 py-2.5 border-b border-raised flex-shrink-0 bg-surface">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Cargas</span>
                  <span className="text-[13px] font-bold" style={{ color: '#f1f5f9' }}>{filtered.length}</span>
                </div>
                <div className="w-px h-4 bg-line" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Total litros</span>
                  <span className="text-[13px] font-bold" style={{ color: '#10b98b' }}>
                    {totalLiters % 1 === 0 ? totalLiters : totalLiters.toFixed(1)} L
                  </span>
                </div>
                {totalAmount > 0 && (
                  <>
                    <div className="w-px h-4 bg-line" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Total monto</span>
                      <span className="text-[13px] font-bold" style={{ color: '#f1f5f9' }}>
                        ${totalAmount.toLocaleString('es-CL')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-3 py-16 text-muted">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-[13px]">Cargando historial...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-10 h-10 rounded-full bg-raised flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-medium text-muted">Sin cargas registradas</p>
                  <p className="text-[11px] text-muted mt-0.5">Ajusta los filtros o registra una nueva carga.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#10223d' }} className="border-b border-raised">
                      {['Fecha', 'Vehículo', 'Estación', 'Litros', 'Monto', 'KM', 'Nivel'].map(col => (
                        <th
                          key={col}
                          className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2.5 text-muted whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(log => {
                      const veh   = log.vehicles as { plate: string | null; brand: string | null; model: string | null } | null
                      const plate = veh?.plate ?? '—'
                      const model = [veh?.brand, veh?.model].filter(Boolean).join(' ')
                      return (
                        <tr key={log.id} className="border-b border-raised hover:bg-sunken transition-colors">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[11px] text-muted">{fmtDatetime(log.fuel_datetime)}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <p className="text-[12px] font-bold font-mono tracking-wide" style={{ color: '#f1f5f9' }}>{plate}</p>
                            {model && <p className="text-[10px] text-muted">{model}</p>}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[12px] text-soft">{log.station_name ?? '—'}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[12px] font-semibold" style={{ color: '#10b98b' }}>
                              {log.liters != null
                                ? `${log.liters % 1 === 0 ? log.liters : log.liters.toFixed(1)} L`
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[12px] text-soft tabular-nums">
                              {log.total_amount != null
                                ? `$${log.total_amount.toLocaleString('es-CL')}`
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[12px] text-muted tabular-nums">
                              {log.odometer_km != null
                                ? `${log.odometer_km.toLocaleString('es-CL')} km`
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-[11px] text-muted">
                              {levelStr(log.fuel_level_before_eighths, log.fuel_level_after_eighths)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Pagination ── */}
            {!loading && totalPages > 1 && (
              <div
                className="flex items-center justify-between px-6 py-3 border-t border-line flex-shrink-0"
                style={{ backgroundColor: '#10223d' }}
              >
                <p className="text-[11px] text-muted">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded border border-line text-soft hover:bg-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    ← Anterior
                  </button>
                  <span
                    className="px-3 py-1.5 text-[11px] font-bold rounded"
                    style={{ backgroundColor: '#254b77', color: 'white' }}
                  >
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded border border-line text-soft hover:bg-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {/* ── Footer close ── */}
            {(loading || totalPages <= 1) && (
              <div
                className="flex items-center justify-end px-6 py-3 border-t border-line flex-shrink-0"
                style={{ backgroundColor: '#10223d' }}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
