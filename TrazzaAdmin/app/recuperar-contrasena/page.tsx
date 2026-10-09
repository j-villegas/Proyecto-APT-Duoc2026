'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RecoverPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/recuperacion`,
      })
      if (error) setError(error.status === 429 ? 'Se solicitaron demasiados correos. Espera unos minutos y vuelve a intentar.' : 'No se pudo enviar el correo. Intenta nuevamente; si persiste, contacta al administrador.')
      else setSent(true)
    } catch { setError('No se pudo conectar. Revisa tu conexión y vuelve a intentar.') }
    finally { setBusy(false) }
  }
  return <main className="trazza-login min-h-dvh flex items-center justify-center px-6 py-12">
    <div className="w-full max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
      <p className="text-sm text-[#a8b8cc]">Te enviaremos un enlace para establecer una nueva contraseña.</p>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {sent ? <p role="status" className="rounded-xl border border-[#10b98b] p-4 text-sm">Si existe una cuenta con ese correo, recibirás un enlace de recuperación. Revisa también la carpeta de spam. Abre el enlace en este mismo navegador.</p> : <form onSubmit={submit} aria-busy={busy} className="space-y-4">
        <label htmlFor="recovery-email" className="block text-sm">Correo electrónico</label>
        <input id="recovery-email" name="email" type="email" required autoComplete="email" disabled={busy} placeholder="tucorreo@empresa.com" className="trazza-input w-full rounded-2xl px-4 py-4 text-slate-100" />
        <button disabled={busy} className="w-full rounded-2xl bg-[#10b98b] p-4 font-bold text-[#0d1d37] disabled:opacity-60">{busy ? 'Enviando…' : 'Enviar enlace de recuperación'}</button>
      </form>}
      <Link href="/login" className="block text-sm text-[#10b98b] hover:underline">Volver al inicio de sesión</Link>
    </div>
  </main>
}
