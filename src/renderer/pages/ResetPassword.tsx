import { FormEvent, useMemo, useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (password !== passwordConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      toast.success('Contraseña actualizada')
      navigate('/login')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo restablecer la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-500 to-secondary-500 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-800">
          <Link to="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Volver al login
          </Link>

          <div className="mb-7">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nueva contraseña</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Crea una contraseña nueva para tu cuenta de Lucy3000.
            </p>
          </div>

          {!token ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-100">
              El enlace no incluye un token válido. Solicita un nuevo enlace desde el login.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">
                  <Lock className="mr-2 inline h-4 w-4" />
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input"
                  minLength={8}
                  required
                />
              </div>

              <div>
                <label className="label">
                  <Lock className="mr-2 inline h-4 w-4" />
                  Repite la contraseña
                </label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  className="input"
                  minLength={8}
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3 text-base">
                {loading ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
