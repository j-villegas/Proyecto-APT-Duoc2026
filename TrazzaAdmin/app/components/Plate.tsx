/** Normaliza una patente chilena: "gy-by 99" -> "GY·BY·99". */
export function formatPlate(value: string): string {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean.length === 6 ? `${clean.slice(0, 2)}·${clean.slice(2, 4)}·${clean.slice(4)}` : clean || value
}

/**
 * Patente con la estética de la placa chilena (fondo blanco, caracteres
 * negros, "CHILE" arriba). Identifica un vehículo de un vistazo en tablas y mapas.
 */
export default function Plate({ value, size = 'sm' }: { value: string | null | undefined; size?: 'sm' | 'md' }) {
  if (!value) return <span className="text-muted">—</span>
  const formatted = formatPlate(value)
  return (
    <span
      className="inline-flex flex-col items-center rounded-[4px] border border-slate-400 bg-white px-1.5 pb-[3px] pt-[2px] leading-none text-slate-900 shadow-sm"
      title={`Patente ${formatted}`}
    >
      <span aria-hidden className="text-[6px] font-bold tracking-[0.3em] text-slate-500">CHILE</span>
      <span className={`font-mono font-bold tracking-[0.08em] ${size === 'md' ? 'text-[15px]' : 'text-[12px]'}`}>
        <span className="sr-only">Patente </span>{formatted}
      </span>
    </span>
  )
}
