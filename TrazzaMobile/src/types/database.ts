// Tipos que usan las pantallas de la app. La base es la del panel
// (TrazzaAdmin/migrations); src/services/* traduce sus filas a estos tipos.

export type UserRole = "pasajero" | "conductor";

export type ServiceStatus =
  | "programado"
  | "en_espera"
  | "en_camino"
  | "en_ruta"
  | "finalizado"
  | "cancelado";

export type StopStatus = "pendiente" | "confirmada" | "completada";

export type IncidentType =
  | "frenada_brusca"
  | "conduccion_imprudente"
  | "limpieza_unidad"
  | "retraso_ruta"
  | "vehiculo"
  | "pasajero"
  | "ruta"
  | "otro";

export type IncidentPriority = "baja" | "media" | "alta";

export interface Profile {
  id: string;
  company_id: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  /** Fila de drivers vinculada (solo conductores). */
  driver_id: string | null;
  /** Fila de passengers vinculada (solo pasajeros). */
  passenger_id: string | null;
  avatar_url: string | null;
  rating: number | null;
  created_at: string;
}

/** Datos públicos del conductor de un servicio (función get_service_driver). */
export interface DriverInfo {
  id: string;
  full_name: string;
  phone: string | null;
  rating: number | null;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  brand: string;
  capacity: number;
}

export interface ServiceStop {
  id: string;
  service_id: string;
  order_index: number;
  label: string;
  address: string;
  eta: string | null;
  passenger_count: number;
  status: StopStatus;
}

export interface Service {
  id: string;
  code: string;
  contract_name: string | null;
  /** drivers.id (no el id del perfil). */
  driver_id: string | null;
  vehicle_id: string | null;
  origin_label: string;
  origin_address: string;
  destination_label: string;
  destination_address: string;
  /** Coordenadas opcionales; si faltan, la app geocodifica la dirección. */
  origin_latitude?: number | null;
  origin_longitude?: number | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  scheduled_at: string;
  eta: string | null;
  status: ServiceStatus;
  passenger_count: number;
  created_at: string;
}

export interface DriverLocation {
  service_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  /** km/h */
  speed: number | null;
  updated_at: string;
}

// Filas de la base del panel ------------------------------------------------

export type DbProfileRole = "admin" | "driver" | "passenger";
export type DbServiceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type DbStopStatus = "pending" | "next" | "arrived" | "completed" | "skipped";

/** Los numeric de Postgres pueden llegar como string. */
type Numeric = number | string;

export interface DbProfile {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: DbProfileRole;
  status: string;
  created_at: string;
  drivers?: { id: string; deleted_at: string | null }[] | null;
  passengers?: { id: string; deleted_at: string | null }[] | null;
}

export interface DbServiceRow {
  id: string;
  service_code: string;
  status: DbServiceStatus;
  driver_id: string | null;
  vehicle_id: string | null;
  created_at: string;
  scheduled_at: string;
  eta: string | null;
  passenger_count: number | null;
  route: {
    origin_name: string | null;
    origin_address: string | null;
    origin_latitude: Numeric | null;
    origin_longitude: Numeric | null;
    destination_name: string | null;
    destination_address: string | null;
    destination_latitude: Numeric | null;
    destination_longitude: Numeric | null;
  } | null;
  contract: { contract_name: string | null; client_name: string } | null;
}

export interface DbServiceStopRow {
  id: string;
  service_id: string;
  stop_order: number;
  name: string;
  address: string | null;
  status: DbStopStatus;
  eta: string | null;
  passenger_count: number | null;
}

export interface DbVehicleRow {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  capacity_passengers: number | null;
}

export interface DbServiceLocationRow {
  service_id: string;
  latitude: Numeric;
  longitude: Numeric;
  heading: Numeric | null;
  speed_kmh: Numeric | null;
  recorded_at: string;
}
