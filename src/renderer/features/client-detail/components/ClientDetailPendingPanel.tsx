import { Pencil } from 'lucide-react'
import type { PendingPaymentRow } from '../../../utils/clientPendingPayments'
import { formatCurrency, formatDateTime } from '../../../utils/format'
import { paymentMethodLabel } from '../../../utils/tickets'
import type { ClientDetailSaleLabelSource } from '../types'

const pendingPaymentStatusLabel: Record<PendingPaymentRow['status'], string> = {
  OPEN: 'Abierto',
  SETTLED: 'Saldado',
  CANCELLED: 'Cancelado'
}

type ClientDetailPendingPanelProps = {
  getSaleTreatmentLabel: (sale: ClientDetailSaleLabelSource | null | undefined) => string
  manualPendingAmount: number
  onEditManualPending: (amount: number) => void
  onEditSalePending: (saleId: string) => void
  pendingPayments: PendingPaymentRow[]
  salePendingAmount: number
}

export default function ClientDetailPendingPanel({
  getSaleTreatmentLabel,
  manualPendingAmount,
  onEditManualPending,
  onEditSalePending,
  pendingPayments,
  salePendingAmount
}: ClientDetailPendingPanelProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historial de pendientes</h3>
        <span className="badge badge-secondary">{pendingPayments.length}</span>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                Importado
              </p>
              <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
                Importe heredado del perfil del cliente o de un backup
              </p>
            </div>
            {manualPendingAmount > 0 ? (
              <button
                type="button"
                onClick={() => onEditManualPending(manualPendingAmount)}
                className="rounded-lg border border-amber-300 bg-white p-2 text-amber-700 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
                title="Editar pendiente de ficha"
                aria-label="Editar pendiente de ficha"
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-lg font-semibold text-amber-900 dark:text-amber-100">
            {formatCurrency(manualPendingAmount)}
          </p>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 dark:border-sky-900 dark:bg-sky-950/30">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
            Leyenda · Ventas
          </p>
          <p className="mt-2 text-sm text-sky-900 dark:text-sky-100">Pendientes creados de una venta.</p>
          <p className="mt-3 text-lg font-semibold text-sky-900 dark:text-sky-100">
            {formatCurrency(salePendingAmount)}
          </p>
        </div>
      </div>

      {pendingPayments.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Origen
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Referencia
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Tratamiento / producto
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Registrado
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Importe
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Estado
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Saldado
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Editar
                </th>
              </tr>
            </thead>
            <tbody>
              {pendingPayments.map((pendingPayment) => (
                <tr
                  key={pendingPayment.id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="py-3 px-4 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        pendingPayment.source === 'MANUAL'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                          : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                      }`}
                    >
                      {pendingPayment.source === 'MANUAL' ? 'Ficha / importado' : 'Ventas'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {pendingPayment.label || pendingPayment.sale?.saleNumber || 'Venta pendiente'}
                      </p>
                      {pendingPayment.note ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{pendingPayment.note}</p>
                      ) : pendingPayment.sale?.notes ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{pendingPayment.sale.notes}</p>
                      ) : null}
                      {pendingPayment.collections.length > 0 ? (
                        <div className="pt-2 space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                            Cobros registrados
                          </p>
                          {pendingPayment.collections.map((collection) => (
                            <p key={collection.id} className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDateTime(collection.operationDate)} · {formatCurrency(collection.amount)} ·{' '}
                              {paymentMethodLabel(collection.paymentMethod)}
                              {collection.paymentMethod === 'CASH' && !collection.showInOfficialCash
                                ? ' · Sin ticket'
                                : ''}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {pendingPayment.sale?.items?.length ? (
                      <span className="block max-w-xs line-clamp-2">
                        {getSaleTreatmentLabel(pendingPayment.sale)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {formatDateTime(pendingPayment.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                    <div className="space-y-1">
                      <p>{formatCurrency(Number(pendingPayment.amount || 0))}</p>
                      {pendingPayment.status === 'OPEN' && pendingPayment.collections.length > 0 ? (
                        <p className="text-[11px] font-normal text-gray-500 dark:text-gray-400">Restante</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`badge ${
                        pendingPayment.status === 'SETTLED'
                          ? 'badge-success'
                          : pendingPayment.status === 'CANCELLED'
                            ? 'badge-danger'
                            : 'badge-warning'
                      }`}
                    >
                      {pendingPaymentStatusLabel[pendingPayment.status] || pendingPayment.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {pendingPayment.settledAt ? (
                      <div className="space-y-1">
                        <p>{formatDateTime(pendingPayment.settledAt)}</p>
                        {pendingPayment.settledPaymentMethod ? (
                          <p className="text-xs">{paymentMethodLabel(pendingPayment.settledPaymentMethod)}</p>
                        ) : null}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {pendingPayment.status === 'OPEN' && pendingPayment.source === 'MANUAL' ? (
                      <button
                        type="button"
                        onClick={() => onEditManualPending(pendingPayment.amount)}
                        className="inline-flex rounded-lg border border-amber-300 bg-white p-2 text-amber-700 transition hover:bg-amber-50 dark:border-amber-700 dark:bg-gray-900 dark:text-amber-200 dark:hover:bg-amber-950/20"
                        title="Editar pendiente de ficha"
                        aria-label="Editar pendiente de ficha"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : pendingPayment.status === 'OPEN' && pendingPayment.sale?.id ? (
                      <button
                        type="button"
                        onClick={() => onEditSalePending(pendingPayment.sale!.id)}
                        className="inline-flex rounded-lg border border-sky-300 bg-white p-2 text-sky-700 transition hover:bg-sky-50 dark:border-sky-700 dark:bg-gray-900 dark:text-sky-200 dark:hover:bg-sky-950/20"
                        title="Cobrar pendiente"
                        aria-label="Cobrar pendiente"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center py-8 text-gray-500 dark:text-gray-400">No hay pendientes registrados</p>
      )}
    </div>
  )
}
