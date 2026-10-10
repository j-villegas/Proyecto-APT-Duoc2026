'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayCL } from '@/lib/date'

// ─── Types ────────────────────────────────────────────────────────────────────

type OpAlertLevel  = 'critical' | 'high' | 'medium'
type OpAlertSource = 'maintenance' | 'license' | 'service' | 'incident' | 'operational'

type OpAlert = {
  id:       string
  title:    string
  detail:   string
  level:    OpAlertLevel
  source:   OpAlertSource
  sortKey:  number
}

type SourceFilter = 'all' | OpAlertSource
type LevelFilter  = 'all' | OpAlertLevel

const PAGE_SIZE = 10

const SOURCE_LABELS: Record<OpAlertSource, string> = {
  maintenance:  'Vehículo',
  license:      'Licencia',
  service:      'Servicio',
  incident:     'Incidencia',
  operational:  'Operacional',
}

const LEVEL_STYLE: Record<OpAlertLevel, { dot: string; bg: string; text: string; label: string }> = {
  critical: { dot: '#fda4af', bg: '#3d2332', text: '#fda4af', label: 'Crítica' },
  high:     { dot: '#fdba74', bg: '#3b3020', text: '#fdba74', label: 'Alta'    },
  medium:   { dot: '#f8cb78', bg: '#3b3020', text: '#f8cb78', label: 'Media'   },
}

const SOURCE_FILTER_OPTIONS: { key: SourceFilter; label: string }[] = [
  { key: 'all',          label: 'Todas' },
  { key: 'maintenance',  label: 'Vehículo' },
  { key: 'license',      label: 'Licencia' },
  { key: 'service',      label: 'Servicio' },
  { key: 'incident',     label: 'Incidencia' },
  { key: 'operational',  label: 'Operacional' },
]

