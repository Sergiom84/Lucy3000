import { RefreshCcw } from 'lucide-react'
import type { SqlEventLogEntry } from '../types'

type SqlEventLogPanelProps = {
  eventEntries: SqlEventLogEntry[]
  eventLogPath: string | null
  eventsLoading: boolean
  refreshEvents: () => Promise<void>
}

export default function SqlEventLogPanel({
  eventEntries,
  eventLogPath,
  eventsLoading,
  refreshEvents
}: SqlEventLogPanelProps) {
  return (
    <div className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Log de eventos</h2>
          {eventLogPath ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Archivo: <code>{eventLogPath}</code>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void refreshEvents()}
          className="btn btn-secondary"
          disabled={eventsLoading}
        >
          <RefreshCcw className={`mr-2 h-4 w-4 ${eventsLoading ? 'animate-spin' : ''}`} />
          Actualizar log
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {eventEntries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Todavía no hay eventos registrados para esta sesión.
          </p>
        ) : (
          eventEntries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-primary">{entry.type}</span>
                  {entry.step ? <span className="badge badge-info">{entry.step}</span> : null}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(entry.occurredAt).toLocaleString('es-ES')}
                  </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{entry.sessionId}</span>
              </div>

              <p className="mt-2 text-sm text-gray-900 dark:text-white">{entry.message}</p>
              {entry.payload ? (
                <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
