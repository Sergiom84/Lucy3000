import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { useAuthStore } from '../stores/authStore'
import {
  invalidateAppointmentProfessionalsCache
} from '../utils/appointmentCatalogs'
import api from '../utils/api'

type AccountRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE'

type Account = {
  id: string
  email: string
  username?: string | null
  name: string
  role: AccountRole
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

type AccountSettings = Account & {
  professionalNames: string[]
}

const ROLE_OPTIONS: Array<{
  value: AccountRole
  label: string
}> = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'EMPLOYEE', label: 'Empleado' }
]

const formatRoleLabel = (role: AccountRole) => ROLE_OPTIONS.find((option) => option.value === role)?.label || role

const formatCreatedAt = (value: string) =>
  new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))

export default function Accounts() {
  const { user, updateUser } = useAuthStore()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [role, setRole] = useState<AccountRole>('EMPLOYEE')
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
    const active = accounts.filter((account) => account.isActive).length
    const admins = accounts.filter((account) => account.role === 'ADMIN').length

    return {
      total: accounts.length,
      active,
      admins
    }
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

  const resetForm = () => {
    setName('')
    setEmail('')
    setUsername('')
    setPassword('')
    setPasswordConfirm('')
    setRole('EMPLOYEE')
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

  const handleCreateAccount = async (event: React.FormEvent) => {
    event.preventDefault()

    if (password !== passwordConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    setCreating(true)

    try {
      await api.post('/users', {
        name,
        email,
        username: username.trim() || undefined,
        password,
        role
      })
      toast.success('Cuenta creada')
      resetForm()
      await loadAccounts()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo crear la cuenta')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleStatus = async (account: Account) => {
    const nextStatus = !account.isActive

    setUpdatingId(account.id)

    try {
      await api.patch(`/users/${account.id}/status`, {
        isActive: nextStatus
      })
      toast.success(nextStatus ? 'Cuenta reactivada' : 'Cuenta desactivada')
      await loadAccounts()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo actualizar la cuenta')
    } finally {
      setUpdatingId(null)
    }
  }

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

  const addProfessionalDraft = () => {
    const nextValue = professionalDraft.trim()
    if (!nextValue) {
      return
    }

    const alreadyExists = settingsProfessionals.some(
      (professional) => professional.localeCompare(nextValue, 'es', { sensitivity: 'base' }) === 0
    )

    if (alreadyExists) {
      toast.error('Esa profesional ya está añadida')
      return
    }

    setSettingsProfessionals((current) => [...current, nextValue])
    setProfessionalDraft('')
  }

  const removeProfessional = (professionalToRemove: string) => {
    setSettingsProfessionals((current) =>
      current.filter(
        (professional) =>
          professional.localeCompare(professionalToRemove, 'es', { sensitivity: 'base' }) !== 0
      )
    )
  }

  const moveProfessional = (professionalToMove: string, direction: 'left' | 'right') => {
    setSettingsProfessionals((current) => {
      const currentIndex = current.findIndex(
        (professional) =>
          professional.localeCompare(professionalToMove, 'es', { sensitivity: 'base' }) === 0
      )

      if (currentIndex === -1) {
        return current
      }

      const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [movedProfessional] = next.splice(currentIndex, 1)
      next.splice(targetIndex, 0, movedProfessional)
      return next
    })
  }

  const handleSaveAccountSettings = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!editingAccountId) {
      return
    }

    if (settingsPassword && settingsPassword !== settingsPasswordConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    setSavingSettings(true)

    try {
      const response = await api.patch<AccountSettings>(`/users/${editingAccountId}/account-settings`, {
        name: settingsName,
        email: settingsEmail,
        username: settingsUsername.trim() || null,
        password: settingsPassword || undefined,
        professionalNames: settingsProfessionals
      })

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cuentas</h1>
        </div>

        <button onClick={() => void loadAccounts()} className="btn btn-secondary" disabled={loading}>
          Recargar
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Cuentas totales</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Cuentas activas</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{summary.active}</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Admins</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{summary.admins}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <form onSubmit={handleCreateAccount} className="card space-y-5">
          <div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nueva cuenta</h2>
            </div>
          </div>

          <div>
            <label className="label">Nombre visible</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="input"
              placeholder="Nombre que verá el equipo"
              required
            />
          </div>

          <div>
            <label className="label">Usuario para iniciar sesion</label>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="input"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="label">Correo electronico</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              placeholder="equipo@tu-negocio.com"
              required
            />
          </div>

          <div>
            <label className="label">Perfil</label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AccountRole)}
              className="input"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
              placeholder="Minimo 8 caracteres"
              minLength={8}
              required
            />
          </div>

          <div>
            <label className="label">Repetir contraseña</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              className="input"
              placeholder="Repite la contraseña"
              minLength={8}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={creating}>
            {creating ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <div className="card space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Equipo registrado</h2>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              Cargando cuentas...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No hay cuentas adicionales todavía.
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
                          <span className="badge badge-primary">{formatRoleLabel(account.role)}</span>
                        </td>
                        <td>
                          <span className={`badge ${account.isActive ? 'badge-success' : 'badge-warning'}`}>
                            {account.isActive ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td>{formatCreatedAt(account.createdAt)}</td>
                        <td className="text-right">
                          {isSelf ? (
                            <button
                              type="button"
                              onClick={() => void openAccountSettings(account.id)}
                              className="btn btn-secondary btn-sm"
                              disabled={editingLoading}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar cuenta
                            </button>
                          ) : (
                            <button
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

      <Modal
        isOpen={Boolean(editingAccountId)}
        onClose={savingSettings ? () => {} : resetEditingState}
        title="Editar tu cuenta"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveAccountSettings} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Nombre visible</label>
              <input
                type="text"
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Usuario para iniciar sesion</label>
              <input
                type="text"
                value={settingsUsername}
                onChange={(event) => setSettingsUsername(event.target.value)}
                className="input"
                placeholder="Opcional"
              />
            </div>

            <div>
              <label className="label">Correo electronico</label>
              <input
                type="email"
                value={settingsEmail}
                onChange={(event) => setSettingsEmail(event.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Nueva contraseña</label>
              <input
                type="password"
                value={settingsPassword}
                onChange={(event) => setSettingsPassword(event.target.value)}
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
                onChange={(event) => setSettingsPasswordConfirm(event.target.value)}
                className="input"
                placeholder="Solo si cambias la contraseña"
                minLength={8}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Profesionales del centro
                </h3>
              </div>
              <span className="badge badge-primary">{settingsProfessionals.length}</span>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={professionalDraft}
                onChange={(event) => setProfessionalDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addProfessionalDraft()
                  }
                }}
                className="input"
                placeholder=""
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
                      aria-label={`Mover ${professional} a la izquierda`}
                      disabled={index === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveProfessional(professional, 'right')}
                      className="ml-1 text-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Mover ${professional} a la derecha`}
                      disabled={index === settingsProfessionals.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeProfessional(professional)}
                      className="ml-1 text-primary-500 hover:text-primary-700"
                      aria-label={`Eliminar ${professional}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button type="button" onClick={resetEditingState} className="btn btn-secondary" disabled={savingSettings}>
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
