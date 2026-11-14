import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";

interface Options {
  serviceId: string;
  enabled: boolean;
}

/**
 * Cada cuánto se guarda la posición en service_locations. Se envía aunque el
 * vehículo esté detenido: el panel lo necesita para detectar detenciones.
 */
export const LOCATION_REPORT_INTERVAL_MS = 30_000;

/** Publica la posición del conductor en service_locations (la ve el pasajero y el panel). */
export function useDriverLocationBroadcast({ serviceId, enabled }: Options) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let watch: Location.LocationSubscription | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let latest: Location.LocationObject | null = null;

    const stop = () => {
      cancelled = true;
      watch?.remove();
      watch = null;
      if (timer) clearInterval(timer);
      timer = null;
    };

    const send = async () => {
      if (cancelled || !latest) return;
      const { latitude, longitude, heading, speed, accuracy } = latest.coords;
      const { error: rpcError } = await supabase.rpc("mobile_report_location", {
        p_service_id: serviceId,
        p_latitude: latitude,
        p_longitude: longitude,
        // expo-location entrega m/s y -1 cuando no hay dato.
        p_speed_kmh: speed !== null && speed >= 0 ? speed * 3.6 : null,
        p_heading: heading !== null && heading >= 0 ? heading : null,
        p_accuracy_meters: accuracy,
      });
      if (cancelled) return;
      // El panel finalizó o canceló el servicio: dejar de transmitir.
      if (rpcError?.message?.includes("ya no está en curso")) {
        stop();
        setError(null);
        return;
      }
      setError(rpcError ? friendlyError(rpcError) : null);
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setError("Activa tu ubicación para que los pasajeros y la central puedan seguir tu ruta.");
        return;
      }

      // El GPS se mantiene encendido para tener siempre una posición fresca;
      // el envío a la base va a intervalo fijo.
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 },
        (location) => {
          const first = !latest;
          latest = location;
          if (first) send();
        }
      );
      if (cancelled) {
        sub.remove();
        return;
      }
      watch = sub;
      timer = setInterval(send, LOCATION_REPORT_INTERVAL_MS);
    })();

    return stop;
  }, [serviceId, enabled]);

  return { error };
}
