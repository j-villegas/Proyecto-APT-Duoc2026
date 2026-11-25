import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { authenticateRealtime } from "../lib/realtime";
import { getServiceById, getServiceStops } from "../services/services";
import type { Service, ServiceStop } from "../types/database";

/**
 * Servicio y paradas que se mantienen al día: se recargan cuando el
 * conductor o el panel cambian el servicio o sus paradas (Supabase Realtime).
 */
export function useServiceLive(serviceId: string | null) {
  const [service, setService] = useState<Service | null>(null);
  const [stops, setStops] = useState<ServiceStop[]>([]);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    if (!serviceId) return;
    try {
      const [svc, stopList] = await Promise.all([getServiceById(serviceId), getServiceStops(serviceId)]);
      setService(svc);
      setStops(stopList);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [serviceId]);

  useEffect(() => {
    if (!serviceId) return;
    let active = true;
    reload();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    authenticateRealtime().then(() => {
      if (!active) return;
      channel = supabase
        // Nombre único: inicio y seguimiento pueden escuchar el mismo servicio a la
        // vez, y supabase-js reutiliza un canal con el mismo nombre ya suscrito.
        .channel(`service-live-${serviceId}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "services", filter: `id=eq.${serviceId}` },
          () => reload()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "service_stops", filter: `service_id=eq.${serviceId}` },
          () => reload()
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [serviceId, reload]);

  return { service, stops, error, reload };
}
