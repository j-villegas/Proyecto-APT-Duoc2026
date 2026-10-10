import { supabase } from "../lib/supabase";
import type {
  DbServiceRow,
  DbServiceStopRow,
  DbVehicleRow,
  DriverInfo,
  ServiceStatus,
  ServiceStop,
} from "../types/database";
import { STOP_STATUS_TO_DB, mapService, mapServiceStop, mapVehicle } from "./mappers";

// scheduled_at / eta / passenger_count son campos calculados de la base
// (funciones mobile_* en TrazzaAdmin/migrations/025_mobile_app.sql).
const SERVICE_COLUMNS = `
  id, service_code, status, driver_id, vehicle_id, created_at,
  scheduled_at:mobile_scheduled_at, eta:mobile_eta, passenger_count:mobile_passenger_count,
  route:routes(origin_name, origin_address, origin_latitude, origin_longitude,
    destination_name, destination_address, destination_latitude, destination_longitude),
  contract:contracts(contract_name, client_name)
`;

const STOP_COLUMNS = `
  id, service_id, stop_order, name, address, status,
  eta:mobile_eta, passenger_count:mobile_passenger_count
`;

/** Días hacia atrás que se cargan en el listado del conductor. */
const DRIVER_HISTORY_DAYS = 30;

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/** passengerId: passengers.id del perfil (profile.passenger_id). */
export async function getNextServiceForPassenger(passengerId: string) {
  const { data, error } = await supabase
    .from("services")
    .select(`${SERVICE_COLUMNS}, service_passengers!inner(passenger_id)`)
    .eq("service_passengers.passenger_id", passengerId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "in_progress"])
    .order("scheduled_date", { ascending: true })
    .order("scheduled_start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapService(data as unknown as DbServiceRow) : null;
}

/** passengerId: passengers.id del perfil (profile.passenger_id). */
export async function getPassengerHistory(passengerId: string) {
  const { data, error } = await supabase
    .from("services")
    .select(`${SERVICE_COLUMNS}, service_passengers!inner(passenger_id)`)
    .eq("service_passengers.passenger_id", passengerId)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: false })
    .order("scheduled_start_time", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as DbServiceRow[]).map(mapService);
}

export async function getServiceById(serviceId: string) {
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("id", serviceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No se encontró el servicio ${serviceId}`);
  return mapService(data as unknown as DbServiceRow);
}

export async function getServiceStops(serviceId: string) {
  const { data, error } = await supabase
    .from("service_stops")
    .select(STOP_COLUMNS)
    .eq("service_id", serviceId)
    .order("stop_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as DbServiceStopRow[]).map(mapServiceStop);
}

export async function getVehicleById(vehicleId: string | null) {
  if (!vehicleId) throw new Error("El servicio no tiene vehículo asignado.");
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, plate, brand, model, capacity_passengers")
    .eq("id", vehicleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No se encontró el vehículo ${vehicleId}`);
  return mapVehicle(data as DbVehicleRow);
}

/** Nombre y teléfono del conductor asignado (visible también para pasajeros). */
export async function getServiceDriver(serviceId: string): Promise<DriverInfo | null> {
  const { data, error } = await supabase.rpc("get_service_driver", { p_service_id: serviceId });
  if (error) throw error;
  const row = (data as { id: string; full_name: string; phone: string | null }[] | null)?.[0];
  return row ? { ...row, rating: null } : null;
}

/** driverId: drivers.id del perfil (profile.driver_id). */
export async function getDriverServices(driverId: string) {
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("driver_id", driverId)
    .is("deleted_at", null)
    .gte("scheduled_date", daysAgo(DRIVER_HISTORY_DAYS))
    .order("scheduled_date", { ascending: true })
    .order("scheduled_start_time", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as DbServiceRow[]).map(mapService);
}

/**
 * El conductor solo inicia ("en_ruta") o finaliza ("finalizado") servicios;
 * la base actualiza también vehículo, conductor y la bitácora del panel.
 */
export async function updateServiceStatus(
  serviceId: string,
  status: ServiceStatus,
  options: { odometerKm?: number | null } = {}
) {
  let result;
  if (status === "en_ruta") {
    result = await supabase.rpc("mobile_start_service", {
      p_service_id: serviceId,
      p_odometer_km: options.odometerKm ?? null,
    });
  } else if (status === "finalizado") {
    result = await supabase.rpc("mobile_finish_service", { p_service_id: serviceId });
  } else {
    throw new Error(`La app no puede cambiar un servicio a "${status}".`);
  }
  if (result.error) throw result.error;
}

export async function updateStopStatus(stopId: string, status: ServiceStop["status"]) {
  const { error } = await supabase.rpc("mobile_set_stop_status", {
    p_stop_id: stopId,
    p_status: STOP_STATUS_TO_DB[status],
  });
  if (error) throw error;
}
