import { createClient } from '@/lib/supabase/server'
import KpiCard from '../components/KpiCard'
import TrazoLine from '@/app/components/TrazoLine'
import PassengerFormModal, { type PassengerData } from './components/PassengerFormModal'

// Pasajeros de la empresa: alta, edición, contratos y acceso a la app móvil.

type Row = {
  id: string
  full_name: string
  rut: string
  phone: string | null
  email: string | null
  status: string
  notes: string | null
  profile_id: string | null
  contract_passengers: { contract_id: string; deleted_at: string | null; contracts: { contract_name: string | null; client_name: string | null } | null }[] | null
}

function accessMeta(p: Row) {
  if (p.profile_id) return { label: 'Con acceso', bg: '#123b35', text: '#55d9ad', hint: 'Puede entrar a la app y ver sus viajes.' }
  if (p.email) return { label: 'Pendiente de cuenta', bg: '#3b3020', text: '#fdba74', hint: 'Crea su usuario en Supabase → Authentication con este correo; se vincula solo.' }
  return { label: 'Sin correo', bg: '#203650', text: '#bac9db', hint: 'Agrega un correo para habilitar la app.' }
}

export default async function PasajerosPage() {
  const supabase = await createClient()
  const [{ data: rawPassengers }, { data: rawContracts }] = await Promise.all([
    supabase.from('passengers')
      .select('id, full_name, rut, phone, email, status, notes, profile_id, contract_passengers ( contract_id, deleted_at, contracts ( contract_name, client_name ) )')
      .is('deleted_at', null)
      .order('full_name', { ascending: true }),
    supabase.from('contracts')
      .select('id, contract_name, client_name')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('client_name', { ascending: true }),
  ])

  const passengers = (rawPassengers ?? []) as unknown as Row[]
  const contracts = (rawContracts ?? []).map(c => ({
    id: c.id as string,
    label: [c.client_name, c.contract_name].filter(Boolean).join(' · ') || 'Contrato',
  }))
  const withAccess = passengers.filter(p => p.profile_id).length
  const pending = passengers.filter(p => !p.profile_id && p.email).length
  const inactive = passengers.filter(p => p.status !== 'active').length

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Gestión</p>
          <h2 className="text-[18px] font-bold" style={{ color: '#f1f5f9' }}>Pasajeros</h2>
          <p className="text-[12px] text-muted mt-0.5">Registra pasajeros, asígnalos a contratos y habilita su acceso a la app.</p>
        </div>
        <PassengerFormModal contracts={contracts} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Pasajeros" value={passengers.length} sub="Registrados" tone="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#7dbbff" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>} />
        <KpiCard label="Con acceso a la app" value={withAccess} sub="Cuenta vinculada" tone="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#55d9ad" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>} />
        <KpiCard label="Pendientes de cuenta" value={pending} sub="Con correo, sin usuario" tone="orange"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fdba74" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <KpiCard label="Inactivos" value={inactive} sub="No se asignan a viajes" tone="gray"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>} />
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>Listado</h3>
          <span className="text-[10px] bg-sunken border border-line text-muted px-2 py-0.5 rounded font-semibold">{passengers.length}</span>
        </div>
        {passengers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <TrazoLine className="mb-2.5" />
            <p className="text-[12px] font-semibold text-fg">Aún no hay pasajeros</p>
            <p className="text-[11px] text-muted mt-0.5">Usa “Añadir Pasajero” para registrar el primero.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="px-4 py-2 font-semibold">Pasajero</th>
                  <th className="px-4 py-2 font-semibold">Contacto</th>
                  <th className="px-4 py-2 font-semibold">Contratos</th>
                  <th className="px-4 py-2 font-semibold">App móvil</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {passengers.map(p => {
                  const active = (p.contract_passengers ?? []).filter(cp => !cp.deleted_at)
                  const access = accessMeta(p)
                  const data: PassengerData = {
                    id: p.id, full_name: p.full_name, rut: p.rut, phone: p.phone, email: p.email,
                    status: p.status, notes: p.notes, contractIds: active.map(cp => cp.contract_id),
                  }
                  return (
                    <tr key={p.id} className="border-b border-raised last:border-0 align-top">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-fg">{p.full_name}</p>
                        <p className="text-[11px] text-muted">{p.rut}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-fg">{p.email ?? <span className="text-muted">—</span>}</p>
                        <p className="text-[11px] text-muted">{p.phone ?? ''}</p>
                      </td>
                      <td className="px-4 py-2.5 max-w-[260px]">
                        {active.length === 0 ? <span className="text-muted">Sin contrato</span> : (
                          <div className="flex flex-wrap gap-1">
                            {active.map(cp => (
                              <span key={cp.contract_id} className="px-1.5 py-0.5 rounded bg-sunken border border-line text-[10px] text-muted">
                                {cp.contracts?.contract_name ?? cp.contracts?.client_name ?? 'Contrato'}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span title={access.hint} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: access.bg, color: access.text }}>
                          {access.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{p.status === 'active' ? 'Activo' : 'Inactivo'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <PassengerFormModal contracts={contracts} passenger={data} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
