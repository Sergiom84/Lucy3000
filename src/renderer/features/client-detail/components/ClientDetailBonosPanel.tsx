import BonoCard from '../../../components/BonoCard'
import type { ClientDetailBonoPack } from '../types'

type ClientDetailBonosPanelProps = {
  bonoPacks: ClientDetailBonoPack[]
  onConsume: (bonoPackId: string) => void
  onCreate: () => void
  onDelete: (bonoPackId: string) => void
  onEdit: (bonoPackId: string) => void
  onScheduleAppointment: (bonoPackId: string) => void
}

export default function ClientDetailBonosPanel({
  bonoPacks,
  onConsume,
  onCreate,
  onDelete,
  onEdit,
  onScheduleAppointment
}: ClientDetailBonosPanelProps) {
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bonos del cliente</h3>
          <div className="flex items-center gap-2">
            <span className="badge badge-secondary">{bonoPacks.length}</span>
            <button type="button" onClick={onCreate} className="btn btn-primary btn-sm">
              Nuevo bono
            </button>
          </div>
        </div>

        {bonoPacks.length > 0 ? (
          <div className="space-y-4">
            {bonoPacks.map((bonoPack) => (
              <BonoCard
                key={bonoPack.id}
                bonoPack={bonoPack}
                onConsume={onConsume}
                onDelete={onDelete}
                onEdit={onEdit}
                onScheduleAppointment={onScheduleAppointment}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Este cliente todavía no tiene bonos asignados.
          </p>
        )}
      </div>
    </div>
  )
}
