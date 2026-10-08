import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { DriverLocation } from "../types/database";

export function useDriverLocationSubscription(driverId: string | null) {
  const [location, setLocation] = useState<DriverLocation | null>(null);

  useEffect(() => {
    if (!driverId) return;

    let active = true;

    supabase
      .from("driver_locations")
      .select("*")
      .eq("driver_id", driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setLocation(data as DriverLocation);
      });

    const channel = supabase
      .channel(`driver-location-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_locations",
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          if (active) setLocation(payload.new as DriverLocation);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  return location;
}
