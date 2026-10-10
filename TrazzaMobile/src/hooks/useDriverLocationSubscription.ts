import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { mapLocation } from "../services/mappers";
import type { DbServiceLocationRow, DriverLocation } from "../types/database";

/** Última posición del conductor de un servicio, en vivo. */
export function useDriverLocationSubscription(serviceId: string | null) {
  const [location, setLocation] = useState<DriverLocation | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    let active = true;

    supabase
      .from("service_locations")
      .select("service_id, latitude, longitude, heading, speed_kmh, recorded_at")
      .eq("service_id", serviceId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const mapped = data ? mapLocation(data as DbServiceLocationRow) : null;
        if (active && mapped) setLocation(mapped);
      });

    // service_locations es append-only: cada ping es un INSERT.
    const channel = supabase
      .channel(`service-location-${serviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "service_locations",
          filter: `service_id=eq.${serviceId}`,
        },
        (payload) => {
          const mapped = mapLocation(payload.new as DbServiceLocationRow);
          if (active && mapped) setLocation(mapped);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [serviceId]);

  return location;
}
