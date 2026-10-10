import { supabase } from "../lib/supabase";
import type { IncidentPriority, IncidentType } from "../types/database";

export interface CreateIncidentInput {
  serviceId: string | null;
  category: IncidentType;
  title: string;
  description: string;
  priority?: IncidentPriority;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * La base identifica al conductor o pasajero por la sesión y completa empresa,
 * ruta, vehículo y tipo de incidente (mobile_report_incident).
 */
export async function createIncident(input: CreateIncidentInput & { photoUrls?: string[] }) {
  const { error } = await supabase.rpc("mobile_report_incident", {
    p_service_id: input.serviceId,
    p_category: input.category,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority ?? "media",
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_photo_urls: input.photoUrls ?? [],
  });
  if (error) throw error;
}

export async function uploadIncidentPhoto(localUri: string, reporterId: string) {
  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const extension = localUri.split(".").pop() ?? "jpg";
  const path = `${reporterId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from("incident-photos")
    .upload(path, arrayBuffer, { contentType: `image/${extension}` });
  if (error) throw error;

  const { data } = supabase.storage.from("incident-photos").getPublicUrl(path);
  return data.publicUrl;
}
