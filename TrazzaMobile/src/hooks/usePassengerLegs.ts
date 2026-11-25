import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getPassengerStopIds } from "../services/services";
import type { ServiceStop } from "../types/database";
import { passengerLegs, type PassengerStopIds } from "../utils/tripLegs";

/** Recogida y bajada del pasajero conectado en un servicio (se actualizan con `stops`). */
export function usePassengerLegs(serviceId: string | null, stops: ServiceStop[]) {
  const { profile } = useAuth();
  const passengerId = profile?.passenger_id ?? null;
  const [ids, setIds] = useState<PassengerStopIds | null>(null);

  useEffect(() => {
    if (!serviceId || !passengerId) return;
    let active = true;
    getPassengerStopIds(serviceId, passengerId)
      .then((next) => active && setIds(next))
      .catch(() => active && setIds(null));
    return () => {
      active = false;
    };
  }, [serviceId, passengerId]);

  return useMemo(() => passengerLegs(stops, ids), [stops, ids]);
}
