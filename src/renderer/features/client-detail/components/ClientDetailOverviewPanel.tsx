import { Link2, StickyNote, Trash2 } from 'lucide-react'
import ClientAssetExplorer from '../../../components/ClientAssetExplorer'
import { formatDate } from '../../../utils/format'
import type { ClientDetailAssetExplorerProps, ClientDetailClient } from '../types'

type ClientDetailOverviewPanelProps = {
  assetExplorerProps: ClientDetailAssetExplorerProps
  client: ClientDetailClient
  clientNotes: string[]
  noteDraft: string
  noteSaving: boolean
  onAddNote: () => void
  onDeleteNote: (noteIndex: number) => void
  onNoteDraftChange: (value: string) => void
}

export default function ClientDetailOverviewPanel({
  assetExplorerProps,
  client,
  clientNotes,
  noteDraft,
  noteSaving,
  onAddNote,
  onDeleteNote,
  onNoteDraftChange
}: ClientDetailOverviewPanelProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.6fr)_minmax(0,1.4fr)]">
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Resumen General</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Primera visita</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatDate(client.createdAt || '')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Última actualización</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatDate(client.updatedAt || '')}
              </p>
            </div>
            {client.activeTreatmentCount !== null && client.activeTreatmentCount !== undefined && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Tratamientos activos</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {client.activeTreatmentCount}
                </p>
              </div>
            )}
            {client.linkedClient && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Cliente vinculado</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white inline-flex items-center">
                  <Link2 className="w-4 h-4 mr-1" />
                  {client.linkedClient.firstName} {client.linkedClient.lastName}
                  {client.relationshipType ? ` (${client.relationshipType})` : ''}
                </p>
              </div>
            )}
          </div>
          {client.activeTreatmentNames && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Nombres de tratamientos activos</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {client.activeTreatmentNames}
              </p>
            </div>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-primary-600" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Notas</p>
              </div>
              <span className="badge badge-secondary">{clientNotes.length}</span>
            </div>

            <div className="space-y-3">
              <textarea
                value={noteDraft}
                onChange={(event) => onNoteDraftChange(event.target.value)}
                className="input resize-none min-h-[96px]"
                rows={4}
                placeholder="Escribe una nueva nota del cliente..."
                disabled={noteSaving}
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Pulsa una nota guardada para eliminarla.
                </p>
                <button
                  type="button"
                  onClick={onAddNote}
                  className="btn btn-primary btn-sm"
                  disabled={noteSaving || !noteDraft.trim()}
                >
                  {noteSaving ? 'Guardando...' : 'Añadir nota'}
                </button>
              </div>

              {clientNotes.length > 0 ? (
                <div className="space-y-2">
                  {clientNotes.map((note, index) => (
                    <button
                      key={`${note}-${index}`}
                      type="button"
                      onClick={() => onDeleteNote(index)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-red-200 hover:bg-red-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-red-900 dark:hover:bg-red-950/20"
                      disabled={noteSaving}
                      title="Eliminar nota"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <StickyNote className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-600" />
                          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{note}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Todavía no hay notas guardadas para este cliente.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <ClientAssetExplorer {...assetExplorerProps} />
      </div>
    </div>
  )
}
