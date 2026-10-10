'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverWithLicense = {
  id: string
  full_name: string | null
  rut: string | null
  driver_code: string | null
  license_type: string | null
  license_expires_at: string | null
  status: string | null
}

type AlertType = 'expired' | 'expiring_7' | 'expiring_30' | 'status'

type DriverAlert = {
  id: string
  name: string | null
  rut: string | null
  driver_code: string | null
  alertType: AlertType
  label: string
  days: number | null
  dotColor: string
}

type TypeFilter = 'all' | 'expired' | 'expiring' | 'status'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const TYPE_FILTER_LABELS: Record<TypeFilter, string> = {
  all:      'Todas',
  expired:  'Licencia vencida',
  expiring: 'Por vencer',
  status:   'Estado operativo',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const exp = new Date(iso); exp.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function buildAlerts(drivers: DriverWithLicense[]): DriverAlert[] {
  const alerts: DriverAlert[] = []

  for (const d of drivers) {
    // License-based alerts
    if (d.license_expires_at) {
      const days = daysUntil(d.license_expires_at)
      if (days < 0) {
        alerts.push({
          id: `exp-${d.id}`, name: d.full_name, rut: d.rut, driver_code: d.driver_code,
          alertType: 'expired',
          label: `Licencia vencida el ${formatDate(d.license_expires_at)}`,
          days, dotColor: '#fda4af',
        })
      } else if (days <= 7) {
        alerts.push({
          id: `exp7-${d.id}`, name: d.full_name, rut: d.rut, driver_code: d.driver_code,
          alertType: 'expiring_7',
          label: `Licencia vence en ${days} día${days !== 1 ? 's' : ''} (${formatDate(d.license_expires_at)})`,
          days, dotColor: '#fdba74',
        })
      } else if (days <= 30) {
        alerts.push({
          id: `exp30-${d.id}`, name: d.full_name, rut: d.rut, driver_code: d.driver_code,
          alertType: 'expiring_30',
          label: `Licencia vence en ${days} días (${formatDate(d.license_expires_at)})`,
          days, dotColor: '#f8cb78',
        })
      }
    }
    // Status-based alerts (suspended)
    if (d.status === 'suspended') {
      alerts.push({
        id: `sus-${d.id}`, name: d.full_name, rut: d.rut, driver_code: d.driver_code,
        alertType: 'status',
        label: 'Conductor suspendido',
        days: null, dotColor: '#fda4af',
      })
    }
  }

  // Sort: expired first, then by days asc
  alerts.sort((a, b) => {
    if (a.alertType === 'expired' && b.alertType !== 'expired') return -1
    if (b.alertType === 'expired' && a.alertType !== 'expired') return  1
    if (a.days != null && b.days != null) return a.days - b.days
    return 0
  })

  return alerts
}

function matchTypeFilter(alert: DriverAlert, filter: TypeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'expired')  return alert.alertType === 'expired'
  if (filter === 'expiring') return alert.alertType === 'expiring_7' || alert.alertType === 'expiring_30'
  if (filter === 'status')   return alert.alertType === 'status'
  return true
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverAlertsModal() {
  const [open, setOpen]             = useState(false)
  const [allAlerts, setAllAlerts]   = useState<DriverAlert[]>([])
  const [loading, setLoading]       = useState(false)

  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [page, setPage]             = useState(1)

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('drivers')
      .select('id, full_name, rut, driver_code, license_type, license_expires_at, status')
      .is('deleted_at', null)
      .order('full_name', { ascending: true })

    const drivers = (data ?? []) as DriverWithLicense[]
    setAllAlerts(buildAlerts(drivers))
    setLoading(false)
  }, [])

  // Volver a la página 1 al cambiar un filtro (ajuste durante el render, sin efecto).
  const filterKey = String(search) + "|" + String(typeFilter)
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
   
  }, [open])

  function handleClose() {
    setOpen(false)
    setSearch(''); setTypeFilter('all'); setPage(1); setAllAlerts([])
  }

  const filtered = allAlerts.filter(a => {
    if (search) {
      const q = search.toLowerCase()
      if (![a.name ?? '', a.rut ?? '', a.driver_code ?? ''].some(s => s.toLowerCase().includes(q)))
        return false
    }
    return matchTypeFilter(a, typeFilter)
  })

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
        Ver todas →
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.52)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 680, maxHeight: '88vh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#fda4af15' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fda4af" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Alertas de Conductores</h2>
                  <p className="text-[11px] text-muted mt-0.5">Licencias, estados y alertas operativas de conductores.</p>
                </div>
              </div>
              <button aria-label="Cerrar" onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-raised flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="relative flex-1 min-w-[160px]">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Nombre, RUT o código..."
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-line rounded-md bg-surface text-fg placeholder-muted focus:outline-none focus:ring-1 focus:ring-fg focus:border-fg transition"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {(Object.keys(TYPE_FILTER_LABELS) as TypeFilter[]).map(key => (
                  <button key={key} type="button" onClick={() => setTypeFilter(key)}
                    className="px-2 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors whitespace-nowrap"
                    style={typeFilter === key ? { backgroundColor: '#254b77', color: 'white' } : { backgroundColor: '#142942', color: '#a8b8cc', border: '1px solid #2b405b' }}
                  >
                    {TYPE_FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-3 py-16 text-muted">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-[13px]">Cargando alertas...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-10 h-10 rounded-full bg-raised flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-medium text-muted">Sin alertas</p>
                  <p className="text-[11px] text-muted mt-0.5">No hay alertas que coincidan con los filtros.</p>
                </div>
              ) : (
                <ul className="divide-y divide-raised">
                  {paginated.map(a => (
                    <li key={a.id} className="px-6 py-3.5 flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: a.dotColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-fg leading-snug">
                          {a.name ?? 'Conductor sin nombre'}
                          {a.driver_code && <span className="text-muted font-normal ml-1.5">· {a.driver_code}</span>}
                        </p>
                        {a.rut && <p className="text-[10px] text-muted mt-0.5">{a.rut}</p>}
                        <p className="text-[11px] mt-0.5" style={{ color: a.dotColor }}>{a.label}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer / Pagination */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              {totalPages > 1 ? (
                <p className="text-[11px] text-muted">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
                </p>
              ) : (
                <span className="text-[11px] text-muted">{filtered.length} alerta{filtered.length !== 1 ? 's' : ''}</span>
              )}
              <div className="flex items-center gap-2">
                {totalPages > 1 && (
                  <>
                    <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded border border-line text-soft hover:bg-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                      ← Anterior
                    </button>
                    <span className="px-3 py-1.5 text-[11px] font-bold rounded" style={{ backgroundColor: '#254b77', color: 'white' }}>
                      {page} / {totalPages}
                    </span>
                    <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded border border-line text-soft hover:bg-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                      Siguiente →
                    </button>
                  </>
                )}
                <button type="button" onClick={handleClose}
                  className="px-4 py-1.5 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors cursor-pointer">
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
