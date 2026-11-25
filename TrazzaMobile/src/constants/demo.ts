// Modo demostración: herramientas para presentar el flujo completo en vivo
// sin salir a la calle (GPS simulado por las paradas del viaje asignado).
// Se ofrece en desarrollo (__DEV__) o con EXPO_PUBLIC_DEMO_MODE=true. Los
// pings simulados quedan marcados y el panel los señala en la auditoría.

export const DEMO_MODE_AVAILABLE = __DEV__ || process.env.EXPO_PUBLIC_DEMO_MODE === "true";

/** Duración del recorrido simulado (minutos). Configurable con EXPO_PUBLIC_DEMO_SIM_MINUTES. */
export const DEMO_SIMULATION_MINUTES = (() => {
  const n = Number(process.env.EXPO_PUBLIC_DEMO_SIM_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 3;
})();

/** Cada cuántos segundos se envía un punto simulado. Configurable con EXPO_PUBLIC_DEMO_SIM_INTERVAL_S. */
export const DEMO_SIMULATION_INTERVAL_MS = (() => {
  const n = Number(process.env.EXPO_PUBLIC_DEMO_SIM_INTERVAL_S);
  return Number.isFinite(n) && n >= 0.5 ? n * 1000 : 4000;
})();
