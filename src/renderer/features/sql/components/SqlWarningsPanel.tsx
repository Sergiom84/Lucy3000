import { ShieldAlert } from 'lucide-react'
import type { SqlWarning } from '../types'

type SqlWarningsPanelProps = {
  warnings: SqlWarning[]
}

export default function SqlWarningsPanel({ warnings }: SqlWarningsPanelProps) {
  if (warnings.length === 0) {
    return null
  }

  return (
    <div className="card border-amber-200 dark:border-amber-900/40">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Avisos</h2>
      </div>

      <div className="mt-4 space-y-3">
        {warnings.map((warning) => (
          <div
            key={`${warning.step}-${warning.code}-${warning.message}`}
            className={`rounded-lg border px-4 py-3 text-sm ${
              warning.severity === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100'
                : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-100'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>{warning.message}</p>
              {warning.count ? <span className="badge badge-info">{warning.count}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
