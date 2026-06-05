import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Hash, ShieldCheck, Sparkles, Mail, Lock, User } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import api from '../utils/api'
import toast from 'react-hot-toast'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function Login() {
  const navigate = useNavigate()
  const { login, bootstrapChecked, bootstrapRequired, setBootstrapStatus } = useAuthStore()
  const [identifier, setIdentifier] = useState('')
  const [tenantCode, setTenantCode] = useState('')
  const [password, setPassword] = useState('')
  const [bootstrapBusinessName, setBootstrapBusinessName] = useState('')
  const [bootstrapName, setBootstrapName] = useState('')
  const [bootstrapUsername, setBootstrapUsername] = useState('')
  const [bootstrapEmail, setBootstrapEmail] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [bootstrapPasswordConfirm, setBootstrapPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingBootstrap, setCheckingBootstrap] = useState(!bootstrapChecked)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    let cancelled = false

    const checkBootstrapStatus = async () => {
      setCheckingBootstrap(true)

      try {
        const response = await api.get('/auth/bootstrap-status')
        if (!cancelled) {
          setBootstrapStatus(Boolean(response.data?.required))
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrapStatus(false)
          toast.error('No se pudo comprobar el estado inicial de la aplicacion')
        }
      } finally {
        if (!cancelled) {
          setCheckingBootstrap(false)
        }
      }
    }

    void checkBootstrapStatus()

    return () => {
      cancelled = true
    }
  }, [setBootstrapStatus])

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    setIsStandalone(standalone)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsStandalone(true)
      toast.success('Lucy3000 instalada')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) {
      toast('Usa el menu del navegador para instalar Lucy3000')
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)

    if (choice.outcome === 'accepted') {
      toast.success('Instalando Lucy3000')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await api.post('/auth/login', {
        identifier,
        password,
        tenantCode: tenantCode.trim()
      })
      const { token, user } = response.data

      login(user, token)
      if (user?.license?.status === 'TRIAL_EXPIRED' || user?.license?.status === 'BLOCKED') {
        toast.error('La licencia de este centro no esta activa')
      } else {
        toast.success('¡Bienvenido!')
      }
      navigate('/')
    } catch (error: any) {
      if (error.response?.status === 402 && error.response?.data?.token && error.response?.data?.user) {
        const { token, user } = error.response.data
        login(user, token)
        const reason = user?.license?.reason
        if (reason === 'pending') {
          toast('Tu cuenta esta pendiente de activacion', { icon: '⏳' })
        } else {
          toast.error('La licencia de este centro no esta activa')
        }
        navigate('/')
        return
      }

      toast.error(error.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (bootstrapPassword !== bootstrapPasswordConfirm) {
      toast.error('Las contrasenas no coinciden')
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/auth/bootstrap-admin', {
        businessName: bootstrapBusinessName || undefined,
        name: bootstrapName,
        username: bootstrapUsername || undefined,
        email: bootstrapEmail,
        password: bootstrapPassword
      })
      const { token, user } = response.data

      login(user, token)
      toast.success('Administrador inicial creado')
      navigate('/')
    } catch (error: any) {
      if (error.response?.status === 409) {
        setBootstrapStatus(false)
      }

      toast.error(error.response?.data?.error || 'Error al crear el primer administrador')
    } finally {
      setLoading(false)
    }
  }

  const isBootstrapMode = bootstrapChecked && bootstrapRequired

  if (!bootstrapChecked || checkingBootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-500 to-secondary-500 p-4 text-white">
        Comprobando configuracion inicial...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center mb-4">
              {isBootstrapMode ? (
                <ShieldCheck className="w-10 h-10 text-white" />
              ) : (
                <Sparkles className="w-10 h-10 text-white" />
              )}
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Lucy3000
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {isBootstrapMode
                ? 'Configura el primer usuario administrador'
                : 'Sistema de Gestion para Estetica'}
            </p>
          </div>

          {isBootstrapMode ? (
            <form onSubmit={handleBootstrapSubmit} className="space-y-5">
              <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                Este es un arranque limpio. Crea aqui el primer centro y su administrador.
              </div>

              <div>
                <label className="label">
                  <Sparkles className="w-4 h-4 inline mr-2" />
                  Nombre del centro
                </label>
                <input
                  type="text"
                  value={bootstrapBusinessName}
                  onChange={(e) => setBootstrapBusinessName(e.target.value)}
                  className="input"
                  placeholder="Lucy Estetica"
                  required
                />
              </div>

              <div>
                <label className="label">
                  <User className="w-4 h-4 inline mr-2" />
                  Nombre
                </label>
                <input
                  type="text"
                  value={bootstrapName}
                  onChange={(e) => setBootstrapName(e.target.value)}
                  className="input"
                  placeholder="Nombre del administrador"
                  required
                />
              </div>

              <div>
                <label className="label">
                  <User className="w-4 h-4 inline mr-2" />
                  Usuario para iniciar sesion
                </label>
                <input
                  type="text"
                  value={bootstrapUsername}
                  onChange={(e) => setBootstrapUsername(e.target.value)}
                  className="input"
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="label">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Correo electronico
                </label>
                <input
                  type="email"
                  value={bootstrapEmail}
                  onChange={(e) => setBootstrapEmail(e.target.value)}
                  className="input"
                  placeholder="admin@tu-negocio.com"
                  required
                />
              </div>

              <div>
                <label className="label">
                  <Lock className="w-4 h-4 inline mr-2" />
                  Contrasena
                </label>
                <input
                  type="password"
                  value={bootstrapPassword}
                  onChange={(e) => setBootstrapPassword(e.target.value)}
                  className="input"
                  placeholder="Minimo 8 caracteres"
                  minLength={8}
                  required
                />
              </div>

              <div>
                <label className="label">
                  <Lock className="w-4 h-4 inline mr-2" />
                  Repite la contrasena
                </label>
                <input
                  type="password"
                  value={bootstrapPasswordConfirm}
                  onChange={(e) => setBootstrapPasswordConfirm(e.target.value)}
                  className="input"
                  placeholder="Confirma la contrasena"
                  minLength={8}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn btn-primary py-3 text-lg"
              >
                {loading ? 'Creando administrador...' : 'Crear administrador y continuar'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="label">
                  <Hash className="w-4 h-4 inline mr-2" />
                  ID cliente
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value.replace(/\D/g, ''))}
                  className="input"
                  placeholder="1"
                  required
                />
              </div>

              <div>
                <label className="label">
                  <User className="w-4 h-4 inline mr-2" />
                  Usuario o correo
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">
                  <Lock className="w-4 h-4 inline mr-2" />
                  Contrasena
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn btn-primary py-3 text-lg"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </button>
            </form>
          )}

          {!isBootstrapMode && !isStandalone && installPrompt ? (
            <button
              type="button"
              onClick={handleInstallClick}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-200 dark:hover:bg-primary-900/40"
            >
              <Download className="h-4 w-4" />
              Instalar app
            </button>
          ) : null}
        </div>

        <p className="text-center text-white mt-6 text-sm">
          © 2026 Lucy3000. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}

