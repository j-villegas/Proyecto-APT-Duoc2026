import { useEffect, useRef, useState } from "react";
import type { Service } from "../types/database";

export interface ServiceNotice {
  key: string;
  title: string;
  message: string;
  tone: "info" | "success" | "danger";
}

/** Aviso para el pasajero cuando cambia el estado de su viaje (o null si no aplica). */
export function noticeForTransition(prev: Service, next: Service): ServiceNotice | null {
  if (prev.status !== "en_ruta" && next.status === "en_ruta") {
    return {
      key: "started",
      title: "Tu conductor inició el viaje",
      message: "Puedes seguir su ubicación en vivo en el mapa.",
      tone: "success",
    };
  }
  if (prev.status !== "finalizado" && next.status === "finalizado") {
    return { key: "finished", title: "Viaje finalizado", message: "Gracias por viajar con nosotros.", tone: "info" };
  }
  if (prev.status !== "cancelado" && next.status === "cancelado") {
    return {
      key: "cancelled",
      title: "Viaje cancelado",
      message: next.cancel_reason ?? "La central canceló el viaje.",
      tone: "danger",
    };
  }
  return null;
}

/** Tiempo que se muestra cada aviso. */
export const NOTICE_DURATION_MS = 10_000;

/**
 * Compara cada versión en vivo del servicio con la anterior y expone un aviso
 * temporal (viaje iniciado, finalizado o cancelado).
 */
export function useServiceStatusNotice(service: Service | null) {
  const previous = useRef<Service | null>(null);
  const [notice, setNotice] = useState<ServiceNotice | null>(null);

  useEffect(() => {
    const prev = previous.current;
    previous.current = service;
    if (!prev || !service || prev.id !== service.id) return;
    const next = noticeForTransition(prev, service);
    if (!next) return;
    setNotice(next);
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [service]);

  return { notice, dismiss: () => setNotice(null) };
}
