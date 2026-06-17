import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Package,
  Pencil,
  Scissors,
  Settings,
  ShoppingCart,
  Trophy,
  Users,
  Wallet,
  X
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { useAuthStore } from '../stores/authStore'
import type { UserPermissions } from '../stores/authStore'
import { invalidateAppointmentProfessionalsCache } from '../utils/appointmentCatalogs'
import api from '../utils/api'

type AccountRole = 'ADMIN' | 'EMPLOYEE'

type Account = {
  id: string
  email: string
  username?: string | null
  name: string
  role: AccountRole
  isActive: boolean
  createdAt: string
  permissions?: UserPermissions | null
}

type AccountSettings = Account & {
  professionalNames: string[]
}

const ALL_SECTION_KEYS = [
  'dashboard',
  'clients',
  'ranking',
  'appointments',
  'services',
  'products',
  'sales',
  'cash',
  'settings'
]

const CONFIGURABLE_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'clients', label: 'Clientes', Icon: Users },
  { key: 'ranking', label: 'Ranking', Icon: Trophy },
  { key: 'appointments', label: 'Citas', Icon: Calendar },
  { key: 'services', label: 'Servicios', Icon: Scissors },
  { key: 'products', label: 'Productos', Icon: Package },
  { key: 'sales', label: 'Ventas', Icon: ShoppingCart },
  { key: 'cash', label: 'Caja', Icon: Wallet },
  { key: 'settings', label: 'Configuración', Icon: Settings }
] as const

const formatCreatedAt = (value: string) =>
  new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))

