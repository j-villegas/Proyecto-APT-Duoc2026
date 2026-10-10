'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentTypeOption = { id: string; name: string }

const FALLBACK_TYPES: IncidentTypeOption[] = [
  { id: '__falla_mecanica',           name: 'Falla mecánica' },
  { id: '__retraso_trafico',          name: 'Retraso por tráfico' },
  { id: '__pasajero_no_se_presenta',  name: 'Pasajero no se presenta' },
  { id: '__desvio_ruta',              name: 'Desvío de ruta' },
  { id: '__problema_operacional',     name: 'Problema operacional' },
]

type Severity = 'low' | 'medium' | 'high' | 'critical'

const SEVERITY_OPTIONS: { value: Severity; label: string; bg: string; text: string; border: string }[] = [
  { value: 'low',      label: 'Baja',    bg: '#203650', text: '#bac9db', border: '#3b526d' },
  { value: 'medium',   label: 'Media',   bg: '#3b3020', text: '#f8cb78', border: '#fcd34d' },
  { value: 'high',     label: 'Alta',    bg: '#3b3020', text: '#fdba74', border: '#fb923c' },
  { value: 'critical', label: 'Crítica', bg: '#3d2332', text: '#fda4af', border: '#fca5a5' },
]

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[12px] border border-line rounded-md bg-surface text-fg ' +
  'placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition'

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1'

