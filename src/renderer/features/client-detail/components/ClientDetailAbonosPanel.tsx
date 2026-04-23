import { formatCurrency, formatDate } from '../../../utils/format'
import { paymentMethodLabel } from '../../../utils/tickets'
import type {
  ClientDetailAccountBalanceDraft,
  ClientDetailAccountBalanceMovement
} from '../types'

const accountBalanceMovementTypeLabel: Record<string, string> = {
  TOP_UP: 'Recarga',
  CONSUMPTION: 'Consumo',
  ADJUSTMENT: 'Ajuste'
}

type ClientDetailAbonosPanelProps = {
  currentBalance: number
  draft: ClientDetailAccountBalanceDraft
  history: ClientDetailAccountBalanceMovement[]
  loading: boolean
  onAmountChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onNotesChange: (value: string) => void
  onOperationDateChange: (value: string) => void
  onPaymentMethodChange: (value: ClientDetailAccountBalanceDraft['paymentMethod']) => void
  onSubmit: () => void
  saving: boolean
}

export default function ClientDetailAbonosPanel({
  currentBalance,
  draft,
  history,
  loading,
  onAmountChange,
  onDescriptionChange,
  onNotesChange,
  onOperationDateChange,
  onPaymentMethodChange,
  onSubmit,
  saving
}: ClientDetailAbonosPanelProps) {
  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nuevo abono</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Registra una recarga del cliente (ejemplo: regalo para mi hija) para su saldo.
            </p>
          </div>
          <span className="badge badge-primary">Saldo actual: {formatCurrency(currentBalance)}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="label">Descripción</label>
            <input
              type="text"
              value={draft.description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              className="input"
              placeholder="Ejemplo: Regalo para mi hija"
            />
          </div>
          <div>
            <label className="label">Importe a regalar</label>
            <input
              type="text"
              value={draft.amount}
              onChange={(event) => onAmountChange(event.target.value)}
              className="input"
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="label">Fecha</label>
            <input
              type="date"
              value={draft.operationDate}
              onChange={(event) => onOperationDateChange(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Cobrado mediante</label>
            <select
              value={draft.paymentMethod}
              onChange={(event) =>
                onPaymentMethodChange(event.target.value as ClientDetailAccountBalanceDraft['paymentMethod'])
              }
              className="input"
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="BIZUM">Bizum</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="label">Notas</label>
            <textarea
              value={draft.notes}
              onChange={(event) => onNotesChange(event.target.value)}
              className="input resize-none"
              rows={3}
              placeholder="Observaciones del abono..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onSubmit} className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : 'Registrar abono'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historial de abonos</h3>
          <span className="badge badge-secondary">{history.length}</span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando historial...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Este cliente todavía no tiene movimientos de abono.
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((movement) => {
              const isConsumption = movement.type === 'CONSUMPTION'

              return (
                <div key={movement.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge ${
                            isConsumption
                              ? 'badge-danger'
                              : movement.type === 'TOP_UP'
                                ? 'badge-success'
                                : 'badge-secondary'
                          }`}
                        >
                          {accountBalanceMovementTypeLabel[movement.type] || movement.type}
                        </span>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(movement.operationDate)}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mt-2">
                        {movement.description}
                      </p>
                      {movement.referenceItem && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Tratamiento / Producto: {movement.referenceItem}
                        </p>
                      )}
                      {movement.type === 'TOP_UP' && movement.paymentMethod && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Cobrado mediante: {paymentMethodLabel(movement.paymentMethod)}
                        </p>
                      )}
                      {movement.notes && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Notas: {movement.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className={`text-sm font-bold ${isConsumption ? 'text-red-600' : 'text-green-600'}`}>
                        {isConsumption ? '-' : '+'}
                        {formatCurrency(Number(movement.amount || 0))}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Restante: {formatCurrency(Number(movement.balanceAfter || 0))}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
