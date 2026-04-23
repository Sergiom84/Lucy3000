import { formatCurrency, formatDateTime } from '../../../utils/format'
import type { ClientDetailSale } from '../types'

type ClientDetailSalesPanelProps = {
  getSaleDisplayStatus: (sale: ClientDetailSale) => string
  getSaleDisplayStatusBadgeClassName: (sale: ClientDetailSale) => string
  getSaleDisplayStatusLabel: (sale: ClientDetailSale) => string
  getSaleTreatmentLabel: (sale: ClientDetailSale) => string
  onPrintSale: (saleId: string) => void
  sales: ClientDetailSale[]
}

export default function ClientDetailSalesPanel({
  getSaleDisplayStatus,
  getSaleDisplayStatusBadgeClassName,
  getSaleDisplayStatusLabel,
  getSaleTreatmentLabel,
  onPrintSale,
  sales
}: ClientDetailSalesPanelProps) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Historial de Ventas</h3>
      {sales.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Número
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Fecha
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Items
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Tratamiento
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Notas
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Estado
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Ticket
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr
                  key={sale.id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{sale.saleNumber}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {formatDateTime(sale.date)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {sale.items?.length || 0} items
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="block max-w-xs line-clamp-2">{getSaleTreatmentLabel(sale)}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="block max-w-xs whitespace-pre-wrap break-words line-clamp-3">
                      {sale.notes?.trim() || '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                    {formatCurrency(Number(sale.total || 0))}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`badge ${getSaleDisplayStatusBadgeClassName(sale)}`}>
                      {getSaleDisplayStatusLabel(sale)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {getSaleDisplayStatus(sale) !== 'PENDING' ? (
                      <button onClick={() => onPrintSale(sale.id)} className="btn btn-sm btn-secondary">
                        Ticket
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
        <p className="text-center py-8 text-gray-500 dark:text-gray-400">No hay ventas registradas</p>
      )}
    </div>
  )
}
