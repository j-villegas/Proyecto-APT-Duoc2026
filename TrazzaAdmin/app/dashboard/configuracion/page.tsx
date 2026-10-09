import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConfigClient from './components/ConfigClient'

export default async function ConfiguracionPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, company_id, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.company_id) redirect('/login')

  const { data: companyRaw } = await supabase
    .from('companies')
    .select('id, name, rut, business_name, contact_email, contact_phone, address')
    .eq('id', profile.company_id)
    .maybeSingle()

  const company = {
    id:            companyRaw?.id             ?? '',
    name:          companyRaw?.name           ?? '',
    rut:           companyRaw?.rut            ?? null,
    business_name: companyRaw?.business_name  ?? null,
    contact_email: companyRaw?.contact_email  ?? null,
    contact_phone: companyRaw?.contact_phone  ?? null,
    address:       companyRaw?.address        ?? null,
  }

  return (
    <ConfigClient
      userEmail={user.email ?? ''}
      userName={(profile.full_name as string | null) ?? null}
      userRole={profile.role ?? 'admin'}
      companyId={profile.company_id}
      company={company}
    />
  )
}
