import { Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '../utils/format'

interface BonoSession {
  id: string
  sessionNumber: number
  status: 'AVAILABLE' | 'CONSUMED'
  consumedAt: string | null
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
}

const statusBadge: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Activo', className: 'badge-success' },
  DEPLETED: { label: 'Agotado', className: 'badge-secondary' },
  EXPIRED: { label: 'Expirado', className: 'badge-danger' }
}

export default function BonoCard({ bonoPack, onConsume, onDelete }: BonoCardProps) {
  const consumed = bonoPack.sessions.filter(s => s.status === 'CONSUMED').length
  const remainingSessions = Math.max(bonoPack.totalSessions - consumed, 0)
  const badge = statusBadge[bonoPack.status] || statusBadge.ACTIVE

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
          return (
            <button
              key={session.id}
              disabled={isConsumed || bonoPack.status !== 'ACTIVE'}
              onClick={() => onConsume(bonoPack.id)}
              title={
                isConsumed && session.consumedAt
                  ? `Usada: ${formatDate(session.consumedAt)}`
                  : `Sesión ${session.sessionNumber} - Click para consumir`
              }
              className={`relative aspect-square rounded-md flex items-center justify-center text-xs font-medium transition-colors ${
                isConsumed
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-default'
                  : bonoPack.status === 'ACTIVE'
                    ? 'bg-white dark:bg-gray-700 border-2 border-primary-300 dark:border-primary-600 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 cursor-pointer'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-default'
              }`}
            >
              {session.sessionNumber}
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
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
    </div>
  )
}
