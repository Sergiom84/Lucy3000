import { SummaryCard } from '../components/SqlFormFields'
import type { SqlAnalysisResult, SqlImportReport, SqlSelectedSummary } from '../types'

type SqlSummaryStepProps = {
  analysis: SqlAnalysisResult
  selectedSummary: SqlSelectedSummary
  usersCount: number
  desktopRestoreAvailable: boolean
  loading: boolean
  importReport: SqlImportReport | null
  onImport: () => Promise<void>
}

const getIssuesCount = <T extends { issues: string[] }>(rows: T[]) =>
  rows.reduce((sum, row) => sum + row.issues.length, 0)

export default function SqlSummaryStep({
  analysis,
  selectedSummary,
  usersCount,
  desktopRestoreAvailable,
  loading,
  importReport,
  onImport
}: SqlSummaryStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">9. Resumen</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Clientes seleccionados" value={String(selectedSummary.clients)} />
        <SummaryCard label="Tratamientos seleccionados" value={String(selectedSummary.services)} />
        <SummaryCard label="Productos seleccionados" value={String(selectedSummary.products)} />
        <SummaryCard label="Bonos seleccionados" value={String(selectedSummary.bonoTemplates)} />
        <SummaryCard label="Bonos cliente seleccionados" value={String(selectedSummary.clientBonos)} />
        <SummaryCard label="Abonos seleccionados" value={String(selectedSummary.accountBalances)} />
        <SummaryCard label="Citas seleccionadas" value={String(selectedSummary.appointments)} />
        <SummaryCard label="Bloqueos agenda" value={String(selectedSummary.agendaBlocks)} />
        <SummaryCard label="Notas agenda" value={String(selectedSummary.agendaNotes)} />
        <SummaryCard label="Consentimientos" value={String(selectedSummary.consents)} />
        <SummaryCard label="Firmas" value={String(selectedSummary.signatures)} />
        <SummaryCard
          label="Citas sin usuario Lucy"
          value={String(selectedSummary.pendingUserMappings)}
          tone={selectedSummary.pendingUserMappings > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen del lote preparado</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Bloque</th>
                  <th>Total detectado</th>
                  <th>Seleccionado</th>
                  <th>Incidencias</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Clientes', analysis.clients.length, selectedSummary.clients, getIssuesCount(analysis.clients)],
                  ['Tratamientos', analysis.services.length, selectedSummary.services, getIssuesCount(analysis.services)],
                  ['Productos', analysis.products.length, selectedSummary.products, getIssuesCount(analysis.products)],
                  ['Bonos', analysis.bonoTemplates.length, selectedSummary.bonoTemplates, getIssuesCount(analysis.bonoTemplates)],
                  ['Bonos cliente', analysis.clientBonos.length, selectedSummary.clientBonos, getIssuesCount(analysis.clientBonos)],
                  ['Abonos cliente', analysis.accountBalances.length, selectedSummary.accountBalances, getIssuesCount(analysis.accountBalances)],
                  ['Citas', analysis.appointments.length, selectedSummary.appointments, getIssuesCount(analysis.appointments)],
                  ['Bloqueos agenda', analysis.agendaBlocks.length, selectedSummary.agendaBlocks, getIssuesCount(analysis.agendaBlocks)],
                  ['Notas agenda', analysis.agendaNotes.length, selectedSummary.agendaNotes, getIssuesCount(analysis.agendaNotes)],
                  ['Consentimientos', analysis.consents.length, selectedSummary.consents, getIssuesCount(analysis.consents)],
                  ['Firmas', analysis.signatures.length, selectedSummary.signatures, getIssuesCount(analysis.signatures)]
                ].map(([label, total, selected, issues]) => (
                  <tr key={String(label)}>
                    <td>{label}</td>
                    <td>{total}</td>
                    <td>{selected}</td>
                    <td>{issues}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Estado del asistente</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p>
                Archivo analizado: <strong className="text-gray-900 dark:text-white">{analysis.sourceName}</strong>
              </p>
              <p>
                Tablas detectadas:{' '}
                <strong className="text-gray-900 dark:text-white">{analysis.detectedTables.length}</strong>
              </p>
              <p>
                Avisos totales: <strong className="text-gray-900 dark:text-white">{analysis.warnings.length}</strong>
              </p>
              <p>
                Usuarios Lucy cargados: <strong className="text-gray-900 dark:text-white">{usersCount}</strong>
              </p>
              <p>
                Referencias de fotos omitidas:{' '}
                <strong className="text-gray-900 dark:text-white">{analysis.summary.photoReferencesSkipped}</strong>
              </p>
              <p>
                Tablas legacy no soportadas:{' '}
                <strong className="text-gray-900 dark:text-white">{analysis.summary.unsupportedPopulatedTables}</strong>
              </p>
              <p>
                Backup de escritorio:{' '}
                <strong className="text-gray-900 dark:text-white">
                  {desktopRestoreAvailable ? 'Disponible' : 'No disponible'}
                </strong>
              </p>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Alcance pendiente</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p>
                Referencias de fotos legacy detectadas:{' '}
                <strong className="text-gray-900 dark:text-white">
                  {analysis.photoReferencesSkipped.reduce((sum, item) => sum + item.rowCount, 0)}
                </strong>
              </p>
              {analysis.photoReferencesSkipped.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                  {analysis.photoReferencesSkipped.map((item) => `${item.tableName}: ${item.rowCount}`).join(' · ')}
                </div>
              ) : (
                <p>No se han detectado referencias de fotos legacy.</p>
              )}
              <p>
                Tablas pobladas fuera de v1:{' '}
                <strong className="text-gray-900 dark:text-white">{analysis.unsupportedPopulatedTables.length}</strong>
              </p>
              {analysis.unsupportedPopulatedTables.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700">
                  <div className="space-y-2">
                    {analysis.unsupportedPopulatedTables.slice(0, 12).map((table) => (
                      <p key={table.tableName} className="text-sm text-gray-700 dark:text-gray-300">
                        {table.tableName}: {table.rowCount}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Restauración</h3>
            <div className="mt-4 space-y-4 text-sm text-gray-600 dark:text-gray-400">
              <p>
                La restauración crea primero un backup local, valida que la BD esté funcionalmente vacía y después
                repone clientes, tratamientos, productos, bonos, saldo, citas, bloqueos, notas y assets soportados.
              </p>
              {!desktopRestoreAvailable ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                  Este entorno no expone el bridge de escritorio necesario para crear el backup y guardar
                  consentimientos o firmas.
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void onImport()}
                disabled={loading || !desktopRestoreAvailable}
                className="btn w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Restaurando...' : 'Restablecer en BD vacía'}
              </button>
            </div>
          </div>

          {importReport ? (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Último commit SQL</h3>
              <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  Usuarios legacy creados:{' '}
                  <strong className="text-gray-900 dark:text-white">{importReport.created.legacyUsers}</strong>
                </p>
                <p>
                  Bloqueos restaurados:{' '}
                  <strong className="text-gray-900 dark:text-white">{importReport.created.agendaBlocks}</strong>
                </p>
                <p>
                  Notas restauradas:{' '}
                  <strong className="text-gray-900 dark:text-white">{importReport.created.agendaNotes}</strong>
                </p>
                <p>
                  Consentimientos guardados:{' '}
                  <strong className="text-gray-900 dark:text-white">{importReport.assetsGenerated.consents}</strong>
                </p>
                <p>
                  Firmas guardadas:{' '}
                  <strong className="text-gray-900 dark:text-white">{importReport.assetsGenerated.signatures}</strong>
                </p>
                <p>
                  Fotos omitidas:{' '}
                  <strong className="text-gray-900 dark:text-white">{importReport.omitted.photoReferencesSkipped}</strong>
                </p>
                {importReport.warnings.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                    {importReport.warnings.slice(0, 8).map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : (
                  <p>El commit no devolvió avisos adicionales.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
