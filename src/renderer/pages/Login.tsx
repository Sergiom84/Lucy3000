import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Mail, Lock } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Lucy3000
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Sistema de Gestión para Estética
            </p>
          </div>

          {/* Form */}
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
                Contraseña
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
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
              Demo: admin@lucy3000.com / admin123
            </p>
          </div>
        </div>

        <p className="text-center text-white mt-6 text-sm">
          © 2024 Lucy3000. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}

