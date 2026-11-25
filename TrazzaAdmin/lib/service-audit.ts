// Vocabulario de la auditoría de servicios (migración 030): anomalías que
// detecta consolidate_service_metrics, estados de auditoría y tipos de
// evento de la bitácora, más helpers para comparar estimado vs. real.

export type AuditStatus = 'pending' | 'approved' | 'observed'

export const AUDIT_STATUS: Record<AuditStatus, { label: string; bg: string; text: string }> = {
  pending:  { label: 'Sin auditar', bg: '#203650', text: '#bac9db' },
  approved: { label: 'Aprobado',    bg: '#123b35', text: '#55d9ad' },
  observed: { label: 'Observado',   bg: '#3b3020', text: '#fdba74' },
}

export function auditStatusMeta(status: string | null) {
  return AUDIT_STATUS[(status ?? 'pending') as AuditStatus] ?? AUDIT_STATUS.pending
}

export type AnomalySeverity = 'high' | 'medium' | 'low'

export const ANOMALIES: Record<string, { label: string; severity: AnomalySeverity; hint: string }> = {
  late_start:            { label: 'Inicio tardío',          severity: 'medium', hint: 'Inició más de 15 min después de lo programado.' },
  duration_over:         { label: 'Duración excedida',      severity: 'medium', hint: 'Duró más de un 30 % (y 10 min) sobre lo estimado.' },
  duration_under:        { label: 'Duración muy corta',     severity: 'high',   hint: 'Duró menos de la mitad de lo estimado.' },
  distance_deviation:    { label: 'Desvío de distancia',    severity: 'high',   hint: 'La distancia recorrida difiere más de un 30 % de la estimada.' },
  no_gps:                { label: 'Sin GPS',                severity: 'high',   hint: 'No hay posiciones registradas durante el servicio.' },
  gps_gaps:              { label: 'GPS con huecos',         severity: 'medium', hint: 'Hubo más de 5 min sin posiciones.' },
  simulated_gps:         { label: 'GPS simulado',           severity: 'high',   hint: 'El recorrido se generó en modo demostración.' },
  skipped_stops:         { label: 'Paradas saltadas',       severity: 'medium', hint: 'El conductor saltó paradas.' },
  unconfirmed_stops:     { label: 'Paradas sin confirmar',  severity: 'low',    hint: 'Terminó con paradas sin marcar.' },
  passenger_no_show:     { label: 'Pasajero no se presentó', severity: 'low',   hint: 'Hay pasajeros marcados como ausentes.' },
  incidents:             { label: 'Con incidentes',         severity: 'medium', hint: 'Se reportaron incidentes en el servicio.' },
  closed_by_admin:       { label: 'Cerrado por la central', severity: 'low',    hint: 'Lo finalizó un administrador, no el conductor.' },
  cancelled_in_progress: { label: 'Cancelado en curso',     severity: 'high',   hint: 'Se canceló después de iniciado.' },
}

const SEVERITY_COLORS: Record<AnomalySeverity, { bg: string; text: string }> = {
  high:   { bg: '#3d2332', text: '#fda4af' },
  medium: { bg: '#3b3020', text: '#fdba74' },
  low:    { bg: '#203650', text: '#bac9db' },
}

export function anomalyMeta(code: string) {
  const meta = ANOMALIES[code] ?? { label: code, severity: 'low' as const, hint: '' }
  return { ...meta, ...SEVERITY_COLORS[meta.severity] }
}

export const EVENT_LABELS: Record<string, string> = {
  service_requested:   'Viaje solicitado por el pasajero',
  service_published:   'Publicado en la bolsa de viajes',
  service_accepted:    'Conductor tomó el viaje',
  request_cancelled:   'Solicitud cancelada por el pasajero',
  service_started:     'Inicio del servicio',
  stop_arrived:        'Llegada a parada',
  stop_completed:      'Parada completada',
  stop_skipped:        'Parada saltada',
  passenger_boarded:   'Pasajero abordó',
  passenger_no_show:   'Pasajero no se presentó',
  incident_reported:   'Incidente reportado',
  vehicle_changed:     'Cambio de vehículo',
  driver_changed:      'Cambio de conductor',
  location_shared:     'Ubicación compartida',
  note_added:          'Nota agregada',
  schedule_updated:    'Programación modificada',
  service_finished:    'Servicio finalizado',
  service_cancelled:   'Servicio cancelado',
  metrics_consolidated: 'Métricas consolidadas',
  service_audited:     'Auditoría registrada',
}

export const ACTOR_LABELS: Record<string, string> = {
  admin: 'Central', driver: 'Conductor', passenger: 'Pasajero', system: 'Sistema',
}

/** Desviación porcentual de `actual` respecto de `estimated` (null si falta alguno). */
export function deviationPct(estimated: number | null | undefined, actual: number | null | undefined): number | null {
  if (estimated === null || estimated === undefined || actual === null || actual === undefined) return null
  const est = Number(estimated)
  const act = Number(actual)
  if (!Number.isFinite(est) || !Number.isFinite(act) || est <= 0) return null
  return Math.round(((act - est) / est) * 100)
}

/** "+12 %", "−8 %", "0 %" o "—". */
export function formatDeviation(pct: number | null): string {
  if (pct === null) return '—'
  if (pct === 0) return '0 %'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`
}

/** Color de la desviación: verde dentro de ±15 %, ámbar hasta ±30 %, rojo más allá. */
export function deviationColor(pct: number | null): string {
  if (pct === null) return '#a8b8cc'
  const abs = Math.abs(pct)
  if (abs <= 15) return '#55d9ad'
  if (abs <= 30) return '#fdba74'
  return '#fda4af'
}

export function formatMinutes(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(Math.round(n))
  if (abs < 60) return `${sign}${abs} min`
  return `${sign}${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, '0')} min`
}

export function formatKm(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} km` : '—'
}

/** Fecha y hora en Chile: "19-11-2026 18:30". */
export function formatDateTimeCL(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
