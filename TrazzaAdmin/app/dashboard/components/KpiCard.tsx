// Shared KPI card used by Dashboard, Rutas, Flota and Conductores.

export type KpiTone    = 'blue' | 'green' | 'orange' | 'red' | 'gray'
export type KpiVariant = 'default' | 'alert'

const TONES: Record<KpiTone, { iconBg: string; indicator: string }> = {
  blue:   { iconBg: '#183352', indicator: '#7dbbff' },
  green:  { iconBg: '#123b35', indicator: '#55d9ad' },
  orange: { iconBg: '#3b3020', indicator: '#10b98b' },
  red:    { iconBg: '#3d2332', indicator: '#fda4af' },
  gray:   { iconBg: '#203650', indicator: '#94a3b8' },
}

interface KpiCardProps {
  label: string
  value: string | number
  sub: string
  icon: React.ReactNode
  tone?: KpiTone
  variant?: KpiVariant
}

export default function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = 'blue',
  variant = 'default',
}: KpiCardProps) {
  const t = TONES[tone]

  if (variant === 'alert') {
    return (
      <div
        className="rounded-lg px-4 py-3.5 flex items-center gap-4 min-w-0"
        style={{ backgroundColor: '#3d2332', border: '1px solid #794052' }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#542d3b' }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-wider leading-none"
            style={{ color: '#fecdd3' }}
          >
            {label}
          </p>
          <p
            className="text-[22px] font-bold leading-tight mt-1"
            style={{ color: '#ffe4e6' }}
          >
            {value}
          </p>
          <p
            className="text-[11px] leading-none mt-0.5 truncate"
            style={{ color: '#fda4af' }}
          >
            {sub}
          </p>
        </div>
        <div
          className="w-1 h-9 rounded-full flex-shrink-0 ml-1"
          style={{ backgroundColor: '#fca5a5' }}
        />
      </div>
    )
  }

  return (
    <div className="bg-surface border border-line rounded-lg px-4 py-3.5 flex items-center gap-4 min-w-0">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: t.iconBg }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted leading-none">
          {label}
        </p>
        <p className="text-[22px] font-bold leading-tight mt-1" style={{ color: '#f1f5f9' }}>
          {value}
        </p>
        <p className="text-[11px] text-muted leading-none mt-0.5 truncate">{sub}</p>
      </div>
      <div
        className="w-1 h-9 rounded-full flex-shrink-0 ml-1"
        style={{ backgroundColor: t.indicator + '55' }}
      />
    </div>
  )
}
