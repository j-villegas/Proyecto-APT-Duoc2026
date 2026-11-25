import type { Service } from "../types/database";
import type { PassengerLegs } from "./tripLegs";

/** Recogida y destino del pasajero para mostrar (con respaldo en la ruta mientras cargan). */
export function passengerPoints(service: Service, legs: PassengerLegs) {
  const pickup = legs.pickup
    ? { label: legs.pickup.address || legs.pickup.label, address: "", latitude: legs.pickup.latitude, longitude: legs.pickup.longitude }
    : null;
  const dropoff = legs.dropoff
    ? legs.dropoff.type === "dropoff"
      ? { label: legs.dropoff.address || legs.dropoff.label, address: "", latitude: legs.dropoff.latitude, longitude: legs.dropoff.longitude }
      : { label: legs.dropoff.label, address: legs.dropoff.address, latitude: legs.dropoff.latitude, longitude: legs.dropoff.longitude }
    : {
        label: service.destination_label,
        address: service.destination_address,
        latitude: service.destination_latitude,
        longitude: service.destination_longitude,
      };
  return { pickup, dropoff };
}
