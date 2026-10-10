'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

type CompanyData = {
  id: string
  name: string
  rut: string | null
  business_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
}

interface Props {
  userEmail: string
  userName: string | null
  userRole: string
  companyId: string
  company: CompanyData
}

type TabId = 'empresa' | 'usuarios' | 'seguridad'

const TABS: { id: TabId; label: string }[] = [
  { id: 'empresa',  label: 'Empresa' },
  { id: 'usuarios', label: 'Usuario' },
  { id: 'seguridad',label: 'Seguridad' },
]

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Card({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-line">
        <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color: '#f1f5f9' }}>
          {title}
        </p>
        {subtitle && <p className="text-[12px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}{required && <span className="text-rose-300 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-[13px] border border-line rounded-md bg-surface text-fg placeholder-muted focus:outline-none focus:border-info-fg focus:ring-1 focus:ring-info-fg transition-colors'

function Badge({ children, color = 'gray' }: {
  children: React.ReactNode; color?: 'gray' | 'orange' | 'blue' | 'green'
}) {
  const s = {
    gray:   'bg-raised text-muted border-line',
    orange: 'bg-warn-bg text-accent border-[#755538]',
    blue:   'bg-info-bg text-info-fg border-[#355979]',
    green:  'bg-success-bg text-accent-soft border-[#28684e]',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${s[color]}`}>
      {children}
    </span>
  )
}

const roleLabelMap: Record<string, string> = {
  admin: 'Administrador', supervisor: 'Supervisor',
  operator: 'Operador',   viewer: 'Visualizador',
}

// ─── Tab: Empresa ─────────────────────────────────────────────────────────────

function TabEmpresa({ company, companyId }: { company: CompanyData; companyId: string }) {
  // contact_email is read-only in this form — not sent in updates.
  const contactEmail = company.contact_email ?? ''

  const [form, setForm] = useState({
    name:          company.name          ?? '',
    business_name: company.business_name ?? '',
    rut:           company.rut           ?? '',
    contact_phone: company.contact_phone ?? '',
    address:       company.address       ?? '',
  })
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  function set(k: keyof typeof form, v: string) {
    setForm(p => ({ ...p, [k]: v }))
    setSuccess(false)
    setError(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre visible de la empresa es obligatorio.'); return }
    setSaving(true); setError(null); setSuccess(false)
    try {
      const supabase = createClient()
      // Send only real, editable columns — never contact_email, status, created_at, deleted_at.
      const payload: Record<string, string> = {
        updated_at: new Date().toISOString(),
      }
      payload.name = form.name.trim()
      if (form.business_name.trim()) payload.business_name = form.business_name.trim()
      if (form.rut.trim())           payload.rut           = form.rut.trim()
      if (form.contact_phone.trim()) payload.contact_phone = form.contact_phone.trim()
      if (form.address.trim())       payload.address       = form.address.trim()

      const { error: sbErr } = await supabase
        .from('companies')
        .update(payload)
        .eq('id', companyId)

      if (sbErr) {
        setError(friendlyError(sbErr, 'No se pudieron guardar los datos de la empresa'))
      } else {
        setSuccess(true)
      }
    } catch (err) { setError(friendlyError(err, 'No se pudieron guardar los datos de la empresa')) }
    finally  { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <Card title="Perfil de Empresa" subtitle="Información visible en la operación y administración del panel.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre visible de la empresa" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ej: VLX Logística"
            />
          </Field>
          <Field label="Razón social">
            <input
              className={inputCls}
              value={form.business_name}
              onChange={e => set('business_name', e.target.value)}
              placeholder="Ej: VLX Logística SpA"
            />
          </Field>
          <Field label="RUT empresa">
            <input
              className={inputCls}
              value={form.rut}
              onChange={e => set('rut', e.target.value)}
              placeholder="Ej: 76.123.456-7"
            />
          </Field>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Correo de contacto
            </label>
            <div className="px-3 py-2 text-[13px] border border-line rounded-md bg-sunken text-muted select-all">
              {contactEmail || <span className="italic">Sin correo registrado</span>}
            </div>
          </div>
          <Field label="Teléfono">
            <input
              className={inputCls}
              value={form.contact_phone}
              onChange={e => set('contact_phone', e.target.value)}
              placeholder="+56 9 1234 5678"
            />
          </Field>
          <Field label="Dirección / base principal">
            <input
              className={inputCls}
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="Av. Principal 123, Santiago"
            />
          </Field>
        </div>

        {error && (
          <div className="mt-4 px-4 py-3 rounded-md bg-danger-bg border border-danger-line text-[12px] text-danger-fg">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 px-4 py-3 rounded-md bg-success-bg border border-[#28684e] text-[12px] text-[#86efac]">
            Datos guardados correctamente. El nombre visible se reflejará en el panel al recargar.
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: '#254b77' }}
          >
            {saving ? 'Guardando…' : 'Guardar Cambios'}
          </button>
        </div>
      </Card>

    </div>
  )
}

// ─── Tab: Usuarios ────────────────────────────────────────────────────────────

function TabUsuarios({ companyName, userEmail, userRole }: {
  companyName: string; userEmail: string; userRole: string
}) {
  return (
    <Card title="Usuario Actual">
      <div className="flex items-start gap-4">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[15px] font-bold"
          style={{ backgroundColor: '#254b77' }}
        >
          {(companyName || userEmail).slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold truncate" style={{ color: '#f1f5f9' }}>
            {companyName || 'VLXLOGISTIC'}
          </p>
          <p className="text-[13px] text-muted truncate">{userEmail}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge color="blue">{roleLabelMap[userRole] ?? userRole}</Badge>
            <Badge color="green">Activo</Badge>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Tab: Seguridad ───────────────────────────────────────────────────────────

function TabSeguridad({ userEmail, userRole }: { userEmail: string; userRole: string }) {
  return (
    <div className="space-y-4">
      <Card title="Sesión Actual" subtitle="Detalles de la sesión activa en este dispositivo.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Correo</p>
            <p className="text-[13px] truncate" style={{ color: '#f1f5f9' }}>{userEmail}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Rol</p>
            <p className="text-[13px]" style={{ color: '#f1f5f9' }}>{roleLabelMap[userRole] ?? userRole}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Estado</p>
            <Badge color="green">Activo</Badge>
          </div>
        </div>
      </Card>

      <Card title="Seguridad de Cuenta">
        <div className="space-y-3">
          {[
            { label: 'Cambiar contraseña',       desc: 'Actualiza tu contraseña de acceso al panel.' },
            { label: 'Recuperación por correo',  desc: 'Envío de enlace para restablecer contraseña.' },
            { label: 'Auditoría de accesos',     desc: 'Historial de inicios de sesión y acciones del sistema.' },
          ].map(item => (
            <div
              key={item.label}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-line bg-sunken"
            >
              <div>
                <p className="text-[13px] font-medium" style={{ color: '#f1f5f9' }}>{item.label}</p>
                <p className="text-[11px] text-muted mt-0.5">{item.desc}</p>
              </div>
              <Badge color="orange">Próx.</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ConfigClient({ userEmail, userRole, companyId, company }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('empresa')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: '#f1f5f9' }}>
          Configuración General
        </h2>
        <p className="text-[12px] text-muted mt-0.5">
          Administra la información visible de tu empresa en el panel.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex border-b border-line">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-5 py-3.5 text-[12px] font-semibold transition-colors relative ${
                activeTab === tab.id
                  ? 'text-fg'
                  : 'text-muted hover:text-fg hover:bg-sunken'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                  style={{ backgroundColor: '#10b98b' }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'empresa'   && <TabEmpresa  company={company} companyId={companyId} />}
          {activeTab === 'usuarios'  && <TabUsuarios  companyName={company.name} userEmail={userEmail} userRole={userRole} />}
          {activeTab === 'seguridad' && <TabSeguridad userEmail={userEmail} userRole={userRole} />}
        </div>
      </div>
    </div>
  )
}