const LEVEL_FILTER_OPTIONS: { key: LevelFilter; label: string }[] = [
  { key: 'all',      label: 'Todos' },
  { key: 'critical', label: 'Crítica' },
  { key: 'high',     label: 'Alta' },
  { key: 'medium',   label: 'Media' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const exp = new Date(iso); exp.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(t: string | null): string {
  if (!t) return ''
  return t.slice(0, 5)
}

async function fetchAlerts(): Promise<OpAlert[]> {
  const supabase = createClient()
  const today    = todayCL()

  const [mResult, dResult, iResult, sResult, oResult] = await Promise.all([
    supabase
      .from('maintenance_orders')
      .select('id, title, priority, vehicles:vehicle_id(plate)')
      .eq('status', 'in_progress')
      .in('priority', ['high', 'critical'])
      .is('deleted_at', null)
      .limit(30),

    supabase
      .from('drivers')
      .select('id, full_name, license_expires_at')
      .is('deleted_at', null)
      .not('license_expires_at', 'is', null)
      .lte('license_expires_at', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),

    supabase
      .from('incidents')
      .select('id, title, description, severity')
      .in('status', ['open', 'in_review']).is('deleted_at', null)
      .eq('severity', 'critical')
      .limit(20),

    supabase
      .from('services')
      .select('id, service_code, scheduled_date, scheduled_start_time')
      .eq('status', 'scheduled')
      .lte('scheduled_date', today)
      .limit(30),

    supabase
      .from('operational_alerts')
      .select('id, title, severity')
      .eq('status', 'open')
      .in('severity', ['critical', 'high', 'medium'])
      .limit(20),
  ])

  const alerts: OpAlert[] = []

  // 1. Maintenance faults
  for (const m of (mResult.data ?? [])) {
// supabase-js sin tipos generados infiere las relaciones embebidas como arreglos;
    // en ejecución las many-to-one llegan como objeto, de ahí el doble cast.
    const plate = (m.vehicles as unknown as { plate: string | null } | null)?.plate ?? 'Sin patente'
    alerts.push({
      id:      `maint-${m.id}`,
      title:   'Falla crítica de vehículo',
      detail:  `${plate} · ${m.title ?? 'Sin título'}`,
      level:   m.priority === 'critical' ? 'critical' : 'high',
      source:  'maintenance',
      sortKey: 1,
    })
  }

  // 2 & 3. Driver license alerts
  const now = new Date()
  for (const d of (dResult.data ?? [])) {
    const days = daysUntil(d.license_expires_at!)
    if (days < 0) {
      alerts.push({
        id:      `lic-exp-${d.id}`,
        title:   'Licencia vencida',
        detail:  `${d.full_name ?? 'Conductor'} · Venció el ${fmtDate(d.license_expires_at)}`,
        level:   'critical',
        source:  'license',
        sortKey: 2,
      })
    } else if (days <= 7) {
      alerts.push({
        id:      `lic-7-${d.id}`,
        title:   'Licencia por vencer',
        detail:  `${d.full_name ?? 'Conductor'} · Vence en ${days} día${days !== 1 ? 's' : ''}`,
        level:   'high',
        source:  'license',
        sortKey: 3,
      })
    }
  }

  // 4. Overdue scheduled services
  for (const s of (sResult.data ?? [])) {
    const t  = s.scheduled_start_time ?? '00:00:00'
    const dt = new Date(`${s.scheduled_date}T${t}`)
    if (dt < now) {
      alerts.push({
        id:      `svc-${s.id}`,
        title:   'Ruta no iniciada',
        detail:  `${s.service_code ?? `#${s.id.slice(0, 8)}`} · ${fmtDate(s.scheduled_date)} ${fmtTime(s.scheduled_start_time)}`,
        level:   'high',
        source:  'service',
        sortKey: 4,
      })
    }
  }

  // 5. Critical incidents
  for (const inc of (iResult.data ?? [])) {
    alerts.push({
      id:      `inc-${inc.id}`,
      title:   'Incidencia crítica',
      detail:  inc.title ?? inc.description ?? 'Sin detalle',
      level:   'critical',
      source:  'incident',
      sortKey: 1,
    })
  }

  // 6. Operational alerts
  for (const oa of (oResult.data ?? [])) {
    const lvl = oa.severity === 'critical' ? 'critical' : oa.severity === 'high' ? 'high' : 'medium'
    alerts.push({
      id:      `oa-${oa.id}`,
      title:   oa.title ?? 'Alerta operacional',
      detail:  `Severidad: ${lvl}`,
      level:   lvl as OpAlertLevel,
      source:  'operational',
      sortKey: lvl === 'critical' ? 1 : lvl === 'high' ? 3 : 5,
    })
  }

  alerts.sort((a, b) => a.sortKey - b.sortKey || a.title.localeCompare(b.title))
  return alerts
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardAlertsModal() {
  const [open, setOpen]             = useState(false)
  const [alerts, setAlerts]         = useState<OpAlert[]>([])
  const [loading, setLoading]       = useState(false)

  const [search, setSearch]         = useState('')
  const [sourceFilter, setSFilter]  = useState<SourceFilter>('all')
  const [levelFilter, setLFilter]   = useState<LevelFilter>('all')
  const [page, setPage]             = useState(1)

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    const data = await fetchAlerts()
    setAlerts(data)
    setLoading(false)
  }, [])

  // Volver a la página 1 al cambiar un filtro (ajuste durante el render, sin efecto).
  const filterKey = String(search) + "|" + String(sourceFilter) + "|" + String(levelFilter)
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
    setOpen(false); setSearch(''); setSFilter('all'); setLFilter('all'); setPage(1); setAlerts([])
  }

  const filtered = alerts.filter(a => {
    if (search && ![a.title, a.detail].some(s => s.toLowerCase().includes(search.toLowerCase()))) return false
    if (sourceFilter !== 'all' && a.source !== sourceFilter) return false
    if (levelFilter  !== 'all' && a.level  !== levelFilter)  return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); loadAlerts() }}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border border-[#755538] bg-warn-bg hover:bg-[#453221] transition-colors cursor-pointer"
        style={{ color: '#10b98b' }}>
        Ver todas
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.52)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
          <div role="dialog" aria-modal="true" className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 760, maxHeight: '90vh' }}>

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#fda4af15' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fda4af" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Alertas de Operación</h2>
                  <p className="text-[11px] text-muted mt-0.5">Alertas críticas y de atención de toda la operación.</p>
                </div>
              </div>
              <button aria-label="Cerrar" onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-raised flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div className="relative flex-1 min-w-[160px]">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar alerta..."
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-line rounded-md bg-surface text-fg placeholder-muted focus:outline-none focus:ring-1 focus:ring-fg transition" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {SOURCE_FILTER_OPTIONS.map(o => (
                  <button key={o.key} type="button" onClick={() => setSFilter(o.key)}
                    className="px-2 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors whitespace-nowrap"
                    style={sourceFilter === o.key ? { backgroundColor: '#254b77', color: 'white' } : { backgroundColor: '#142942', color: '#a8b8cc', border: '1px solid #2b405b' }}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {LEVEL_FILTER_OPTIONS.map(o => (
                  <button key={o.key} type="button" onClick={() => setLFilter(o.key)}
                    className="px-2 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors whitespace-nowrap"
                    style={levelFilter === o.key ? { backgroundColor: '#254b77', color: 'white' } : { backgroundColor: '#142942', color: '#a8b8cc', border: '1px solid #2b405b' }}>
                    {o.label}
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
                  <p className="text-[13px] font-medium text-muted">Sin alertas activas</p>
                </div>
              ) : (
                <ul className="divide-y divide-raised">
                  {paginated.map(a => {
                    const st = LEVEL_STYLE[a.level]
                    return (
                      <li key={a.id} className="px-6 py-3.5 flex items-start gap-3">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: st.dot }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-fg leading-snug">{a.title}</p>
                          <p className="text-[11px] text-muted mt-0.5 leading-snug">{a.detail}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: st.bg, color: st.text }}>
                            {st.label}
                          </span>
                          <span className="text-[9px] text-muted">{SOURCE_LABELS[a.source]}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              {totalPages > 1 ? (
                <p className="text-[11px] text-muted">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}</p>
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
