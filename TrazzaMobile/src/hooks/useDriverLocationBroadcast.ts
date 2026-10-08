import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";

interface Options {
  driverId: string;
  serviceId: string;
  enabled: boolean;
}

export function useDriverLocationBroadcast({ driverId, serviceId, enabled }: Options) {
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
          const { latitude, longitude, heading, speed } = location.coords;
          await supabase.from("driver_locations").upsert({
            driver_id: driverId,
            service_id: serviceId,
            latitude,
            longitude,
            heading,
            speed,
            updated_at: new Date().toISOString(),
          });
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
  }, [driverId, serviceId, enabled]);

  return { error };
}
