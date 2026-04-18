import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Sparkles, Mail, Lock, User } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function Login() {
  const navigate = useNavigate()
  const { login, bootstrapChecked, bootstrapRequired, setBootstrapStatus } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bootstrapName, setBootstrapName] = useState('')
  const [bootstrapEmail, setBootstrapEmail] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [bootstrapPasswordConfirm, setBootstrapPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingBootstrap, setCheckingBootstrap] = useState(!bootstrapChecked)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await api.post('/auth/login', { email, password })
      const { token, user } = response.data
      
      login(user, token)
      toast.success('¡Bienvenido!')
      navigate('/')
    } catch (error: any) {
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
        name: bootstrapName,
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
                Este es un arranque limpio. Crea aqui el primer administrador y Lucy3000 quedara lista para uso normal.
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
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email
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
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="tu@email.com"
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
                  placeholder="••••••••"
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
        </div>

        <p className="text-center text-white mt-6 text-sm">
          © 2026 Lucy3000. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}

