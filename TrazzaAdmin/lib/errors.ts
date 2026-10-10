// Traduce errores de Supabase/Postgres/red a mensajes para personas.
// Ningún componente debería mostrar `error.message` de la base directamente.

type ErrorLike = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
  status?: number
  name?: string
}

const DEFAULT_MESSAGE = 'Ocurrió un problema inesperado. Inténtalo de nuevo y, si se repite, avísanos.'

// Restricciones únicas (23505), por nombre de constraint.
const UNIQUE_MESSAGES: Record<string, string> = {
  vehicles_unique_plate_per_company: 'Ya existe un vehículo con esa patente. Búscalo en el inventario o revisa si la escribiste bien.',
  drivers_unique_rut_per_company: 'Ya existe un conductor con ese RUT.',
  drivers_unique_code_per_company: 'Ese código de conductor ya está en uso. Elige otro.',
  passengers_unique_rut_per_company: 'Ya existe un pasajero con ese RUT.',
  routes_unique_code_per_company: 'Ya existe una ruta con ese código. Elige otro.',
  services_unique_code_per_company: 'Ya existe un servicio con ese código. Elige otro.',
  incident_types_unique_name_per_company: 'Ya existe un tipo de incidente con ese nombre.',
  maintenance_orders_unique_code_per_company: 'Ya existe una orden de mantención con ese código.',
  incidents_unique_code_per_company: 'Ya existe un incidente con ese código.',
  contract_passengers_contract_id_passenger_id_key: 'Ese pasajero ya está asociado al contrato.',
  route_passengers_unique_passenger_per_route: 'Ese pasajero ya está asignado a la ruta.',
  service_passengers_unique_passenger_per_service: 'Ese pasajero ya está asignado al servicio.',
  route_stops_unique_order_per_route: 'Hay dos paradas con el mismo orden. Revisa la secuencia.',
  service_stops_unique_order_per_service: 'Hay dos paradas con el mismo orden. Revisa la secuencia.',
  passenger_service_access_unique_code_per_company: 'Se generó un código de acceso repetido. Inténtalo de nuevo.',
  passenger_service_access_unique_per_service_passenger: 'Ese pasajero ya tiene un código de acceso para este servicio.',
}

// Restricciones check (23514), por nombre de constraint.
const CHECK_MESSAGES: Record<string, string> = {
  vehicles_year_check: 'El año del vehículo debe estar entre 1980 y 2100.',
  vehicles_capacity_check: 'La capacidad no puede ser negativa.',
  fuel_logs_liters_check: 'Los litros deben ser mayores a 0.',
  fuel_logs_total_amount_check: 'El monto no puede ser negativo.',
  fuel_logs_unit_price_check: 'El precio por litro no puede ser negativo.',
  fuel_logs_level_order_check: 'El nivel de combustible después de cargar no puede ser menor que el anterior.',
  maintenance_orders_cost_check: 'Los costos no pueden ser negativos.',
  routes_distance_check: 'La distancia no puede ser negativa.',
  routes_duration_check: 'La duración no puede ser negativa.',
  services_actual_time_check: 'La hora de término no puede ser anterior a la de inicio.',
  route_schedules_valid_dates_check: 'La fecha de término no puede ser anterior a la de inicio.',
}

function constraintName(err: ErrorLike): string | null {
  const text = `${err.message ?? ''} ${err.details ?? ''}`
  return text.match(/constraint "([^"]+)"/)?.[1] ?? null
}

/** Motivo del error, en lenguaje claro. */
export function friendlyReason(error: unknown): string {
  if (!error) return DEFAULT_MESSAGE
  const err = (typeof error === 'object' ? error : { message: String(error) }) as ErrorLike
  const message = err.message ?? ''

  // Sin conexión con el servidor.
  if (err.name === 'TypeError' && /fetch|network/i.test(message)) {
    return 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  }
  if (/failed to fetch|network ?error|load failed/i.test(message)) {
    return 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  }

  // Sesión vencida o sin permisos.
  if (err.code === 'PGRST301' || err.status === 401 || /jwt (expired|malformed)|invalid jwt/i.test(message)) {
    return 'Tu sesión expiró por seguridad. Vuelve a iniciar sesión para continuar.'
  }
  if (err.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'No tienes permiso para hacer esto. Si crees que es un error, contacta al administrador de tu empresa.'
  }

  switch (err.code) {
    case '23505': {
      const name = constraintName(err)
      return (name && UNIQUE_MESSAGES[name]) ?? 'Ya existe un registro con esos datos.'
    }
    case '23503':
      return /delete|update/i.test(message)
        ? 'No se puede eliminar porque otros registros dependen de este.'
        : 'Uno de los datos seleccionados ya no existe. Recarga la página e inténtalo de nuevo.'
    case '23514': {
      const name = constraintName(err)
      return (name && CHECK_MESSAGES[name]) ?? 'Algún dato no tiene un valor válido. Revisa los campos marcados.'
    }
    case '23502':
      return 'Falta completar un campo obligatorio.'
    case '22P02':
    case '22007':
    case '22008':
      return 'Algún dato no tiene un formato válido. Revisa fechas, números y RUT.'
    case '22001':
      return 'Uno de los textos es demasiado largo.'
    case 'PGRST202':
    case '42883':
      // Función RPC inexistente: falta aplicar una migración en la base.
      return 'Esta acción aún no está disponible porque falta actualizar la base de datos. Avísale al equipo técnico.'
    case 'PGRST116':
      return 'No encontramos ese registro. Puede que lo hayan eliminado; recarga la página.'
    case 'P0001':
      // Mensajes de nuestras funciones SQL: ya están escritos para personas.
      return message || DEFAULT_MESSAGE
  }

  return DEFAULT_MESSAGE
}

/**
 * Mensaje completo para mostrar: "No se pudo guardar el vehículo. Ya existe un vehículo con esa patente…".
 * `action` describe qué se intentaba hacer.
 */
export function friendlyError(error: unknown, action?: string): string {
  const reason = friendlyReason(error)
  return action ? `${action}. ${reason}` : reason
}
