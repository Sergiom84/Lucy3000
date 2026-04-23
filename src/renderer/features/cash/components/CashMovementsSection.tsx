import { formatCurrency } from '../../../utils/format'
import { paymentMethodLabel } from '../../../utils/tickets'
import type { CashAnalyticsRow } from '../types'

type CashMovementsSectionProps = {
  analyticsLoading: boolean
  analyticsRows: CashAnalyticsRow[]
  onExportExcel: () => void | Promise<void>
  onExportPdf: () => void | Promise<void>
  onRefresh: () => void | Promise<void>
}

export default function CashMovementsSection({
  analyticsLoading,
  analyticsRows,
  onExportExcel,
  onExportPdf,
  onRefresh
}: CashMovementsSectionProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Movimientos unificados</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void onExportExcel()} className="btn btn-secondary btn-sm">
            Exportar Excel
          </button>
          <button onClick={() => void onExportPdf()} className="btn btn-secondary btn-sm">
            Exportar PDF
          </button>
          <button onClick={() => void onRefresh()} className="btn btn-secondary btn-sm">
            Actualizar
          </button>
        </div>
      </div>

      {analyticsLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando movimientos...</p>
      ) : (
        <div className="overflow-x-auto max-h-[30rem]">
          <table className="table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left min-w-[16rem]">Nombre y apellidos</th>
                <th className="px-4 py-3 text-left min-w-[14rem]">Concepto</th>
                <th className="px-4 py-3 text-left min-w-[7rem]">Pago</th>
                <th className="px-4 py-3 text-left min-w-[8rem]">Importe</th>
                <th className="px-4 py-3 text-left min-w-[12rem]">Profesional</th>
                <th className="px-4 py-3 text-left min-w-[8rem]">Nº venta</th>
              </tr>
            </thead>
            <tbody>
              {analyticsRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No hay resultados para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                analyticsRows.map((row) => (
                  <tr key={`${row.saleId}-${row.concept}-${row.amount}-${row.quantity}`} className="align-top">
                    <td className="px-4 py-3">{row.clientName}</td>
                    <td className="px-4 py-3">{row.concept}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{paymentMethodLabel(row.paymentMethod)}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      {formatCurrency(Number(row.amount))}
                    </td>
                    <td className="px-4 py-3">{row.professionalName}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{row.saleNumber}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
