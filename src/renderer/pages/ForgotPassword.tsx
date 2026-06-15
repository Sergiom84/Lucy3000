import { FormEvent, useState } from 'react'
import { ArrowLeft, Hash, Mail, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

export default function ForgotPassword() {
  const [tenantCode, setTenantCode] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)

    try {
      await api.post('/auth/forgot-password', {
        tenantCode: tenantCode.trim(),
        identifier: identifier.trim()
      })
      setSent(true)
      toast.success('Si los datos son correctos, recibiras un correo en unos minutos')
    } catch {
      setSent(true)
      toast.success('Si los datos son correctos, recibiras un correo en unos minutos')
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recuperar contrasena</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Indica tu ID cliente y usuario o correo. Te enviaremos un enlace para crear una contrasena nueva.
            </p>
          </div>

          {sent ? (
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              Revisa tu correo. Si existe una cuenta con esos datos, el enlace de recuperacion caduca en 30 minutos.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">
                  <Hash className="mr-2 inline h-4 w-4" />
                  ID cliente
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={tenantCode}
                  onChange={(event) => setTenantCode(event.target.value.replace(/\D/g, ''))}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">
                  <User className="mr-2 inline h-4 w-4" />
                  Usuario o correo
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="input"
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary flex w-full items-center justify-center gap-2 py-3 text-base">
                <Mail className="h-4 w-4" />
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
