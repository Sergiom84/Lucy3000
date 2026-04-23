import Modal from '../../../components/Modal'
import { formatCurrency } from '../../../utils/format'
import type { CashHistoryEntry } from '../types'

type CashHistoryModalProps = {
  cashHistory: CashHistoryEntry[]
  isOpen: boolean
  onClose: () => void
}

export default function CashHistoryModal({ cashHistory, isOpen, onClose }: CashHistoryModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Historial de cajas" maxWidth="2xl">
      <div className="space-y-3 max-h-[32rem] overflow-y-auto">
        {cashHistory.map((cash) => (
          <div key={cash.id} className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{new Date(cash.date).toLocaleDateString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{cash.status}</p>
              </div>
              <div className="text-right text-sm">
                <p>Inicial: {formatCurrency(Number(cash.openingBalance))}</p>
                {cash.countedTotal != null && <p>Contado: {formatCurrency(Number(cash.countedTotal))}</p>}
                {cash.nextDayFloat != null ? (
                  <p>Fondo siguiente día: {formatCurrency(Number(cash.nextDayFloat))}</p>
                ) : cash.closingBalance != null ? (
                  <p>Cierre legado: {formatCurrency(Number(cash.closingBalance))}</p>
                ) : null}
                {cash.withdrawalAmount != null && <p>Retirada: {formatCurrency(Number(cash.withdrawalAmount))}</p>}
                {cash.arqueoDifference != null && (
                  <p>
                    Dif. arqueo:{' '}
                    {`${Number(cash.arqueoDifference) > 0 ? '+' : ''}${formatCurrency(Number(cash.arqueoDifference))}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
