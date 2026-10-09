'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordForm() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    setError('')
    if (password.length < 8) { setError('Usa al menos 8 caracteres.'); return }
    if (password !== form.get('confirmation')) { setError('Las contraseñas no coinciden.'); return }
    setBusy(true)
    const supabase = createClient()
    try {
      const { data: { user }, error: sessionError } = await supabase.auth.getUser()
      if (sessionError || !user) { setError('Tu sesión expiró. Solicita otro enlace de recuperación.'); return }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError(error.code === 'same_password' ? 'Elige una contraseña diferente a la anterior.' : error.code === 'weak_password' ? 'La contraseña no cumple los requisitos de seguridad del proyecto. Usa una más larga con letras, números y símbolos.' : 'No se pudo actualizar la contraseña. Intenta nuevamente o solicita otro enlace.')
        return
      }
      setDone(true)
      // End this browser's recovery session; other-device sessions follow Supabase policy.
      await supabase.auth.signOut({ scope: 'local' })
    } catch { setError('No se pudo conectar. Revisa tu conexión e intenta nuevamente.') }
    finally { setBusy(false) }
  }
  if (done) return <div className="space-y-4"><p role="status">Tu contraseña se actualizó correctamente.</p><Link href="/login" className="text-[#10b98b] hover:underline">Ir al inicio de sesión</Link></div>
  return <form onSubmit={submit} aria-busy={busy} className="space-y-4">
    <p className="text-sm text-[#a8b8cc]">Usa al menos 8 caracteres y una contraseña que no uses en otros servicios.</p>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <fieldset disabled={busy} className="space-y-4">
      <label htmlFor="new-password" className="block text-sm">Nueva contraseña<input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required className="trazza-input mt-2 block w-full rounded-2xl p-4 text-slate-100" /></label>
      <label htmlFor="confirm-password" className="block text-sm">Confirmar contraseña<input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={8} required className="trazza-input mt-2 block w-full rounded-2xl p-4 text-slate-100" /></label>
      <button className="w-full rounded-2xl bg-[#10b98b] p-4 font-bold text-[#0d1d37] disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
    </fieldset>
    <Link href="/recuperar-contrasena" className="block text-sm text-[#10b98b] hover:underline">Solicitar otro enlace</Link>
  </form>
}
