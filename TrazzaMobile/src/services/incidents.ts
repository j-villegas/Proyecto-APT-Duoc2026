import { supabase } from "../lib/supabase";
import type { IncidentPriority, IncidentType } from "../types/database";

export interface CreateIncidentInput {
  serviceId: string | null;
  reporterId: string;
  category: IncidentType;
  title: string;
  description: string;
  priority?: IncidentPriority;
  latitude?: number | null;
  longitude?: number | null;
}

export async function createIncident(input: CreateIncidentInput & { photoUrls?: string[] }) {
  const { error } = await supabase.from("incidents").insert({
    service_id: input.serviceId,
    reporter_id: input.reporterId,
    category: input.category,
    title: input.title,
    description: input.description,
    priority: input.priority ?? "media",
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    photo_urls: input.photoUrls ?? [],
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
