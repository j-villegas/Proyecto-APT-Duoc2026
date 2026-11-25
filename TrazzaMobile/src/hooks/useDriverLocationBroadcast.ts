import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import type { Coordinates } from "../utils/geo";
import { pathLengthKm, positionAlongPath } from "../utils/estimates";

interface Options {
  serviceId: string;
  enabled: boolean;
  /**
   * Modo demostración: en vez del GPS, recorre estos puntos (paradas del
   * servicio) en `simulationDurationMs`. Los pings quedan marcados como
   * simulados (service_locations.is_simulated) y la auditoría lo informa.
   */
  simulatePath?: Coordinates[] | null;
  simulationDurationMs?: number;
  /** Intervalo entre puntos simulados (por defecto SIMULATION_REPORT_INTERVAL_MS). */
  simulationIntervalMs?: number;
}

/** Intervalo de envío en modo demostración: el pasajero ve avanzar al conductor. */
export const SIMULATION_REPORT_INTERVAL_MS = 4_000;
export const DEFAULT_SIMULATION_DURATION_MS = 3 * 60_000;

/**
 * Cada cuánto se guarda la posición en service_locations. Se envía aunque el
 * vehículo esté detenido: el panel lo necesita para detectar detenciones.
 */
export const LOCATION_REPORT_INTERVAL_MS = 30_000;

/** Publica la posición del conductor en service_locations (la ve el pasajero y el panel). */
export function useDriverLocationBroadcast({
  serviceId,
  enabled,
  simulatePath,
  simulationDurationMs = DEFAULT_SIMULATION_DURATION_MS,
  simulationIntervalMs = SIMULATION_REPORT_INTERVAL_MS,
}: Options) {
  const [error, setError] = useState<string | null>(null);
  const [simulatedPosition, setSimulatedPosition] = useState<Coordinates | null>(null);
  const simulating = !!simulatePath && simulatePath.length >= 2;
  // Clave estable: el arreglo cambia de identidad en cada render.
  const pathKey = simulating ? JSON.stringify(simulatePath) : "";

  // Modo demostración ------------------------------------------------------
  useEffect(() => {
    if (!enabled || !pathKey) return;
    const path = JSON.parse(pathKey) as Coordinates[];
    const speedKmh = pathLengthKm(path) / (simulationDurationMs / 3_600_000);
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const send = async () => {
      if (cancelled) return;
      const fraction = (Date.now() - startedAt) / simulationDurationMs;
      const fix = positionAlongPath(path, fraction);
      if (!fix) return;
      setSimulatedPosition({ latitude: fix.latitude, longitude: fix.longitude });
      const { error: rpcError } = await supabase.rpc("mobile_report_location", {
        p_service_id: serviceId,
        p_latitude: fix.latitude,
        p_longitude: fix.longitude,
        p_speed_kmh: fraction >= 1 ? 0 : Math.round(speedKmh * 10) / 10,
        p_heading: fix.heading,
        p_accuracy_meters: null,
        p_is_simulated: true,
      });
      if (cancelled) return;
      if (rpcError?.message?.includes("ya no está en curso")) {
        cancelled = true;
        if (timer) clearInterval(timer);
        setError(null);
        return;
      }
      setError(rpcError ? friendlyError(rpcError) : null);
    };

    send();
    timer = setInterval(send, simulationIntervalMs);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [serviceId, enabled, pathKey, simulationDurationMs, simulationIntervalMs]);

  // GPS real ---------------------------------------------------------------
  useEffect(() => {
    if (!enabled || simulating) return;

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
  }, [serviceId, enabled, simulating]);

  return { error, simulatedPosition: simulating ? simulatedPosition : null };
}
