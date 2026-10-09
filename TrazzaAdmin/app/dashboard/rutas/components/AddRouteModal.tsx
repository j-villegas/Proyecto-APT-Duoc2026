'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PlacesAutocompleteInput, { type PlaceResult } from '@/app/dashboard/components/PlacesAutocompleteInput'

// ─── Dropdown option types ────────────────────────────────────────────────────

type ContractOption = {
  id: string
  contract_name: string | null
  client_name: string | null
}

type DriverOption = {
  id: string
  full_name: string | null
}

type VehicleOption = {
  id: string
  plate: string | null
  brand: string | null
  model: string | null
}

type ContractPassengerOption = {
  passenger_id: string
  full_name: string
  rut: string | null
}

// ─── Location entry ───────────────────────────────────────────────────────────
// `text`    — what's displayed in the input field
// `address` — formatted_address from Places (may equal text if typed manually)
// `lat/lng` — set only when user selects a Places suggestion; null otherwise

type LocationEntry = {
  text: string
  address: string
  lat: number | null
  lng: number | null
}

// A "stop" is now always tied to one of the contract's passengers — the
// admin only fills in the pickup/dropoff address, the name is fixed.
type StopEntry = LocationEntry & { localId: string; passengerId: string; fullName: string }

// ─── Form data ────────────────────────────────────────────────────────────────

type FormData = {
  contract_id: string
  route_code: string
  origin: LocationEntry
  destination: LocationEntry
  stops: StopEntry[]
  driver_id: string
  vehicle_id: string
  scheduled_datetime: string
}

const EMPTY_LOC: LocationEntry = { text: '', address: '', lat: null, lng: null }

const EMPTY_FORM: FormData = {
  contract_id: '',
  route_code: '',
  origin: EMPTY_LOC,
  destination: EMPTY_LOC,
  stops: [],
  driver_id: '',
  vehicle_id: '',
  scheduled_datetime: '',
}

// ─── Field validation ─────────────────────────────────────────────────────────

type FieldErrors = {
  contract_id?: string
  route_code?: string
  origin?: string
  destination?: string
  driver_id?: string
  vehicle_id?: string
  scheduled_datetime?: string
  stops?: string
}

function validate(form: FormData, contractPassengerCount: number): FieldErrors {
  const e: FieldErrors = {}
  if (!form.contract_id)              e.contract_id      = 'Selecciona un contrato.'
  else if (contractPassengerCount === 0) e.contract_id    = 'Este contrato no tiene pasajeros registrados.'
  if (!form.route_code.trim())        e.route_code       = 'El ID de ruta es obligatorio.'
  if (!form.origin.text.trim())       e.origin           = 'El origen es obligatorio.'
  if (!form.destination.text.trim())  e.destination      = 'El destino es obligatorio.'
  if (!form.driver_id)                e.driver_id        = 'Selecciona un conductor.'
  if (!form.vehicle_id)               e.vehicle_id       = 'Selecciona un vehículo.'
  if (!form.scheduled_datetime)       e.scheduled_datetime = 'La fecha y hora son obligatorias.'
  if (form.contract_id && contractPassengerCount > 0 && form.stops.some(s => !s.text.trim())) {
    e.stops = 'Completa la dirección de todos los pasajeros.'
  }
  return e
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

async function generateUniqueCode(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = ''
    for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)]
    const { data } = await supabase
      .from('passenger_service_access')
      .select('id')
      .eq('company_id', companyId)
      .eq('access_code', code)
      .maybeSingle()
    if (!data) return code
  }
  throw new Error('No se pudo generar un código de acceso único.')
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[12px] border border-[#2b405b] rounded-md bg-[#142942] text-[#f1f5f9] ' +
  'placeholder-[#a8b8cc] focus:outline-none focus:ring-1 focus:ring-[#10b98b] focus:border-[#10b98b] transition'

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-[#a8b8cc] mb-1'

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, error, children }: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error && <p className="text-[11px] text-rose-300 mt-1">{error}</p>}
    </div>
  )
}

