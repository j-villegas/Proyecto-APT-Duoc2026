import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";

interface Options {
  serviceId: string;
  enabled: boolean;
}

/** Publica la posición del conductor en service_locations (la ve el pasajero y el panel). */
export function useDriverLocationBroadcast({ serviceId, enabled }: Options) {
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Permiso de ubicación denegado.");
        return;
      }

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 15,
        },
        async (location) => {
          if (cancelled) return;
          const { latitude, longitude, heading, speed, accuracy } = location.coords;
          const { error: rpcError } = await supabase.rpc("mobile_report_location", {
            p_service_id: serviceId,
            p_latitude: latitude,
            p_longitude: longitude,
            // expo-location entrega m/s y -1 cuando no hay dato.
            p_speed_kmh: speed !== null && speed >= 0 ? speed * 3.6 : null,
            p_heading: heading !== null && heading >= 0 ? heading : null,
            p_accuracy_meters: accuracy,
          });
          if (rpcError) setError(rpcError.message);
        }
      );

      if (cancelled) {
        sub.remove();
      } else {
        subscriptionRef.current = sub;
      }
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [serviceId, enabled]);

  return { error };
}
