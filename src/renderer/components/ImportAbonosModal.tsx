import { useState } from 'react'
import { AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import {
  LEGACY_SPREADSHEET_FILE_ACCEPT,
  assertSupportedLegacySpreadsheetFile
} from '../utils/excel'

interface ImportAbonosModalProps {
  onSuccess: () => void
  onCancel: () => void
}

const normalizeSection = (value: any) => {
  const items = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : Array.isArray(value?.rows)
        ? value.rows
        : []

  const count =
    typeof value === 'number'
      ? value
      : typeof value?.count === 'number'
        ? value.count
        : items.length

  return { count, items }
}

const renderItemLabel = (item: any, fallbackIndex: number) => {
  if (typeof item === 'string') {
    return item
  }

  if (item?.clientName || item?.clientCode || item?.rows) {
    const code = item?.clientCode ? `#${item.clientCode}` : 'Sin código'
    const name = item?.clientName || item?.name || 'Cliente sin nombre'
    const rows = Array.isArray(item?.rows) && item.rows.length > 0 ? ` · filas ${item.rows.join(', ')}` : ''
    const action =
      item?.action === 'created'
        ? ' · ficha creada'
        : item?.action === 'skipped'
          ? ' · ficha no creada'
          : ''

    return `${code} · ${name}${rows}${action}`
  }

  const message = item?.message || item?.error || item?.label || item?.name
  const row = item?.row ?? item?.line

  if (typeof message === 'string' && /^fila\s+\d+\s*:/i.test(message)) {
    return message
  }

  if (row !== undefined && message) {
    return `Fila ${row}: ${message}`
  }

  if (row !== undefined) {
    return `Fila ${row}`
  }

  return message || JSON.stringify(item) || `Fila ${fallbackIndex}`
}

const instructions = [
  'Este importador carga el saldo disponible de abonos ya existentes en el sistema anterior.',
  'Se aceptan los formatos legacy .xls y .xlsx.',
  'Cada fila añade saldo al cliente y deja trazabilidad en la ficha del cliente, pestaña Abonos.',
  'La importación no genera movimientos de caja porque el abono ya fue comprado fuera de Lucy3000.'
]

export default function ImportAbonosModal({
  onSuccess,
  onCancel
}: ImportAbonosModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [results, setResults] = useState<any>(null)
  const [importDecision, setImportDecision] = useState<boolean | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0]) return

    const selectedFile = event.target.files[0]

    try {
      assertSupportedLegacySpreadsheetFile(selectedFile)
    } catch (error: any) {
      toast.error(error.message)
      return
    }

    setFile(selectedFile)
    setPreview(null)
    setResults(null)
    setImportDecision(null)
  }

  const postImport = async (mode: 'preview' | 'commit', createMissingClients?: boolean) => {
    if (!file) {
      toast.error('Por favor selecciona un archivo')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', mode)

      if (typeof createMissingClients === 'boolean') {
        formData.append('createMissingClients', String(createMissingClients))
      }

      const response = await api.post('/bonos/account-balance/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      const payload = response.data?.preview ?? response.data?.results ?? response.data ?? {}

      if (mode === 'preview') {
        setPreview({
          ready: normalizeSection(payload.ready),
          existing: normalizeSection(payload.existing),
          withoutBalance: normalizeSection(payload.withoutBalance),
          missingClients: normalizeSection(payload.missingClients),
          errors: normalizeSection(payload.errors)
        })
        setResults(null)
        setImportDecision(null)
        toast.success('Archivo analizado')
        return
      }

      const nextResults = {
        success: normalizeSection(payload.success),
        createdClients: normalizeSection(payload.createdClients),
        existing: normalizeSection(payload.existing),
        withoutBalance: normalizeSection(payload.withoutBalance),
        missingClients: normalizeSection(payload.missingClients),
        errors: normalizeSection(payload.errors)
      }

      setResults(nextResults)

      const summaryParts = [
        nextResults.success.count > 0 ? `${nextResults.success.count} abonos importados` : null,
        nextResults.createdClients.count > 0 ? `${nextResults.createdClients.count} fichas creadas` : null,
        nextResults.existing.count > 0 ? `${nextResults.existing.count} ya existentes` : null,
        nextResults.withoutBalance.count > 0 ? `${nextResults.withoutBalance.count} sin saldo` : null,
        nextResults.missingClients.count > 0 ? `${nextResults.missingClients.count} sin ficha` : null,
        nextResults.errors.count > 0 ? `${nextResults.errors.count} errores` : null
      ].filter(Boolean)

      toast.success(summaryParts.join(' · ') || 'Importación completada')
    } catch (error: any) {
      console.error('Error importing account balance:', error)
      toast.error(error.response?.data?.error || 'Error al importar abonos')
    } finally {
      setLoading(false)
    }
  }

  const renderSectionItems = (sectionKey: string, items: any[]) => {
    const isExpanded = Boolean(expandedSections[sectionKey])
    const visibleItems = isExpanded ? items : items.slice(0, 8)

    return (
      <div className="mt-2 space-y-1">
        {visibleItems.map((item: any, index: number) => (
          <p key={`${sectionKey}-${index}`} className="text-xs text-gray-700 dark:text-gray-300">
            {renderItemLabel(item, index + 1)}
          </p>
        ))}
        {items.length > visibleItems.length && (
          <button
            type="button"
            onClick={() =>
              setExpandedSections((current) => ({
                ...current,
                [sectionKey]: true
              }))
            }
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Ver {items.length - visibleItems.length} más
          </button>
        )}
        {isExpanded && items.length > 8 && (
          <button
            type="button"
            onClick={() =>
              setExpandedSections((current) => ({
                ...current,
                [sectionKey]: false
              }))
            }
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Ver menos
          </button>
        )}
      </div>
    )
  }

  const summaryCard = (
    sectionKey: string,
    title: string,
    count: number,
    tone: 'green' | 'amber' | 'red' | 'blue',
    items: any[]
  ) => {
    const colorMap = {
      green:
        'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300',
      amber:
        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
      red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
      blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
    }

    return (
      <div className={`rounded-lg border p-3 ${colorMap[tone]}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{title}</span>
          {tone === 'green' ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-current" />
          )}
        </div>
        <p className="mt-1 text-2xl font-bold">{count}</p>
        {items.length > 0 ? renderSectionItems(sectionKey, items) : null}
      </div>
    )
  }

  const previewReady = normalizeSection(preview?.ready)
  const previewExisting = normalizeSection(preview?.existing)
  const previewWithoutBalance = normalizeSection(preview?.withoutBalance)
  const previewMissingClients = normalizeSection(preview?.missingClients)
  const previewErrors = normalizeSection(preview?.errors)

  const resultSuccess = normalizeSection(results?.success)
  const resultCreatedClients = normalizeSection(results?.createdClients)
  const resultExisting = normalizeSection(results?.existing)
  const resultWithoutBalance = normalizeSection(results?.withoutBalance)
  const resultMissingClients = normalizeSection(results?.missingClients)
  const resultErrors = normalizeSection(results?.errors)

  const hasPreview = Boolean(preview)
  const hasMissingClients = previewMissingClients.count > 0
  const canAnalyze = Boolean(file) && !loading
  const canCommit = hasPreview && !hasMissingClients && previewReady.count > 0 && !loading
  const canResolveMissing = hasPreview && hasMissingClients && !loading

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex items-start">
          <AlertCircle className="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
              Importación de abonos
            </h3>
            <ol className="list-decimal space-y-1 pl-4 text-sm text-blue-800 dark:text-blue-300">
              {instructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div>
        <label className="label">Seleccionar archivo Excel legacy</label>
        <div className="mt-2">
          <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <FileSpreadsheet className="mb-3 h-10 w-10 text-gray-400" />
              {file ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-semibold">{file.name}</span>
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold">Haz clic para subir</span> o arrastra el archivo
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Excel (.xls, .xlsx)</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept={LEGACY_SPREADSHEET_FILE_ACCEPT}
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      {preview && !results && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {summaryCard('preview-ready', 'Listos para importar', previewReady.count, 'green', previewReady.items)}
            {summaryCard('preview-existing', 'Ya importados', previewExisting.count, 'amber', previewExisting.items)}
            {summaryCard(
              'preview-without-balance',
              'Sin saldo disponible',
              previewWithoutBalance.count,
              'blue',
              previewWithoutBalance.items
            )}
            {summaryCard(
              'preview-missing',
              'Sin ficha de cliente',
              previewMissingClients.count,
              'red',
              previewMissingClients.items
            )}
            {summaryCard('preview-errors', 'Errores', previewErrors.count, 'red', previewErrors.items)}
          </div>

          {hasMissingClients ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Hay abonos con clientes sin ficha
              </h4>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Puedes crear las fichas antes de importar o seguir omitiendo esos abonos.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setImportDecision(true)
                    void postImport('commit', true)
                  }}
                  className="btn btn-primary"
                  disabled={!canResolveMissing}
                >
                  Crear fichas e importar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportDecision(false)
                    void postImport('commit', false)
                  }}
                  className="btn btn-secondary"
                  disabled={!canResolveMissing}
                >
                  Omitir esos abonos e importar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200">
              Solo se importará el saldo disponible. Las filas sin saldo o sin cliente se omiten.
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {summaryCard('result-success', 'Importados', resultSuccess.count, 'green', resultSuccess.items)}
            {summaryCard(
              'result-created-clients',
              'Fichas creadas',
              resultCreatedClients.count,
              'green',
              resultCreatedClients.items
            )}
            {summaryCard('result-existing', 'Ya importados', resultExisting.count, 'amber', resultExisting.items)}
            {summaryCard(
              'result-without-balance',
              'Sin saldo disponible',
              resultWithoutBalance.count,
              'blue',
              resultWithoutBalance.items
            )}
            {summaryCard(
              'result-missing',
              'Sin ficha de cliente',
              resultMissingClients.count,
              'red',
              resultMissingClients.items
            )}
            {summaryCard('result-errors', 'Errores', resultErrors.count, 'red', resultErrors.items)}
          </div>

          {importDecision !== null && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200">
              {importDecision
                ? 'Se han importado los abonos creando las fichas necesarias para los clientes ausentes.'
                : 'Se han omitido los abonos cuyos clientes seguían sin ficha.'}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          type="button"
          onClick={results ? onSuccess : onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          {results ? 'Cerrar' : 'Cancelar'}
        </button>
        {!preview && (
          <button
            type="button"
            onClick={() => void postImport('preview')}
            className="btn btn-primary"
            disabled={!canAnalyze}
          >
            {loading ? 'Analizando...' : 'Analizar archivo'}
          </button>
        )}
        {preview && !results && !hasMissingClients && (
          <button
            type="button"
            onClick={() => void postImport('commit')}
            className="btn btn-primary"
            disabled={!canCommit}
          >
            {loading ? 'Importando...' : 'Confirmar importación'}
          </button>
        )}
      </div>
    </div>
  )
}