// ─── Coordinate indicator ─────────────────────────────────────────────────────

function CoordIndicator({ entry }: { entry: LocationEntry }) {
  if (!entry.text.trim()) return null
  const confirmed = entry.lat !== null && entry.lng !== null
  return (
    <div className={`flex items-center gap-1 mt-1 ${confirmed ? 'text-emerald-300' : 'text-[#a8b8cc]'}`}>
      {confirmed ? (
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      )}
      <span className="text-[10px] font-medium">
        {confirmed ? 'Ubicación confirmada' : 'Coordenadas pendientes'}
      </span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddRouteModal() {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const [form, setForm]       = useState<FormData>(EMPTY_FORM)
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [drivers, setDrivers]    = useState<DriverOption[]>([])
  const [vehicles, setVehicles]  = useState<VehicleOption[]>([])
  const [contractPassengers, setContractPassengers] = useState<ContractPassengerOption[]>([])
  const [loadingPassengers, setLoadingPassengers]   = useState(false)

  // ── Load dropdown options when modal opens ──
  const loadOptions = useCallback(async () => {
    setLoadingOptions(true)
    const supabase = createClient()
    const [c, d, v] = await Promise.all([
      supabase
        .from('contracts')
        .select('id, contract_name, client_name')
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('client_name', { ascending: true }),

      supabase
        .from('drivers')
        .select('id, full_name')
        .in('status', ['available', 'rest'])
        .is('deleted_at', null)
        .order('full_name', { ascending: true }),

      supabase
        .from('vehicles')
        .select('id, plate, brand, model')
        .eq('status', 'available')
        .is('deleted_at', null)
        .order('plate', { ascending: true }),
    ])
    setContracts((c.data ?? []) as ContractOption[])
    setDrivers((d.data ?? []) as DriverOption[])
    setVehicles((v.data ?? []) as VehicleOption[])
    setLoadingOptions(false)
  }, [])

  useEffect(() => {
    if (open) loadOptions()
  }, [open, loadOptions])

  // ── Load contract passengers whenever the selected contract changes ──
  useEffect(() => {
    if (!form.contract_id) {
      setContractPassengers([])
      setForm(prev => (prev.stops.length ? { ...prev, stops: [] } : prev))
      return
    }
    let cancelled = false
    const contractId = form.contract_id
    setLoadingPassengers(true)
    const supabase = createClient()

    async function loadContractPassengers() {
      const { data } = await supabase
        .from('contract_passengers')
        .select('passenger_id, passengers ( id, full_name, rut )')
        .eq('contract_id', contractId)
        .is('deleted_at', null)

      if (cancelled) return
      const list: ContractPassengerOption[] = (data ?? []).map(row => {
        const p = Array.isArray(row.passengers) ? row.passengers[0] : row.passengers
        return {
          passenger_id: row.passenger_id,
          full_name: p?.full_name ?? 'Pasajero',
          rut: p?.rut ?? null,
        }
      })
      setContractPassengers(list)
      setForm(prev => ({
        ...prev,
        stops: list.map(p => ({
          localId: p.passenger_id,
          passengerId: p.passenger_id,
          fullName: p.full_name,
          text: '', address: '', lat: null, lng: null,
        })),
      }))
      setLoadingPassengers(false)
    }

    loadContractPassengers()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contract_id])

  // ── Close on Escape ──
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose() {
    setOpen(false)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setSubmitError(null)
    setContractPassengers([])
  }

  // ── Simple scalar field setter ──
  function set<K extends keyof Omit<FormData, 'origin' | 'destination' | 'stops'>>(
    key: K,
    value: FormData[K],
  ) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key in fieldErrors) setFieldErrors(prev => ({ ...prev, [key]: undefined }))
  }

  // ── Location field setter (origin / destination) ──
  function setLoc(field: 'origin' | 'destination', entry: LocationEntry) {
    setForm(prev => ({ ...prev, [field]: entry }))
    setFieldErrors(prev => ({ ...prev, [field]: undefined }))
  }

  // ── Passenger pickup/dropoff address management ──
  function updateStopAddressText(localId: string, text: string) {
    setForm(prev => ({
      ...prev,
      stops: prev.stops.map(s =>
        s.localId === localId ? { ...s, text, address: '', lat: null, lng: null } : s,
      ),
    }))
  }

  function setStopPlace(localId: string, result: PlaceResult) {
    setForm(prev => ({
      ...prev,
      stops: prev.stops.map(s =>
        s.localId === localId
          ? { ...s, text: result.name, address: result.address, lat: result.lat, lng: result.lng }
          : s,
      ),
    }))
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validate(form, contractPassengers.length)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setLoading(true)
    setSubmitError(null)

    const supabase = createClient()

    // Snapshot all values immediately — never read form state again after this point
    const routeCode         = form.route_code.trim()
    const contractId        = form.contract_id
    const driverId          = form.driver_id
    const vehicleId         = form.vehicle_id
    const scheduledDatetime = form.scheduled_datetime

    const originName    = form.origin.text.trim()
    const originAddress = form.origin.address || originName
    const originLat     = form.origin.lat
    const originLng     = form.origin.lng

    const destName    = form.destination.text.trim()
    const destAddress = form.destination.address || destName
    const destLat     = form.destination.lat
    const destLng     = form.destination.lng

    const intermediateStops = form.stops.filter(s => s.text.trim())

    let createdRouteId: string | null = null

    try {
      // ── Auth + profile ──────────────────────────────────────────────────────
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

      const companyId = profile.company_id

      if (process.env.NODE_ENV === 'development') {
        console.log('[AddRouteModal] Enviando:', {
          routeCode, companyId, contractId, driverId, vehicleId, scheduledDatetime,
          originLat, originLng, destLat, destLng,
        })
      }

      // ── Pre-flight: check for duplicate route_code ──────────────────────────
      const { data: existing, error: checkErr } = await supabase
        .from('routes')
        .select('id')
        .eq('company_id', companyId)
        .eq('route_code', routeCode)
        .is('deleted_at', null)
        .maybeSingle()

      if (checkErr) throw new Error(`Error al verificar el código de ruta: ${checkErr.message}`)

      if (existing) {
        setFieldErrors(prev => ({
          ...prev,
          route_code: 'Ya existe una ruta con este código. Usa otro ID de ruta.',
        }))
        return
      }

      // ── Parse datetime ──────────────────────────────────────────────────────
      const [scheduled_date, scheduled_start_time] = scheduledDatetime.split('T')

      // ── Paso 1/4: Insert route ──────────────────────────────────────────────
      const { data: routeData, error: routeErr } = await supabase
        .from('routes')
        .insert({
          company_id:       companyId,
          contract_id:      contractId,
          route_code:       routeCode,
          name:             routeCode,
          origin_name:      originName,
          destination_name: destName,
          status:           'active',
        })
        .select('id')
        .single()

      if (routeErr || !routeData) {
        const msg = routeErr?.message ?? ''
        if (
          msg.includes('routes_unique_code_per_company') ||
          msg.includes('duplicate key') ||
          msg.includes('unique constraint')
        ) {
          setFieldErrors(prev => ({
            ...prev,
            route_code: 'Ya existe una ruta con este código. Usa otro ID de ruta.',
          }))
          return
        }
        throw new Error(`[Paso 1/4] Error al crear la ruta: ${msg || 'sin respuesta'}`)
      }

      createdRouteId = routeData.id

      // ── Paso 2/4: Insert route_stops ────────────────────────────────────────
      const routeStopsPayload: Array<{
        company_id: string; route_id: string; stop_order: number; stop_type: string
        name: string; address: string; latitude: number | null; longitude: number | null
      }> = []

      routeStopsPayload.push({
        company_id: companyId, route_id: createdRouteId,
        stop_order: 1, stop_type: 'origin',
        name: originName, address: originAddress,
        latitude: originLat, longitude: originLng,
      })

      const stopOrderToPassengerId = new Map<number, string>()

      intermediateStops.forEach((s, i) => {
        const stopOrder = i + 2
        routeStopsPayload.push({
          company_id: companyId, route_id: createdRouteId!,
          stop_order: stopOrder, stop_type: 'pickup',
          name: s.fullName, address: s.address || s.text.trim(),
          latitude: s.lat, longitude: s.lng,
        })
        stopOrderToPassengerId.set(stopOrder, s.passengerId)
      })

      routeStopsPayload.push({
        company_id: companyId, route_id: createdRouteId,
        stop_order: intermediateStops.length + 2, stop_type: 'destination',
        name: destName, address: destAddress,
        latitude: destLat, longitude: destLng,
      })

      if (process.env.NODE_ENV === 'development') {
        console.log('[AddRouteModal] route_stops payload:', JSON.stringify(routeStopsPayload, null, 2))
      }

      const { data: routeStopsData, error: stopsErr } = await supabase
        .from('route_stops')
        .insert(routeStopsPayload)
        .select('id, stop_order, stop_type, name, address, latitude, longitude')

      if (stopsErr) {
        await supabase.from('routes').delete().eq('id', createdRouteId)
        createdRouteId = null
        throw new Error(
          `[Paso 2/4] Error al crear las paradas. La ruta fue eliminada para evitar registros huérfanos. Inténtalo de nuevo.\nDetalle: ${stopsErr.message}`
        )
      }

      // ── Paso 3/4: Insert service ────────────────────────────────────────────
      const { data: serviceData, error: serviceErr } = await supabase
        .from('services')
        .insert({
          company_id:           companyId,
          contract_id:          contractId,
          route_id:             createdRouteId,
          service_code:         routeCode,
          scheduled_date,
          scheduled_start_time,
          driver_id:            driverId,
          vehicle_id:           vehicleId,
          status:               'scheduled',
        })
        .select('id')
        .single()

      if (serviceErr || !serviceData) {
        await supabase.from('routes').delete().eq('id', createdRouteId)
        createdRouteId = null
        const msg = serviceErr?.message ?? 'sin respuesta'
        throw new Error(
          `[Paso 3/4] Error al crear el servicio. La ruta fue eliminada para evitar registros huérfanos. Inténtalo de nuevo.\nDetalle: ${msg}`
        )
      }

      const serviceId = serviceData.id

      // ── Paso 4/4: Insert service_stops ──────────────────────────────────────
      if (routeStopsData && routeStopsData.length > 0) {
        const serviceStopsPayload = routeStopsData.map(rs => ({
          company_id:    companyId,
          service_id:    serviceId,
          route_stop_id: rs.id,
          stop_order:    rs.stop_order,
          stop_type:     rs.stop_type,
          name:          rs.name,
          address:       rs.address ?? null,
          latitude:      rs.latitude ?? null,
          longitude:     rs.longitude ?? null,
          status:        'pending',
        }))

        const { data: serviceStopsData, error: ssErr } = await supabase
          .from('service_stops')
          .insert(serviceStopsPayload)
          .select('id, stop_order, stop_type')

        if (ssErr) {
          throw new Error(
            `[Paso 4/4] La ruta y el servicio fueron creados, pero falló el registro de paradas de servicio. El registro principal existe — actualiza la página.\nDetalle: ${ssErr.message}`
          )
        }

        // ── Paso 5/5: Asignar pasajeros + generar códigos de acceso ────────────
        const pickupStops = (serviceStopsData ?? []).filter(ss => ss.stop_type === 'pickup')
        if (pickupStops.length > 0) {
          try {
            for (const ss of pickupStops) {
              const passengerId = stopOrderToPassengerId.get(ss.stop_order)
              if (!passengerId) continue

              const { data: spData, error: spErr } = await supabase
                .from('service_passengers')
                .insert({
                  company_id: companyId, service_id: serviceId,
                  passenger_id: passengerId, service_stop_id: ss.id,
                  attendance_status: 'pending',
                })
                .select('id').single()
              if (spErr || !spData) throw new Error(spErr?.message ?? 'sin respuesta')

              const accessCode = await generateUniqueCode(supabase, companyId)
              const { error: psaErr } = await supabase
                .from('passenger_service_access')
                .insert({
                  company_id: companyId, service_id: serviceId, passenger_id: passengerId,
                  service_passenger_id: spData.id, access_code: accessCode, status: 'active',
                })
              if (psaErr) throw new Error(psaErr.message)
            }
          } catch (passengerErr: unknown) {
            const msg = passengerErr instanceof Error ? passengerErr.message : 'sin respuesta'
            throw new Error(
              `[Paso 5/5] La ruta y el servicio fueron creados, pero falló la asignación de pasajeros. El registro principal existe — actualiza la página y revisa "Gestionar Pasajeros".\nDetalle: ${msg}`
            )
          }
        }
      }

      // ── Éxito ───────────────────────────────────────────────────────────────
      handleClose()
      router.refresh()

    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error desconocido. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-[#0d1d37] transition-opacity hover:opacity-90 cursor-pointer"
        style={{ backgroundColor: '#10b98b' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Añadir Nueva Ruta
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,22,54,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div
            className="bg-[#142942] rounded-lg border border-[#2b405b] w-full flex flex-col"
            style={{ maxWidth: 860, maxHeight: '90vh' }}
          >
            {/* ── Header ── */}
            <div
              className="flex items-start justify-between px-6 py-4 border-b border-[#2b405b] flex-shrink-0"
              style={{ backgroundColor: '#10223d' }}
            >
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: '#f1f5f9' }}>
                  Crear Nueva Ruta
                </h2>
                <p className="text-[11px] text-[#a8b8cc] mt-0.5">
                  Configure los parámetros de despacho y asignación de activos.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[#a8b8cc] hover:text-[#f1f5f9] hover:bg-[#2b405b] transition-colors flex-shrink-0 cursor-pointer mt-0.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ── */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* Global submit error */}
                {submitError && (
                  <div className="flex items-start gap-2.5 bg-[#3d2332] border border-[#794052] text-rose-200 rounded-md px-4 py-3 mb-5 text-[12px]">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {submitError}
                  </div>
                )}

                {loadingOptions ? (
                  <div className="flex items-center justify-center py-10 text-[12px] text-[#a8b8cc] gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cargando opciones...
                  </div>
                ) : (
                  <div className="space-y-5">

                    {/* Row 1 — Contrato full width */}
                    <Field label="Contrato Activo" error={fieldErrors.contract_id}>
                      <select
                        value={form.contract_id}
                        onChange={e => set('contract_id', e.target.value)}
                        className={inputCls}
                      >
                        <option value="">— Selecciona un contrato —</option>
                        {contracts.length === 0 && (
                          <option disabled>Sin contratos activos disponibles</option>
                        )}
                        {contracts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.client_name ?? ''}
                            {c.contract_name ? ` · ${c.contract_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>

                    {/* Row 2 — ID Ruta | Conductor */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="ID de Ruta / Código" error={fieldErrors.route_code}>
                        <input
                          type="text"
                          placeholder="Ej: R-ANT-001"
                          value={form.route_code}
                          onChange={e => set('route_code', e.target.value)}
                          className={inputCls}
                        />
                      </Field>

                      <Field label="Conductor" error={fieldErrors.driver_id}>
                        <select
                          value={form.driver_id}
                          onChange={e => set('driver_id', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">— Selecciona un conductor —</option>
                          {drivers.length === 0 && (
                            <option disabled>Sin conductores disponibles</option>
                          )}
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.full_name ?? d.id}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    {/* Row 3 — Origen | Vehículo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Origen" error={fieldErrors.origin}>
                        <PlacesAutocompleteInput
                          value={form.origin.text}
                          onChange={text => setLoc('origin', { text, address: '', lat: null, lng: null })}
                          onPlaceSelect={r => setLoc('origin', { text: r.name, address: r.address, lat: r.lat, lng: r.lng })}
                          placeholder="Ciudad o Terminal de Origen"
                          className={inputCls}
                        />
                        <CoordIndicator entry={form.origin} />
                      </Field>

                      <Field label="Vehículo" error={fieldErrors.vehicle_id}>
                        <select
                          value={form.vehicle_id}
                          onChange={e => set('vehicle_id', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">— Selecciona un vehículo —</option>
                          {vehicles.length === 0 && (
                            <option disabled>Sin vehículos disponibles</option>
                          )}
                          {vehicles.map(v => (
                            <option key={v.id} value={v.id}>
                              {[v.plate, v.brand, v.model].filter(Boolean).join(' · ')}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    {/* Row 4 — Destino | Fecha y Hora */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Destino Final" error={fieldErrors.destination}>
                        <PlacesAutocompleteInput
                          value={form.destination.text}
                          onChange={text => setLoc('destination', { text, address: '', lat: null, lng: null })}
                          onPlaceSelect={r => setLoc('destination', { text: r.name, address: r.address, lat: r.lat, lng: r.lng })}
                          placeholder="Ciudad o Terminal de Destino"
                          className={inputCls}
                        />
                        <CoordIndicator entry={form.destination} />
                      </Field>

                      <Field label="Fecha y Hora de Salida" error={fieldErrors.scheduled_datetime}>
                        <input
                          type="datetime-local"
                          value={form.scheduled_datetime}
                          onChange={e => set('scheduled_datetime', e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    {/* Row 5 — Pasajeros del contrato full width */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={labelCls}>Pasajeros del Contrato</span>
                        {contractPassengers.length > 0 && (
                          <span className="text-[10px] text-[#a8b8cc]">
                            {contractPassengers.length} pasajero{contractPassengers.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {!form.contract_id ? (
                        <div
                          className="border border-dashed border-[#2b405b] rounded-md px-4 py-3 text-center"
                          style={{ backgroundColor: '#10223d' }}
                        >
                          <p className="text-[11px] text-[#a8b8cc]">Selecciona un contrato para ver sus pasajeros.</p>
                        </div>
                      ) : loadingPassengers ? (
                        <div className="flex items-center justify-center py-4 text-[11px] text-[#a8b8cc] gap-2">
                          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Cargando pasajeros...
                        </div>
                      ) : contractPassengers.length === 0 ? (
                        <div className="border border-dashed border-[#794052] bg-[#3d2332] rounded-md px-4 py-3 text-center">
                          <p className="text-[11px] text-rose-300">
                            Este contrato no tiene pasajeros registrados. Agrega pasajeros al contrato antes de crear la ruta.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {form.stops.map((stop, idx) => (
                            <div key={stop.localId}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                  style={{ backgroundColor: '#a8b8cc' }}
                                >
                                  {idx + 1}
                                </span>
                                <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: '#f1f5f9', minWidth: 140 }}>
                                  {stop.fullName}
                                </span>
                                <PlacesAutocompleteInput
                                  value={stop.text}
                                  onChange={text => updateStopAddressText(stop.localId, text)}
                                  onPlaceSelect={r => setStopPlace(stop.localId, r)}
                                  placeholder="Dirección de recogida / destino"
                                  className={inputCls + ' flex-1'}
                                />
                              </div>
                              <div className="pl-7">
                                <CoordIndicator entry={stop} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {fieldErrors.stops && <p className="text-[11px] text-rose-300 mt-2">{fieldErrors.stops}</p>}
                    </div>

                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2b405b] flex-shrink-0" style={{ backgroundColor: '#10223d' }}>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold border border-[#2b405b] text-[#a8b8cc] hover:bg-[#2b405b] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || loadingOptions}
                  className="flex items-center gap-2 px-5 py-2 rounded-md text-[12px] font-semibold text-[#0d1d37] transition-opacity disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: '#10b98b' }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creando...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Crear Ruta
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
