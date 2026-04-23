import { Database, RefreshCcw, Upload } from 'lucide-react'
import { SummaryCard } from '../components/SqlFormFields'
import type { SqlAnalysisResult } from '../types'

type SqlFileStepProps = {
  file: File | null
  analysis: SqlAnalysisResult | null
  loading: boolean
  usersLoading: boolean
  usersCount: number
  sessionId: string
  onFileChange: (file: File | null) => void
  onAnalyze: () => Promise<void>
}

export default function SqlFileStep({
  file,
  analysis,
  loading,
  usersLoading,
  usersCount,
  sessionId,
  onFileChange,
  onAnalyze
}: SqlFileStepProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
      <div className="space-y-6">
        <div className="card space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">1. Cargar el archivo SQL</h2>
          </div>

          <label className="block rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/40">
            <span className="mb-3 flex items-center gap-3 text-base font-semibold text-gray-900 dark:text-white">
              <Upload className="h-5 w-5 text-primary-600" />
              Archivo compatible
            </span>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Selecciona un <code>.sql</code> o <code>.sqlx</code> del sistema anterior. El contenido debe ser un
              dump SQL plano con <code>CREATE TABLE</code> e <code>INSERT INTO</code>, pensado para <code>01dat</code>.
              Si el exportador te genera ambos, usa primero <code>01dat.sql</code>.
            </p>
            <input
              type="file"
              accept=".sql,.sqlx,text/plain,application/sql,application/octet-stream"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              className="input"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void onAnalyze()}
              disabled={!file || loading}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Analizar SQL
                </>
              )}
            </button>

            {analysis ? (
              <button type="button" onClick={() => void onAnalyze()} disabled={loading} className="btn btn-secondary">
                Reanalizar
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard label="Archivo" value={file?.name ?? 'Sin seleccionar'} />
            <SummaryCard label="Usuarios Lucy" value={usersLoading ? '...' : String(usersCount)} />
            <SummaryCard
              label="Estado"
              value={analysis ? 'Analizado' : 'Pendiente'}
              tone={analysis ? 'success' : 'warning'}
            />
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            <p>
              Sesión de log: <code>{sessionId}</code>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {analysis ? (
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Diagnóstico del archivo</h3>

            <div className="grid grid-cols-2 gap-4">
              <SummaryCard label="Origen" value={analysis.sourceName} />
              <SummaryCard label="Codificación" value={analysis.encoding} />
              <SummaryCard label="Clientes" value={String(analysis.summary.clients)} />
              <SummaryCard label="Tratamientos" value={String(analysis.summary.services)} />
              <SummaryCard label="Productos" value={String(analysis.summary.products)} />
              <SummaryCard label="Bonos plantilla" value={String(analysis.summary.bonoTemplates)} />
              <SummaryCard label="Bonos cliente" value={String(analysis.summary.clientBonos)} />
              <SummaryCard label="Abonos cliente" value={String(analysis.summary.accountBalances)} />
              <SummaryCard label="Citas" value={String(analysis.summary.appointments)} />
              <SummaryCard
                label="Avisos"
                value={String(analysis.summary.warnings)}
                tone={analysis.summary.warnings > 0 ? 'warning' : 'success'}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Tablas detectadas</p>
              <div className="flex flex-wrap gap-2">
                {analysis.detectedTables.map((tableName) => (
                  <span key={tableName} className="badge badge-primary">
                    {tableName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
