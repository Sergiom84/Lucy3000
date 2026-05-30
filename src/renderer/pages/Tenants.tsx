import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  RefreshCw,
  PlayCircle,
  CheckCircle2,
  CalendarPlus,
  Ban,
  XCircle
} from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

type TenantLicense = {
  id: string
  status: string
  reason: string
  plan: string
  trialEndsAt: string | null
  activatedAt: string | null
  blockedAt: string | null
  cancelledAt: string | null
  notes: string | null
}

type TenantUser = {
  id: string
  email: string
  username: string | null
  name: string
  role: string
  isActive: boolean
  isPlatformAdmin: boolean
}

type Tenant = {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string
  updatedAt: string
  license: TenantLicense | null
  users: TenantUser[]
}

type LicensePayload = {
  status?: string
  plan?: string
  trialEndsAt?: string
  blockedAt?: string | null
  cancelledAt?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  TRIAL: 'En prueba',
  ACTIVE: 'Activo',
  TRIAL_EXPIRED: 'Prueba caducada',
  BLOCKED: 'Bloqueado',
  CANCELLED: 'Cancelado'
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  TRIAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  TRIAL_EXPIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  BLOCKED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  CANCELLED: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

const daysLeft = (value: string | null) => {
  if (!value) return null
  const ms = new Date(value).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

const addDaysIso = (base: number, days: number) => {
  const date = new Date(base)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/tenants')
      setTenants(Array.isArray(response.data) ? response.data : [])
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudieron cargar los centros')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const applyLicense = async (tenant: Tenant, payload: LicensePayload, successMessage: string) => {
    setBusyId(tenant.id)
    try {
      await api.put(`/tenants/${tenant.id}/license`, payload)
      toast.success(successMessage)
      await load()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo actualizar la licencia')
    } finally {
      setBusyId(null)
    }
  }

  const startTrial = (tenant: Tenant) =>
    applyLicense(tenant, { status: 'TRIAL', plan: 'trial' }, 'Prueba de 7 dias iniciada')

  const extendTrial = (tenant: Tenant) => {
    const current = tenant.license?.trialEndsAt
      ? new Date(tenant.license.trialEndsAt).getTime()
      : Date.now()
    const base = Math.max(current, Date.now())
    applyLicense(
      tenant,
      { status: 'TRIAL', trialEndsAt: addDaysIso(base, 7) },
      'Prueba ampliada 7 dias mas'
    )
  }

  const activate = (tenant: Tenant) =>
    applyLicense(tenant, { status: 'ACTIVE', plan: 'pro' }, 'Centro activado')

  const block = (tenant: Tenant) =>
    applyLicense(
      tenant,
      { status: 'BLOCKED', blockedAt: new Date().toISOString() },
      'Centro bloqueado'
    )

  const cancel = (tenant: Tenant) => {
    if (!window.confirm(`¿Cancelar la suscripcion de "${tenant.name}"? El centro perdera el acceso.`)) {
      return
    }
    applyLicense(
      tenant,
      { status: 'CANCELLED', cancelledAt: new Date().toISOString() },
      'Suscripcion cancelada'
    )
  }

  const summary = useMemo(() => {
    const counts = { PENDING: 0, TRIAL: 0, ACTIVE: 0, otros: 0 }
    for (const tenant of tenants) {
      const status = tenant.license?.status ?? 'otros'
      if (status === 'PENDING') counts.PENDING += 1
      else if (status === 'TRIAL') counts.TRIAL += 1
      else if (status === 'ACTIVE') counts.ACTIVE += 1
      else counts.otros += 1
    }
    return counts
  }, [tenants])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-600" />
            Centros
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Activa la prueba, amplia, bloquea o cancela cada centro. La prueba de 7 dias arranca cuando
            das el OK, no al instalar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="btn btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Pendientes" value={summary.PENDING} accent="text-amber-600" />
        <SummaryCard label="En prueba" value={summary.TRIAL} accent="text-blue-600" />
        <SummaryCard label="Activos" value={summary.ACTIVE} accent="text-green-600" />
        <SummaryCard label="Total" value={tenants.length} accent="text-gray-700 dark:text-gray-200" />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">Cargando centros...</div>
      ) : tenants.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
          Todavia no hay centros creados.
        </div>
      ) : (
        <div className="space-y-4">
          {tenants.map((tenant) => {
            const status = tenant.license?.status ?? 'PENDING'
            const trialDays = status === 'TRIAL' ? daysLeft(tenant.license?.trialEndsAt ?? null) : null
            const busy = busyId === tenant.id
            const admin = tenant.users.find((u) => u.role === 'ADMIN') ?? tenant.users[0]

            return (
              <div
                key={tenant.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {tenant.name}
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLE[status] ?? STATUS_STYLE.CANCELLED
                        }`}
                      >
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Slug: <span className="font-mono">{tenant.slug}</span>
                      {admin ? ` · Admin: ${admin.email}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Plan: {tenant.license?.plan ?? '—'} · Prueba hasta:{' '}
                      {formatDate(tenant.license?.trialEndsAt ?? null)}
                      {trialDays !== null
                        ? ` (${trialDays > 0 ? `${trialDays} dias restantes` : 'caducada'})`
                        : ''}
                      {tenant.license?.activatedAt
                        ? ` · Activado: ${formatDate(tenant.license.activatedAt)}`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {(status === 'PENDING' || status === 'TRIAL_EXPIRED' || status === 'CANCELLED') && (
                    <ActionButton
                      onClick={() => startTrial(tenant)}
                      disabled={busy}
                      icon={PlayCircle}
                      label="Iniciar prueba 7 dias"
                      variant="primary"
                    />
                  )}
                  {status === 'TRIAL' && (
                    <ActionButton
                      onClick={() => extendTrial(tenant)}
                      disabled={busy}
                      icon={CalendarPlus}
                      label="Ampliar 7 dias"
                      variant="secondary"
                    />
                  )}
                  {status !== 'ACTIVE' && (
                    <ActionButton
                      onClick={() => activate(tenant)}
                      disabled={busy}
                      icon={CheckCircle2}
                      label="Activar (pago)"
                      variant="primary"
                    />
                  )}
                  {status !== 'BLOCKED' && status !== 'CANCELLED' && (
                    <ActionButton
                      onClick={() => block(tenant)}
                      disabled={busy}
                      icon={Ban}
                      label="Bloquear"
                      variant="warning"
                    />
                  )}
                  {status !== 'CANCELLED' && (
                    <ActionButton
                      onClick={() => cancel(tenant)}
                      disabled={busy}
                      icon={XCircle}
                      label="Cancelar"
                      variant="danger"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  )
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  label,
  variant
}: {
  onClick: () => void
  disabled: boolean
  icon: typeof PlayCircle
  label: string
  variant: 'primary' | 'secondary' | 'warning' | 'danger'
}) {
  const styles: Record<string, string> = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700',
    secondary:
      'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${styles[variant]}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}