function Field({ label, error, required, children }: {
  label: string; error?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-rose-300 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-rose-300 mt-1">{error}</p>}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  serviceId: string
  serviceCode: string | null
  routeId: string | null
  vehicleId: string | null
  driverId: string | null
  plate: string | null
  driverName: string | null
  serviceStatus: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportIncidentModal({
  serviceId,
  serviceCode,
  routeId,
  vehicleId,
  driverId,
  plate,
  driverName,
  serviceStatus,
}: Props) {
  const router = useRouter()

  const [open, setOpen]                         = useState(false)
  const [incidentTypes, setIncidentTypes]       = useState<IncidentTypeOption[]>([])
  const [loadingTypes, setLoadingTypes]         = useState(false)
  const [selectedTypeId, setSelectedTypeId]     = useState('')
  const [severity, setSeverity]                 = useState<Severity>('medium')
  const [description, setDescription]           = useState('')
  const [errors, setErrors]                     = useState<Record<string, string>>({})
  const [submitError, setSubmitError]           = useState<string | null>(null)
  const [loading, setLoading]                   = useState(false)

  // ── Load incident types ────────────────────────────────────────────────────

  const loadTypes = useCallback(async () => {
    setLoadingTypes(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('incident_types')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
    setIncidentTypes(data && data.length > 0 ? (data as IncidentTypeOption[]) : FALLBACK_TYPES)
    setLoadingTypes(false)
  }, [])


  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
   
  }, [open])

  function handleClose() {
    setOpen(false)
    setSelectedTypeId('')
    setSeverity('medium')
    setDescription('')
    setErrors({})
    setSubmitError(null)
  }

  function clearError(key: string) {
    if (errors[key]) setErrors(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const newErrors: Record<string, string> = {}
    if (!selectedTypeId)       newErrors.type        = 'Selecciona el tipo de incidencia.'
    if (!severity)             newErrors.severity    = 'Selecciona la gravedad.'
    if (!description.trim())   newErrors.description = 'La descripción es obligatoria.'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    setLoading(true)
    setSubmitError(null)

    const supabase = createClient()

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('id, company_id').eq('id', user.id).single()
      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const companyId  = profile.company_id
      const isFallback = selectedTypeId.startsWith('__')
      const typeName   = incidentTypes.find(t => t.id === selectedTypeId)?.name ?? selectedTypeId

      const incidentPayload: Record<string, unknown> = {
        company_id:              companyId,
        service_id:              serviceId,
        reported_by_type:        'admin',
        reported_by_profile_id:  profile.id,
        severity,
        status:                  'open',
        title:                   typeName,
        description:             description.trim(),
        occurred_at:             new Date().toISOString(),
        reported_at:             new Date().toISOString(),
      }

      if (!isFallback)  incidentPayload.incident_type_id = selectedTypeId
      if (routeId)      incidentPayload.route_id         = routeId
      if (vehicleId)    incidentPayload.vehicle_id       = vehicleId
      if (driverId)     incidentPayload.driver_id        = driverId

      const { data: incident, error: incidentErr } = await supabase
        .from('incidents').insert(incidentPayload).select('id').single()
      if (incidentErr) throw new Error(friendlyError(incidentErr, 'No se pudo registrar la incidencia'))

      // Bitácora: no bloquea el reporte si falla (la incidencia ya se guardó).
      await supabase.from('service_events').insert({
        company_id: companyId,
        service_id: serviceId,
        actor_type: 'admin',
        actor_id:   profile.id,
        event_type: 'incident_reported',
        payload:    { source: 'panel', incident_id: incident?.id ?? null, title: typeName, severity },
      })

      handleClose()
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const titleCode  = serviceCode ?? `#${serviceId.slice(0, 8).toUpperCase()}`
  const contextLabel =
    serviceStatus === 'in_progress' ? 'Ruta Activa' :
    serviceStatus === 'scheduled'   ? 'Ruta Programada' :
    serviceStatus === 'overdue'     ? 'Ruta No Iniciada' : 'Ruta'

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger — full-width action button */}
      <button
        onClick={() => { setOpen(true); loadTypes() }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-danger-line text-[12px] font-medium text-rose-300 hover:bg-danger-bg transition-colors text-left cursor-pointer"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="flex-1">Reportar Incidencia</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.50)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-lg border border-line w-full flex flex-col"
            style={{ maxWidth: 580, maxHeight: '92vh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>Reportar Incidencia</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Registra un evento operacional asociado a esta ruta.
                </p>
              </div>
              <button aria-label="Cerrar"
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-line transition-colors cursor-pointer mt-0.5 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Context banner */}
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-md border"
                  style={{ backgroundColor: '#10223d', borderColor: '#2b405b' }}
                >
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0"
                    style={{ backgroundColor: '#254b77', color: 'white' }}
                  >
                    {contextLabel}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold truncate" style={{ color: '#f1f5f9' }}>
                      Ruta {titleCode}
                    </p>
                    <p className="text-[11px] text-muted truncate mt-0.5">
                      {[plate ? `Vehículo ${plate}` : null, driverName ? `Conductor ${driverName}` : null]
                        .filter(Boolean).join(' · ') || 'Sin asignación registrada'}
                    </p>
                  </div>
                </div>

                {submitError && (
                  <div className="flex items-start gap-2.5 bg-danger-bg border border-danger-line text-rose-200 rounded-md px-4 py-3 text-[12px]">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {submitError}
                  </div>
                )}

                {/* Tipo de incidencia */}
                <Field label="Tipo de Incidencia" required error={errors.type}>
                  {loadingTypes ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-line rounded-md text-[12px] text-muted">
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Cargando tipos...
                    </div>
                  ) : (
                    <select
                      value={selectedTypeId}
                      onChange={e => { setSelectedTypeId(e.target.value); clearError('type') }}
                      className={inputCls}
                    >
                      <option value="">— Seleccionar tipo —</option>
                      {incidentTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </Field>

                {/* Gravedad */}
                <div>
                  <label className={labelCls}>
                    Gravedad<span className="text-rose-300 ml-0.5">*</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {SEVERITY_OPTIONS.map(opt => {
                      const active = severity === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => { setSeverity(opt.value); clearError('severity') }}
                          className="px-3 py-2 rounded-md border text-[11px] font-semibold transition-all cursor-pointer text-center"
                          style={{
                            backgroundColor: active ? opt.bg  : 'white',
                            color:           active ? opt.text : '#a8b8cc',
                            borderColor:     active ? opt.border : '#2b405b',
                            boxShadow:       active ? `0 0 0 2px ${opt.border}` : undefined,
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  {errors.severity && <p className="text-[11px] text-rose-300 mt-1">{errors.severity}</p>}
                </div>

                {/* Descripción */}
                <Field label="Descripción Detallada" required error={errors.description}>
                  <textarea
                    rows={4}
                    placeholder="Proporcione detalles adicionales sobre la incidencia..."
                    value={description}
                    onChange={e => { setDescription(e.target.value); clearError('description') }}
                    className={inputCls + ' resize-none'}
                  />
                </Field>

              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
                <button type="button" onClick={handleClose} disabled={loading}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold border border-line text-muted hover:bg-line transition-colors disabled:opacity-50 cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-canvas transition-opacity disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: '#10b98b' }}>
                  {loading ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      Enviar Reporte
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
