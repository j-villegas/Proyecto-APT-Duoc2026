import type {
  DbProfile,
  DbServiceLocationRow,
  DbServiceRow,
  DbServiceStatus,
  DbServiceStopRow,
  DbStopStatus,
  DbVehicleRow,
  DriverLocation,
  Profile,
  Service,
  ServiceStatus,
  ServiceStop,
  StopStatus,
  Vehicle,
} from "../types/database";

// Traducción entre las filas de la base del panel y los tipos de la app.

const SERVICE_STATUS_FROM_DB: Record<DbServiceStatus, ServiceStatus> = {
  scheduled: "programado",
  in_progress: "en_ruta",
  completed: "finalizado",
  cancelled: "cancelado",
};

const STOP_STATUS_FROM_DB: Record<DbStopStatus, StopStatus> = {
  pending: "pendiente",
  next: "pendiente",
  arrived: "confirmada",
  completed: "completada",
  skipped: "completada",
};

export const STOP_STATUS_TO_DB: Record<StopStatus, DbStopStatus> = {
  pendiente: "pending",
  confirmada: "arrived",
  completada: "completed",
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstActive<T extends { id: string; deleted_at: string | null }>(rows?: T[] | null) {
  return rows?.find((row) => !row.deleted_at)?.id ?? null;
}

/** null si el perfil no es de conductor/pasajero (ej: administrador del panel). */
export function mapProfile(row: DbProfile): Profile | null {
  if (row.role !== "driver" && row.role !== "passenger") return null;
  return {
    id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
    role: row.role === "driver" ? "conductor" : "pasajero",
    phone: row.phone,
    driver_id: row.role === "driver" ? firstActive(row.drivers) : null,
    passenger_id: row.role === "passenger" ? firstActive(row.passengers) : null,
    avatar_url: null,
    rating: null,
    created_at: row.created_at,
  };
}

export function mapService(row: DbServiceRow): Service {
  const route = row.route;
  return {
    id: row.id,
    code: row.service_code,
    contract_name: row.contract?.contract_name ?? row.contract?.client_name ?? null,
    driver_id: row.driver_id,
    vehicle_id: row.vehicle_id,
    origin_label: route?.origin_name ?? "Origen",
    origin_address: route?.origin_address ?? "",
    destination_label: route?.destination_name ?? "Destino",
    destination_address: route?.destination_address ?? "",
    origin_latitude: toNumber(route?.origin_latitude),
    origin_longitude: toNumber(route?.origin_longitude),
    destination_latitude: toNumber(route?.destination_latitude),
    destination_longitude: toNumber(route?.destination_longitude),
    scheduled_at: row.scheduled_at,
    eta: row.eta,
    status: SERVICE_STATUS_FROM_DB[row.status] ?? "programado",
    passenger_count: row.passenger_count ?? 0,
    created_at: row.created_at,
  };
}

export function mapServiceStop(row: DbServiceStopRow): ServiceStop {
  return {
    id: row.id,
    service_id: row.service_id,
    order_index: row.stop_order,
    label: row.name,
    address: row.address ?? "",
    eta: row.eta,
    passenger_count: row.passenger_count ?? 0,
    status: STOP_STATUS_FROM_DB[row.status] ?? "pendiente",
  };
}

export function mapVehicle(row: DbVehicleRow): Vehicle {
  return {
    id: row.id,
    plate: row.plate,
    brand: row.brand ?? "",
    model: row.model ?? "",
    capacity: row.capacity_passengers ?? 0,
  };
}

export function mapLocation(row: DbServiceLocationRow): DriverLocation | null {
  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  if (latitude === null || longitude === null) return null;
  return {
    service_id: row.service_id,
    latitude,
    longitude,
    heading: toNumber(row.heading),
    speed: toNumber(row.speed_kmh),
    updated_at: row.recorded_at,
  };
}
