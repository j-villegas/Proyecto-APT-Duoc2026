/**
 * El "trazo" de Trazza: origen → línea de ruta → destino. Motivo de marca para
 * estados vacíos y cargas; la línea se dibuja sola (respeta reduced-motion).
 */
export default function TrazoLine({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 24"
      fill="none"
      aria-hidden
      className={`trazo-line h-6 w-28 ${className}`}
    >
      <circle cx="8" cy="12" r="4.5" stroke="var(--color-accent)" strokeWidth="2" />
      <path
        className="trazo-path"
        d="M16 12 C 36 2, 52 22, 72 12 S 98 6, 106 12"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 5"
      />
      <rect x="107" y="7.5" width="9" height="9" rx="2" fill="var(--color-accent)" />
    </svg>
  )
}
