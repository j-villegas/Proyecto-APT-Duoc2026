import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import GoogleMapsProvider from './components/GoogleMapsProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0d1d37] flex items-center justify-center p-4">
        <div className="bg-[#142942] rounded-xl border border-rose-900 p-8 max-w-md text-center">
          <div className="w-12 h-12 bg-rose-950 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Perfil no encontrado</h2>
          <p className="text-sm text-slate-400">
            Tu cuenta no tiene un perfil activo en el sistema. Contacta al administrador.
          </p>
        </div>
      </div>
    )
  }

  if (profile.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0d1d37] flex items-center justify-center p-4">
        <div className="bg-[#142942] rounded-xl border border-amber-900 p-8 max-w-md text-center">
          <div className="w-12 h-12 bg-amber-950 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Acceso restringido</h2>
          <p className="text-sm text-slate-400">
            Este panel es exclusivo para Administradores Operacionales.
          </p>
        </div>
      </div>
    )
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', profile.company_id)
    .single()

  return (
    <div className="trazza-dashboard text-slate-100 flex h-dvh flex-col md:flex-row overflow-hidden" style={{ backgroundColor: '#0d1d37' }}>
      <Sidebar companyName={company?.name ?? 'Empresa'} userEmail={user.email ?? ''} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <GoogleMapsProvider>
          <main className="flex-1 overflow-y-auto p-4 md:p-6" style={{ backgroundColor: '#0d1d37' }}>
            {children}
          </main>
        </GoogleMapsProvider>
      </div>
    </div>
  )
}
