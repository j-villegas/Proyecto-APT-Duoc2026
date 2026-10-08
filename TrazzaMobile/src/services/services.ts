import { supabase } from "../lib/supabase";
import type { Service, ServiceStatus, ServiceStop, Vehicle } from "../types/database";

export async function getNextServiceForPassenger(passengerId: string) {
  const { data, error } = await supabase
    .from("trip_passengers")
    .select("service:services(*)")
    .eq("passenger_id", passengerId)
    .order("service(scheduled_at)", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.service as unknown as Service) ?? null;
}

export async function getPassengerHistory(passengerId: string) {
  const { data, error } = await supabase
    .from("trip_passengers")
    .select("service:services(*)")
    .eq("passenger_id", passengerId)
    .order("service(scheduled_at)", { ascending: false });

  if (error) throw error;
  return (data?.map((row) => row.service) as unknown as Service[]) ?? [];
}

export async function getServiceById(serviceId: string) {
  const { data, error } = await supabase.from("services").select("*").eq("id", serviceId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No se encontró el servicio ${serviceId}`);
  return data as Service;
}

export async function getServiceStops(serviceId: string) {
  const { data, error } = await supabase
    .from("service_stops")
    .select("*")
    .eq("service_id", serviceId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data as ServiceStop[]) ?? [];
}

export async function getVehicleById(vehicleId: string) {
  const { data, error } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No se encontró el vehículo ${vehicleId}`);
  return data as Vehicle;
}

export async function getDriverServices(driverId: string) {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("driver_id", driverId)
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data as Service[]) ?? [];
}

export async function updateServiceStatus(serviceId: string, status: ServiceStatus) {
  const { error } = await supabase.from("services").update({ status }).eq("id", serviceId);
  if (error) throw error;
}

export async function updateStopStatus(stopId: string, status: ServiceStop["status"]) {
  const { error } = await supabase.from("service_stops").update({ status }).eq("id", stopId);
  if (error) throw error;
}
