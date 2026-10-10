//esta es la ruta app/dashboard/components/Header.tsx
'use client'

export default function Header() {
  return (
    <header className="bg-surface border-b border-line px-6 flex items-center flex-shrink-0 h-14">
      {/* Title + date */}
      <div className="flex items-center gap-3">
        <h1 className="text-[13px] font-bold tracking-wide uppercase" style={{ color: '#f1f5f9' }}>
          Panel Operacional
        </h1>
        <span className="hidden lg:block w-px h-4 bg-line" />
        <p className="hidden lg:block text-[11px] text-muted">
          {new Date().toLocaleDateString('es-CL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>
    </header>
  )
}
