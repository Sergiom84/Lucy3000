import { useState } from 'react'
import { Clock, Lock, RefreshCw, LogOut, Hourglass, PlayCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import api from '../utils/api'
import toast from 'react-hot-toast'

type LicenseInfo = {
  status: string
  reason: string
  trialEndsAt?: string
}

const formatDate = (value?: string) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

const REASON_CONTENT: Record<
  string,
  { icon: typeof Lock; title: string; description: string }
> = {
  pending: {
    icon: Hourglass,
    title: 'Tu cuenta esta lista',
    description:
      'Cuando termines de configurar tu centro, empieza tu prueba gratuita de 7 dias. Hasta entonces puedes cerrar y volver otro dia; el reloj solo arranca cuando pulses "Empezar prueba".'
  },
  'pending-expired': {
    icon: Lock,
    title: 'Periodo de preparacion agotado',
    description:
      'Ha pasado el plazo para iniciar la prueba sin activarla. Ponte en contacto con soporte de Lucy3000 para activar tu cuenta.'
  },
  'trial-expired': {
    icon: Clock,
    title: 'Tu prueba ha finalizado',
    description:
      'El periodo de prueba de 7 dias ha terminado. Contacta con nosotros para activar tu suscripcion y recuperar el acceso completo.'
  },
  blocked: {
    icon: Lock,
    title: 'Acceso bloqueado',
    description:
      'El acceso a este centro esta bloqueado temporalmente. Ponte en contacto con soporte para resolverlo.'
  },
  cancelled: {
    icon: Lock,
    title: 'Suscripcion cancelada',
    description:
      'La suscripcion de este centro esta cancelada. Contacta con nosotros si quieres reactivarla.'
  },
  inactive: {
    icon: Lock,
    title: 'Licencia no activa',
    description:
      'La licencia de este centro no esta activa en este momento. Contacta con soporte para continuar.'
  }
}

export default function LicenseBlocked({ license }: { license: LicenseInfo }) {
  const { user, updateUser, logout } = useAuthStore()
  const [refreshing, setRefreshing] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)

  const content = REASON_CONTENT[license.reason] ?? REASON_CONTENT.inactive
  const Icon = content.icon
  const trialDate = formatDate(license.trialEndsAt)
  const canStartTrial = license.reason === 'pending'

  const handleStartTrial = async () => {
    setStartingTrial(true)
    try {
      await api.post('/tenants/current/start-trial')
      const me = await api.get('/auth/me')
      updateUser({ ...(user as any), ...me.data })
      toast.success('Prueba de 7 dias iniciada. ¡A trabajar!')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo iniciar la prueba')
    } finally {
      setStartingTrial(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const response = await api.get('/auth/me')
      updateUser({ ...(user as any), ...response.data })
      if (response.data?.license?.reason === 'active') {
        toast.success('Tu acceso ya esta activo')
      } else {
        toast('Tu acceso todavia no esta activo', { icon: 'ℹ️' })
      }
    } catch {
      toast.error('No se pudo comprobar el estado de la cuenta')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center mb-4">
              <Icon className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {content.title}
            </h1>
            {user?.tenant?.name ? (
              <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                {user.tenant.name}
              </p>
            ) : null}
            <p className="text-gray-600 dark:text-gray-300 mt-4">{content.description}</p>

            {license.reason === 'trial-expired' && trialDate ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Prueba finalizada el {trialDate}.
              </p>
            ) : null}

            <div className="mt-8 w-full space-y-3">
              {canStartTrial ? (
                <button
                  type="button"
                  onClick={handleStartTrial}
                  disabled={startingTrial}
                  className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
                >
                  <PlayCircle className="w-4 h-4" />
                  {startingTrial ? 'Iniciando prueba...' : 'Empezar prueba de 7 dias'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Comprobando...' : 'Ya esta activo, comprobar de nuevo'}
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="w-full btn btn-secondary py-3 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesion
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-white mt-6 text-sm">
          ¿Necesitas ayuda? Contacta con soporte de Lucy3000.
        </p>
      </div>
    </div>
  )
}
