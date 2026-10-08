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
  full_name: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  rating: number | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  brand: string;
  capacity: number;
  driver_id: string | null;
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
  driver_id: string;
  vehicle_id: string;
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

export interface TripPassenger {
  id: string;
  service_id: string;
  passenger_id: string;
  pickup_stop_id: string | null;
}

export interface DriverLocation {
  driver_id: string;
  service_id: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

export interface Incident {
  id: string;
  service_id: string | null;
  reporter_id: string;
  category: IncidentType;
  title: string;
  description: string;
  priority: IncidentPriority;
  photo_urls: string[];
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      vehicles: { Row: Vehicle; Insert: Partial<Vehicle>; Update: Partial<Vehicle> };
      services: { Row: Service; Insert: Partial<Service>; Update: Partial<Service> };
      service_stops: { Row: ServiceStop; Insert: Partial<ServiceStop>; Update: Partial<ServiceStop> };
      trip_passengers: { Row: TripPassenger; Insert: Partial<TripPassenger>; Update: Partial<TripPassenger> };
      driver_locations: { Row: DriverLocation; Insert: Partial<DriverLocation>; Update: Partial<DriverLocation> };
      incidents: { Row: Incident; Insert: Partial<Incident>; Update: Partial<Incident> };
    };
  };
}
