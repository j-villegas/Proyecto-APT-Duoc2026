import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ResetPasswordForm from './ResetPasswordForm'

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <main className="trazza-login min-h-dvh flex items-center justify-center px-6 py-12">
    <div className="w-full max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Establecer nueva contraseña</h1>
      {params.error || !user ? <><p role="alert" className="text-sm text-rose-300">El enlace es inválido, ya se utilizó o expiró. Solicita uno nuevo y ábrelo en el mismo navegador donde lo pediste.</p><Link href="/recuperar-contrasena" className="block text-[#10b98b] hover:underline">Solicitar otro enlace</Link></> : <ResetPasswordForm />}
    </div>
  </main>
}
