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
import { AppError } from "../lib/errors";

// scheduled_at / eta / passenger_count son campos calculados de la base
// (funciones mobile_* en TrazzaAdmin/migrations/025_mobile_app.sql).
const SERVICE_COLUMNS = `
  id, service_code, status, driver_id, vehicle_id, created_at,
  actual_start_at, actual_end_at, cancel_reason,
  scheduled_at:mobile_scheduled_at, eta:mobile_eta, passenger_count:mobile_passenger_count, planned_path,
  route:routes(origin_name, origin_address, origin_latitude, origin_longitude,
    destination_name, destination_address, destination_latitude, destination_longitude),
  contract:contracts(contract_name, client_name)
`;

const STOP_COLUMNS = `
  id, service_id, stop_order, stop_type, name, address, status, actual_arrival_at, completed_at,
  latitude, longitude, eta:mobile_eta, passenger_count:mobile_passenger_count
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
  if (!data) throw new AppError("Este viaje ya no está disponible. Puede que lo hayan cancelado o reasignado.");
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

/**
 * Paradas del pasajero en un servicio: dónde lo recogen y dónde baja
 * (dropoffStopId null = baja en el destino final). RLS: solo su propia fila.
 */
export async function getPassengerStopIds(serviceId: string, passengerId: string) {
  const { data, error } = await supabase
    .from("service_passengers")
    .select("service_stop_id, dropoff_stop_id")
    .eq("service_id", serviceId)
    .eq("passenger_id", passengerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { service_stop_id: string | null; dropoff_stop_id: string | null } | null;
  return { pickupStopId: row?.service_stop_id ?? null, dropoffStopId: row?.dropoff_stop_id ?? null };
}

export async function getVehicleById(vehicleId: string | null) {
  if (!vehicleId) throw new AppError("Este servicio aún no tiene vehículo asignado.");
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, plate, brand, model, capacity_passengers")
    .eq("id", vehicleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("No encontramos el vehículo de este servicio. Puede que lo hayan cambiado.");
  return mapVehicle(data as DbVehicleRow);
}

/** Nombre y teléfono del conductor asignado (visible también para pasajeros). */
export async function getServiceDriver(serviceId: string): Promise<DriverInfo | null> {
  const { data, error } = await supabase.rpc("get_service_driver", { p_service_id: serviceId });
  if (error) throw error;
  const row = (data as { id: string; full_name: string; phone: string | null }[] | null)?.[0];
  return row ?? null;
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

export interface DriverProfileDetails {
  licenseType: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  companyName: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
}

/** Licencia del conductor y contacto de su empresa, tal como los registra el panel. */
export async function getDriverProfileDetails(driverId: string, companyId: string): Promise<DriverProfileDetails> {
  const [driver, company] = await Promise.all([
    supabase
      .from("drivers")
      .select("license_type, license_number, license_expires_at")
      .eq("id", driverId)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("name, contact_phone, contact_email")
      .eq("id", companyId)
      .maybeSingle(),
  ]);
  if (driver.error) throw driver.error;
  return {
    licenseType: driver.data?.license_type ?? null,
    licenseNumber: driver.data?.license_number ?? null,
    licenseExpiresAt: driver.data?.license_expires_at ?? null,
    // La empresa es opcional: si no se puede leer, el perfil igual se muestra.
    companyName: company.data?.name ?? null,
    companyPhone: company.data?.contact_phone ?? null,
    companyEmail: company.data?.contact_email ?? null,
  };
}
