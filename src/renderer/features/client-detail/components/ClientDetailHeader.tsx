import { ArrowLeft } from 'lucide-react'
import type { ClientDetailClient } from '../types'

type ClientDetailHeaderProps = {
  client: Pick<ClientDetailClient, 'firstName' | 'id' | 'lastName'>
  onBack: () => void
  onCharge: () => void
  onEdit: () => void
}

export default function ClientDetailHeader({
  client,
  onBack,
  onCharge,
  onEdit
}: ClientDetailHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {client.firstName} {client.lastName}
        </h1>
      </div>
      <div className="flex gap-3">
        <button onClick={onCharge} className="btn btn-secondary">
          Cobrar
        </button>
        <button onClick={onEdit} className="btn btn-primary">
          Editar
        </button>
      </div>
    </div>
  )
}
