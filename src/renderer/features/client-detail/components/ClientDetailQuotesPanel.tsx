import { Printer } from 'lucide-react'
import { formatCurrency, formatDate } from '../../../utils/format'
import type { ClientDetailQuote } from '../types'

type ClientDetailQuotesPanelProps = {
  loading: boolean
  onDelete: (quoteId: string) => void
  onPrint: (quote: ClientDetailQuote) => void
  quotes: ClientDetailQuote[]
}

export default function ClientDetailQuotesPanel({
  loading,
  onDelete,
  onPrint,
  quotes
}: ClientDetailQuotesPanelProps) {
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Presupuestos emitidos</h3>
          <span className="badge badge-secondary">{quotes.length}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : quotes.length > 0 ? (
          <div className="space-y-3">
            {quotes.map((quote) => {
              const isExpired = new Date(quote.validUntil) < new Date() && quote.status === 'ISSUED'
              const statusLabel: Record<string, string> = {
                ISSUED: isExpired ? 'Expirado' : 'Emitido',
                ACCEPTED: 'Aceptado',
                EXPIRED: 'Expirado',
                CANCELLED: 'Cancelado'
              }
              const statusColor: Record<string, string> = {
                ISSUED: isExpired ? 'text-red-600' : 'text-blue-600',
                ACCEPTED: 'text-green-600',
                EXPIRED: 'text-red-600',
                CANCELLED: 'text-gray-500'
              }
              const itemLabels = (quote.items || [])
                .map((item) => String(item.service?.name || item.product?.name || item.description || '').trim())
                .filter(Boolean)
                .join(', ')

              return (
                <div key={quote.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{quote.quoteNumber}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{itemLabels || 'Sin detalle'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatDate(quote.date)} — Válido hasta: {formatDate(quote.validUntil)}
                      </p>
                      <p className="text-xs mt-1">
                        Profesional: <strong>{quote.professional}</strong>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary-600">{formatCurrency(Number(quote.total || 0))}</p>
                      <p className={`text-xs font-medium ${statusColor[quote.status] || 'text-gray-500'}`}>
                        {statusLabel[quote.status] || quote.status}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => onPrint(quote)} className="btn btn-sm btn-primary">
                      <Printer className="w-3 h-3 mr-1" />
                      Imprimir
                    </button>
                    <button onClick={() => onDelete(quote.id)} className="btn btn-sm btn-secondary text-red-600">
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Este cliente no tiene presupuestos emitidos.
          </p>
        )}
      </div>
    </div>
  )
}
