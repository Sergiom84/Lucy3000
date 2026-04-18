import { CalendarPlus, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime } from '../utils/format'

interface BonoSession {
  id: string
  sessionNumber: number
  status: 'AVAILABLE' | 'CONSUMED'
  consumedAt: string | null
  appointment?: {
    id: string
    date: string
    startTime: string
    endTime: string
    status: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
    cabin: 'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'
  } | null
}

interface BonoCardProps {
  bonoPack: {
    id: string
    name: string
    totalSessions: number
    price: any
    purchaseDate: string
    expiryDate: string | null
    status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
    notes: string | null
    service: { id: string; name: string } | null
    sessions: BonoSession[]
  }
  onConsume: (bonoPackId: string) => void
  onDelete: (bonoPackId: string) => void
  onScheduleAppointment: (bonoPackId: string) => void
}

const statusBadge: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Activo', className: 'badge-success' },
  DEPLETED: { label: 'Agotado', className: 'badge-secondary' },
  EXPIRED: { label: 'Expirado', className: 'badge-danger' }
}

const toAppointmentDateTime = (appointment: { date: string; startTime: string }) => {
  const value = new Date(appointment.date)
  const [hours, minutes] = String(appointment.startTime || '00:00')
    .split(':')
    .map((item) => Number.parseInt(item, 10))
  value.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return value
}

const getCabinLabel = (cabin: string) => cabin.replace('CABINA_', 'Cabina ')

export default function BonoCard({ bonoPack, onConsume, onDelete, onScheduleAppointment }: BonoCardProps) {
  const consumed = bonoPack.sessions.filter(s => s.status === 'CONSUMED').length
  const remainingSessions = Math.max(bonoPack.totalSessions - consumed, 0)
  const badge = statusBadge[bonoPack.status] || statusBadge.ACTIVE
  const now = new Date()

  const futureReservations = bonoPack.sessions
    .filter((session) => {
      if (session.status !== 'AVAILABLE' || !session.appointment) return false
      if (session.appointment.status === 'CANCELLED' || session.appointment.status === 'NO_SHOW' || session.appointment.status === 'COMPLETED') {
        return false
      }
      return toAppointmentDateTime(session.appointment) > now
    })
    .sort((a, b) => {
      if (!a.appointment || !b.appointment) return 0
      return toAppointmentDateTime(a.appointment).getTime() - toAppointmentDateTime(b.appointment).getTime()
    })

  const consumedHistory = bonoPack.sessions
    .filter((session) => session.status === 'CONSUMED' && session.consumedAt)
    .sort((a, b) => {
      const aTime = new Date(a.consumedAt || 0).getTime()
      const bTime = new Date(b.consumedAt || 0).getTime()
      return bTime - aTime
    })

  const reservableSessions = bonoPack.sessions.filter(
    (session) => session.status === 'AVAILABLE' && !session.appointment
  ).length

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-base font-semibold text-gray-900 dark:text-white">
            {bonoPack.name}
          </h4>
          {bonoPack.service && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {bonoPack.service.name}
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Comprado: {formatDate(bonoPack.purchaseDate)}
            {bonoPack.expiryDate && ` | Caduca: ${formatDate(bonoPack.expiryDate)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-primary-600">
            {formatCurrency(Number(bonoPack.price))}
          </span>
          <span className={`badge ${badge.className}`}>{badge.label}</span>
        </div>
      </div>

      {/* Session grid */}
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 mb-3">
        {bonoPack.sessions.map((session) => {
          const isConsumed = session.status === 'CONSUMED'
          const isReserved = session.status === 'AVAILABLE' && Boolean(session.appointment)
          return (
            <div
              key={session.id}
              title={
                isConsumed && session.consumedAt
                  ? `Usada: ${formatDate(session.consumedAt)}`
                  : isReserved && session.appointment
                    ? `Reservada: ${formatDate(session.appointment.date)} ${session.appointment.startTime}-${session.appointment.endTime}`
                    : `Sesion ${session.sessionNumber} disponible`
              }
              className={`relative aspect-square rounded-md flex items-center justify-center text-xs font-medium transition-colors ${
                isConsumed
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                  : isReserved
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : bonoPack.status === 'ACTIVE'
                      ? 'bg-white dark:bg-gray-700 border-2 border-primary-300 dark:border-primary-600 text-primary-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
              }`}
            >
              {session.sessionNumber}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {consumed}/{bonoPack.totalSessions} sesiones usadas · Restantes: {remainingSessions}
          </p>
          {bonoPack.notes && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
              {bonoPack.notes}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3">
          <button
            onClick={() => onScheduleAppointment(bonoPack.id)}
            disabled={bonoPack.status !== 'ACTIVE' || reservableSessions === 0}
            className="btn btn-secondary btn-sm"
            title={
              reservableSessions === 0
                ? 'No hay sesiones disponibles para reservar cita'
                : 'Crear cita desde este bono'
            }
          >
            <CalendarPlus className="w-4 h-4 mr-1" />
            Añadir cita
          </button>
          <button
            onClick={() => onConsume(bonoPack.id)}
            disabled={bonoPack.status !== 'ACTIVE' || remainingSessions === 0}
            className="btn btn-secondary btn-sm"
            title="Descontar una sesión"
          >
            Descontar sesión
          </button>
          <button
            onClick={() => onDelete(bonoPack.id)}
            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            title="Eliminar bono"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Futuras fechas</p>
          {futureReservations.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No hay citas futuras reservadas con este bono.</p>
          ) : (
            <div className="space-y-2">
              {futureReservations.map((session) => (
                <div
                  key={`future-${session.id}`}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Sesión #{session.sessionNumber}
                    </p>
                    <span className="badge badge-primary">
                      {session.appointment?.status || 'SCHEDULED'}
                    </span>
                  </div>
                  {session.appointment && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {formatDate(session.appointment.date)} · {session.appointment.startTime}-{session.appointment.endTime} · {getCabinLabel(session.appointment.cabin)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Historial</p>
          {consumedHistory.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Todavía no hay sesiones descontadas.</p>
          ) : (
            <div className="space-y-2">
              {consumedHistory.map((session) => (
                <div
                  key={`history-${session.id}`}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Sesión #{session.sessionNumber}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Descontada: {session.consumedAt ? formatDateTime(session.consumedAt) : '-'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