function SectionToggleGrid({
  sections,
  onToggle,
  cashPayments,
  cashBalance,
  onCashPaymentsToggle,
  onCashBalanceToggle
}: {
  sections: string[]
  onToggle: (key: string) => void
  cashPayments: boolean
  cashBalance: boolean
  onCashPaymentsToggle: (v: boolean) => void
  onCashBalanceToggle: (v: boolean) => void
}) {
  const hasCash = sections.includes('cash')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CONFIGURABLE_SECTIONS.map(({ key, label, Icon }) => {
          const isActive = sections.includes(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                isActive
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-300'
                  : 'border-gray-200 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          )
        })}
      </div>

      {hasCash && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Detalle visible en Caja
          </p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={cashPayments}
                onChange={(e) => onCashPaymentsToggle(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Ver pagos por método (Efectivo, Tarjeta, Bizum, Abono)
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={cashBalance}
                onChange={(e) => onCashBalanceToggle(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Ver saldo actual en caja
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

function WizardStepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Datos', 'Acceso', 'Revisar']
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {steps.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                done
                  ? 'bg-primary-600 text-white'
                  : active
                    ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              }`}
            >
              {n}
            </div>
            <span
              className={`text-sm font-medium ${active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="mx-1 h-px w-6 bg-gray-200 dark:bg-gray-700" />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function Accounts() {
  const { user, updateUser } = useAuthStore()

  // ---- accounts list ----
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // ---- wizard state ----
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [wizardIsAdmin, setWizardIsAdmin] = useState(false)
  const [wizardName, setWizardName] = useState('')
  const [wizardUsername, setWizardUsername] = useState('')
  const [wizardEmail, setWizardEmail] = useState('')
  const [wizardPassword, setWizardPassword] = useState('')
  const [wizardPasswordConfirm, setWizardPasswordConfirm] = useState('')
  const [wizardSections, setWizardSections] = useState<string[]>(ALL_SECTION_KEYS)
  const [wizardCashPayments, setWizardCashPayments] = useState(true)
  const [wizardCashBalance, setWizardCashBalance] = useState(true)
  const [wizardCreating, setWizardCreating] = useState(false)

  // ---- permissions modal (editing other users) ----
  const [permUserId, setPermUserId] = useState<string | null>(null)
  const [permIsAdmin, setPermIsAdmin] = useState(false)
  const [permSections, setPermSections] = useState<string[]>(ALL_SECTION_KEYS)
  const [permCashPayments, setPermCashPayments] = useState(true)
  const [permCashBalance, setPermCashBalance] = useState(true)
  const [permSaving, setPermSaving] = useState(false)

  // ---- self edit modal ----
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editingLoading, setEditingLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsName, setSettingsName] = useState('')
  const [settingsEmail, setSettingsEmail] = useState('')
  const [settingsUsername, setSettingsUsername] = useState('')
  const [settingsPassword, setSettingsPassword] = useState('')
  const [settingsPasswordConfirm, setSettingsPasswordConfirm] = useState('')
  const [settingsProfessionals, setSettingsProfessionals] = useState<string[]>([])
  const [professionalDraft, setProfessionalDraft] = useState('')

  const summary = useMemo(() => {
    const active = accounts.filter((a) => a.isActive).length
    const admins = accounts.filter((a) => a.role === 'ADMIN').length
    return { total: accounts.length, active, admins }
  }, [accounts])

  const loadAccounts = async () => {
    try {
      setLoading(true)
      const response = await api.get<Account[]>('/users')
      setAccounts(response.data)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudieron cargar las cuentas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAccounts()
  }, [])

  // ---- wizard helpers ----
  const resetWizard = () => {
    setWizardOpen(false)
    setWizardStep(1)
    setWizardIsAdmin(false)
    setWizardName('')
    setWizardUsername('')
    setWizardEmail('')
    setWizardPassword('')
    setWizardPasswordConfirm('')
    setWizardSections(ALL_SECTION_KEYS)
    setWizardCashPayments(true)
    setWizardCashBalance(true)
  }

  const handleWizardStep1Next = () => {
    if (!wizardName.trim() || !wizardEmail.trim() || !wizardPassword) {
      toast.error('Nombre, email y contraseña son obligatorios')
      return
    }
    if (wizardPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (wizardPassword !== wizardPasswordConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (wizardIsAdmin) {
      setWizardStep(3)
    } else {
      setWizardStep(2)
    }
  }

  const toggleWizardSection = (key: string) => {
    setWizardSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const handleWizardCreate = async () => {
    setWizardCreating(true)
    try {
      const permissions: UserPermissions = wizardIsAdmin
        ? {}
        : {
            sections: wizardSections,
            cash: wizardSections.includes('cash')
              ? {
                  showPaymentsByMethod: wizardCashPayments,
                  showCurrentBalance: wizardCashBalance
                }
              : undefined
          }

      await api.post('/users', {
        name: wizardName.trim(),
        email: wizardEmail.trim(),
        username: wizardUsername.trim() || undefined,
        password: wizardPassword,
        role: wizardIsAdmin ? 'ADMIN' : 'EMPLOYEE',
        permissions
      })
      toast.success('Cuenta creada')
      resetWizard()
      await loadAccounts()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo crear la cuenta')
    } finally {
      setWizardCreating(false)
    }
  }

  // ---- permissions modal helpers ----
  const openPermissions = (account: Account) => {
    const perms = account.permissions
    setPermUserId(account.id)
    setPermIsAdmin(account.role === 'ADMIN')
    setPermSections(perms?.sections ?? ALL_SECTION_KEYS)
    setPermCashPayments(perms?.cash?.showPaymentsByMethod !== false)
    setPermCashBalance(perms?.cash?.showCurrentBalance !== false)
  }

  const closePermissions = () => {
    setPermUserId(null)
  }

  const togglePermSection = (key: string) => {
    setPermSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const handleSavePermissions = async () => {
    if (!permUserId) return
    setPermSaving(true)
    try {
      const permissions: UserPermissions = permIsAdmin
        ? {}
        : {
            sections: permSections,
            cash: permSections.includes('cash')
              ? {
                  showPaymentsByMethod: permCashPayments,
                  showCurrentBalance: permCashBalance
                }
              : undefined
          }

      await api.patch(`/users/${permUserId}/permissions`, {
        role: permIsAdmin ? 'ADMIN' : 'EMPLOYEE',
        permissions
      })
      toast.success('Permisos actualizados')
      closePermissions()
      await loadAccounts()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudieron guardar los permisos')
    } finally {
      setPermSaving(false)
    }
  }

  // ---- status toggle ----
  const handleToggleStatus = async (account: Account) => {
    const nextStatus = !account.isActive
    setUpdatingId(account.id)
    try {
      await api.patch(`/users/${account.id}/status`, { isActive: nextStatus })
      toast.success(nextStatus ? 'Cuenta reactivada' : 'Cuenta desactivada')
      await loadAccounts()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo actualizar la cuenta')
    } finally {
      setUpdatingId(null)
    }
  }

  // ---- self edit ----
  const openAccountSettings = async (accountId: string) => {
    try {
      setEditingLoading(true)
      const response = await api.get<AccountSettings>(`/users/${accountId}/account-settings`)
      const settings = response.data
      setEditingAccountId(accountId)
      setSettingsName(settings.name)
      setSettingsEmail(settings.email)
      setSettingsUsername(settings.username || '')
      setSettingsPassword('')
      setSettingsPasswordConfirm('')
      setSettingsProfessionals(settings.professionalNames || [])
      setProfessionalDraft('')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo cargar la configuración de la cuenta')
    } finally {
      setEditingLoading(false)
    }
  }

  const resetEditingState = () => {
    setEditingAccountId(null)
    setSettingsName('')
    setSettingsEmail('')
    setSettingsUsername('')
    setSettingsPassword('')
    setSettingsPasswordConfirm('')
    setSettingsProfessionals([])
    setProfessionalDraft('')
  }

  const addProfessionalDraft = () => {
    const nextValue = professionalDraft.trim()
    if (!nextValue) return
    const alreadyExists = settingsProfessionals.some(
      (p) => p.localeCompare(nextValue, 'es', { sensitivity: 'base' }) === 0
    )
    if (alreadyExists) {
      toast.error('Esa profesional ya está añadida')
      return
    }
    setSettingsProfessionals((current) => [...current, nextValue])
    setProfessionalDraft('')
  }

  const removeProfessional = (name: string) => {
    setSettingsProfessionals((current) =>
      current.filter((p) => p.localeCompare(name, 'es', { sensitivity: 'base' }) !== 0)
    )
  }

  const moveProfessional = (name: string, direction: 'left' | 'right') => {
    setSettingsProfessionals((current) => {
      const idx = current.findIndex(
        (p) => p.localeCompare(name, 'es', { sensitivity: 'base' }) === 0
      )
      if (idx === -1) return current
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(idx, 1)
      next.splice(targetIdx, 0, moved)
      return next
    })
  }

  const handleSaveAccountSettings = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingAccountId) return
    if (settingsPassword && settingsPassword !== settingsPasswordConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setSavingSettings(true)
    try {
      const response = await api.patch<AccountSettings>(
        `/users/${editingAccountId}/account-settings`,
        {
          name: settingsName,
          email: settingsEmail,
          username: settingsUsername.trim() || null,
          password: settingsPassword || undefined,
          professionalNames: settingsProfessionals
        }
      )
      const updatedAccount = response.data
      invalidateAppointmentProfessionalsCache()
      await loadAccounts()
      if (updatedAccount.id === user?.id) {
        updateUser({
          id: updatedAccount.id,
          email: updatedAccount.email,
          username: updatedAccount.username || null,
          name: updatedAccount.name,
          role: updatedAccount.role
        })
      }
      toast.success('Cuenta actualizada')
      resetEditingState()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo guardar la cuenta')
    } finally {
      setSavingSettings(false)
    }
  }

  const permAccount = permUserId ? accounts.find((a) => a.id === permUserId) : null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cuentas</h1>
        <div className="flex gap-3">
          <button onClick={() => void loadAccounts()} className="btn btn-secondary" disabled={loading}>
            Recargar
          </button>
          <button onClick={() => setWizardOpen(true)} className="btn btn-primary">
            Nueva cuenta
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <span className="text-sm text-gray-600 dark:text-gray-400">Cuentas totales</span>
          <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
        </div>
        <div className="card">
          <span className="text-sm text-gray-600 dark:text-gray-400">Cuentas activas</span>
          <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{summary.active}</p>
        </div>
        <div className="card">
          <span className="text-sm text-gray-600 dark:text-gray-400">Admins</span>
          <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{summary.admins}</p>
        </div>
      </div>

      {/* Accounts table */}
      <div className="card space-y-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Equipo registrado</h2>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            Cargando cuentas...
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No hay cuentas todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Perfil</th>
                  <th>Estado</th>
                  <th>Alta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const isSelf = account.id === user?.id
                  const isEmployee = account.role === 'EMPLOYEE'
                  return (
                    <tr key={account.id}>
                      <td>
                        <div>
                          <p className="font-semibold">{account.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {account.username ? `${account.username} · ` : ''}
                            {account.email}
                          </p>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-primary">
                          {account.role === 'ADMIN' ? 'Admin' : 'Empleado'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${account.isActive ? 'badge-success' : 'badge-warning'}`}
                        >
                          {account.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>{formatCreatedAt(account.createdAt)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isSelf && (
                            <button
                              type="button"
                              onClick={() => void openAccountSettings(account.id)}
                              className="btn btn-secondary btn-sm"
                              disabled={editingLoading}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Mi cuenta
                            </button>
                          )}
                          {!isSelf && isEmployee && (
                            <button
                              type="button"
                              onClick={() => openPermissions(account)}
                              className="btn btn-secondary btn-sm"
                            >
                              Permisos
                            </button>
                          )}
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => void handleToggleStatus(account)}
                              className="btn btn-secondary btn-sm"
                              disabled={updatingId === account.id}
                            >
                              {updatingId === account.id
                                ? 'Guardando...'
                                : account.isActive
                                  ? 'Desactivar'
                                  : 'Reactivar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- WIZARD: Nueva cuenta ---- */}
      <Modal
        isOpen={wizardOpen}
        onClose={wizardCreating ? () => {} : resetWizard}
        title="Nueva cuenta"
        maxWidth="2xl"
      >
        <WizardStepIndicator step={wizardStep} />

        {/* Step 1: datos básicos */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Nombre visible *</label>
                <input
                  type="text"
                  value={wizardName}
                  onChange={(e) => setWizardName(e.target.value)}
                  className="input"
                  placeholder="Nombre del empleado"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Usuario para login</label>
                <input
                  type="text"
                  value={wizardUsername}
                  onChange={(e) => setWizardUsername(e.target.value)}
                  className="input"
                  placeholder="Opcional"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Correo electrónico *</label>
                <input
                  type="email"
                  value={wizardEmail}
                  onChange={(e) => setWizardEmail(e.target.value)}
                  className="input"
                  placeholder="email@negocio.com"
                />
              </div>
              <div>
                <label className="label">Contraseña *</label>
                <input
                  type="password"
                  value={wizardPassword}
                  onChange={(e) => setWizardPassword(e.target.value)}
                  className="input"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className="label">Repetir contraseña *</label>
                <input
                  type="password"
                  value={wizardPasswordConfirm}
                  onChange={(e) => setWizardPasswordConfirm(e.target.value)}
                  className="input"
                  placeholder="Repite la contraseña"
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    ¿Es administrador?
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Los admins tienen acceso total sin restricciones
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={wizardIsAdmin}
                  onClick={() => setWizardIsAdmin((v) => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    wizardIsAdmin ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      wizardIsAdmin ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button type="button" onClick={resetWizard} className="btn btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={handleWizardStep1Next} className="btn btn-primary">
                {wizardIsAdmin ? 'Revisar' : 'Siguiente: Acceso'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: acceso a secciones */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Selecciona qué secciones verá <strong>{wizardName}</strong> al iniciar sesión.
            </p>
            <SectionToggleGrid
              sections={wizardSections}
              onToggle={toggleWizardSection}
              cashPayments={wizardCashPayments}
              cashBalance={wizardCashBalance}
              onCashPaymentsToggle={setWizardCashPayments}
              onCashBalanceToggle={setWizardCashBalance}
            />
            <div className="flex justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                className="btn btn-secondary"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => setWizardStep(3)}
                className="btn btn-primary"
              >
                Revisar
              </button>
            </div>
          </div>
        )}

        {/* Step 3: revisión */}
        {wizardStep === 3 && (
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 dark:border-gray-700 dark:divide-gray-700">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Nombre</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{wizardName}</span>
              </div>
              {wizardEmail && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Email</span>
                  <span className="text-sm text-gray-900 dark:text-white">{wizardEmail}</span>
                </div>
              )}
              {wizardUsername && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Usuario</span>
                  <span className="text-sm text-gray-900 dark:text-white">{wizardUsername}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Perfil</span>
                <span className="badge badge-primary">
                  {wizardIsAdmin ? 'Admin' : 'Empleado'}
                </span>
              </div>
              {!wizardIsAdmin && (
                <div className="px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Secciones visibles</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {wizardSections.length === 0 ? (
                      <span className="text-sm text-gray-400">Ninguna</span>
                    ) : (
                      wizardSections.map((key) => {
                        const section = CONFIGURABLE_SECTIONS.find((s) => s.key === key)
                        return (
                          <span
                            key={key}
                            className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          >
                            {section?.label ?? key}
                          </span>
                        )
                      })
                    )}
                  </div>
                  {wizardSections.includes('cash') && (
                    <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <p>
                        Pagos por método:{' '}
                        <strong className={wizardCashPayments ? 'text-green-600' : 'text-gray-400'}>
                          {wizardCashPayments ? 'visible' : 'oculto'}
                        </strong>
                      </p>
                      <p>
                        Saldo actual:{' '}
                        <strong className={wizardCashBalance ? 'text-green-600' : 'text-gray-400'}>
                          {wizardCashBalance ? 'visible' : 'oculto'}
                        </strong>
                      </p>
                    </div>
                  )}
                </div>
              )}
              {wizardIsAdmin && (
                <div className="px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Acceso</span>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    Acceso total a todas las secciones
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setWizardStep(wizardIsAdmin ? 1 : 2)}
                className="btn btn-secondary"
                disabled={wizardCreating}
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => void handleWizardCreate()}
                className="btn btn-primary"
                disabled={wizardCreating}
              >
                {wizardCreating ? 'Creando cuenta...' : 'Crear cuenta'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- MODAL: Permisos de empleado ---- */}
      <Modal
        isOpen={Boolean(permUserId)}
        onClose={permSaving ? () => {} : closePermissions}
        title={`Permisos — ${permAccount?.name ?? ''}`}
        maxWidth="2xl"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  ¿Es administrador?
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Los admins tienen acceso total sin restricciones
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={permIsAdmin}
                onClick={() => setPermIsAdmin((v) => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  permIsAdmin ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    permIsAdmin ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>

          {!permIsAdmin && (
            <SectionToggleGrid
              sections={permSections}
              onToggle={togglePermSection}
              cashPayments={permCashPayments}
              cashBalance={permCashBalance}
              onCashPaymentsToggle={setPermCashPayments}
              onCashBalanceToggle={setPermCashBalance}
            />
          )}

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={closePermissions}
              className="btn btn-secondary"
              disabled={permSaving}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSavePermissions()}
              className="btn btn-primary"
              disabled={permSaving}
            >
              {permSaving ? 'Guardando...' : 'Guardar permisos'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- MODAL: Editar mi cuenta (self) ---- */}
      <Modal
        isOpen={Boolean(editingAccountId)}
        onClose={savingSettings ? () => {} : resetEditingState}
        title="Editar mi cuenta"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveAccountSettings} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Nombre visible</label>
              <input
                type="text"
                value={settingsName}
                onChange={(e) => setSettingsName(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Usuario para login</label>
              <input
                type="text"
                value={settingsUsername}
                onChange={(e) => setSettingsUsername(e.target.value)}
                className="input"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="label">Correo electrónico</label>
              <input
                type="email"
                value={settingsEmail}
                onChange={(e) => setSettingsEmail(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Nueva contraseña</label>
              <input
                type="password"
                value={settingsPassword}
                onChange={(e) => setSettingsPassword(e.target.value)}
                className="input"
                placeholder="Déjala vacía si no cambia"
                minLength={8}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Repetir nueva contraseña</label>
              <input
                type="password"
                value={settingsPasswordConfirm}
                onChange={(e) => setSettingsPasswordConfirm(e.target.value)}
                className="input"
                placeholder="Solo si cambias la contraseña"
                minLength={8}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Profesionales del centro
              </h3>
              <span className="badge badge-primary">{settingsProfessionals.length}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={professionalDraft}
                onChange={(e) => setProfessionalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addProfessionalDraft()
                  }
                }}
                className="input"
              />
              <button type="button" onClick={addProfessionalDraft} className="btn btn-secondary">
                Añadir
              </button>
            </div>
            {settingsProfessionals.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No hay profesionales configuradas todavía.
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {settingsProfessionals.map((professional, index) => (
                  <span
                    key={professional}
                    className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-sm text-primary-700 dark:border-primary-700/40 dark:bg-primary-900/20 dark:text-primary-200"
                  >
                    {professional}
                    <button
                      type="button"
                      onClick={() => moveProfessional(professional, 'left')}
                      className="ml-2 text-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={index === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveProfessional(professional, 'right')}
                      className="ml-1 text-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={index === settingsProfessionals.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeProfessional(professional)}
                      className="ml-1 text-primary-500 hover:text-primary-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={resetEditingState}
              className="btn btn-secondary"
              disabled={savingSettings}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingSettings}>
              {savingSettings ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
