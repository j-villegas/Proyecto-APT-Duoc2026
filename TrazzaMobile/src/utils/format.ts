export function formatTime(iso: string | null | undefined) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return "Hoy";
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "--";
  const date = new Date(iso);
  const day = date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  return `${day}, ${formatTime(iso)}`;
}

/** Días hasta una fecha YYYY-MM-DD (negativo si ya pasó), según la fecha local del dispositivo. */
export function daysUntil(date: string, today = new Date()) {
  const target = new Date(`${date}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function formatDate(date: string | null | undefined) {
  if (!date) return "--";
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}
