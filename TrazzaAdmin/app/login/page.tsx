//esta es la ruta: app/login/page.tsx

'use client'

import { useState } from 'react'
import Link from 'next/link'
import TrazzaMark from '@/app/components/TrazzaMark'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Credenciales inválidas. Verifica tu email y contraseña.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="trazza-login min-h-dvh flex items-center justify-center px-6 py-12 sm:py-16">
      <div className="w-full max-w-md">
        <div className="mb-12 text-center">
          <TrazzaMark className="mx-auto mb-6 h-24 w-24" />
          <h1 className="text-4xl font-bold tracking-[0.16em] sm:text-5xl">TRAZZA</h1>
          <p className="mt-3 text-base text-[#a8b8cc]">rutas, flota y conductores en línea</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
          {error && <p id="login-error" role="alert" className="rounded-xl border border-rose-900 bg-rose-950 px-4 py-3 text-sm text-rose-200">{error}</p>}
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#a8b8cc]">Correo electrónico</label>
            <div className="trazza-input flex items-center gap-3 rounded-2xl px-4">
              <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-[#a8b8cc]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} aria-describedby={error ? 'login-error' : undefined} className="min-w-0 w-full bg-transparent py-4 text-base text-slate-100 placeholder:text-slate-400" placeholder="tucorreo@empresa.com" />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#a8b8cc]">Contraseña</label>
            <div className="trazza-input flex items-center gap-3 rounded-2xl px-4">
              <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-[#a8b8cc]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} aria-describedby={error ? 'login-error' : undefined} className="min-w-0 w-full bg-transparent py-4 text-base text-slate-100 placeholder:text-slate-400" placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#a8b8cc] hover:text-white">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="mt-3 w-full rounded-2xl bg-[#10b98b] px-4 py-4 text-base font-bold text-[#0d1d37] transition-colors hover:bg-[#36d3a7] disabled:cursor-wait disabled:opacity-60">
            {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
          <p className="text-center text-sm"><Link href="/recuperar-contrasena" className="text-[#10b98b] hover:underline">¿Olvidaste tu contraseña?</Link></p>
        </form>
        <p className="mt-10 text-center text-xs text-[#a8b8cc]">© 2026 TRAZZA · Gestión de transporte</p>
      </div>
    </main>
  )
}
