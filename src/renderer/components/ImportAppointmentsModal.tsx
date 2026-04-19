import { useState } from 'react'
import { AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { useAuthStore } from '../stores/authStore'
import { invalidateAppointmentProfessionalsCache } from '../utils/appointmentCatalogs'
import api from '../utils/api'
import { downloadAppointmentImportTemplateWorkbook } from '../utils/exports'
import { XLSX_FILE_ACCEPT, assertSupportedSpreadsheetFile } from '../utils/excel'

interface ImportAppointmentsModalProps {
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
        : Array.isArray(value?.data)
          ? value.data
          : []

  const count =
    typeof value === 'number'
      ? value
      : typeof value?.count === 'number'
        ? value.count
        : typeof value?.total === 'number'
          ? value.total
          : items.length

  return { count, items }
}

const resolveSection = (payload: any, key: string) => {
  if (payload?.[key] !== undefined) {
    return payload[key]
  }

  return payload
}

const instructions = [
  'Usa un archivo Excel .xlsx con estas columnas: Fecha, Hora, Minutos, cliente, Nombre, Código, Descripción, Cabina, Profesional, Teléfono, Mail y Notas.',
  'La columna cliente o Nº Cliente debe coincidir con el código local del cliente.',
  'El tratamiento se identifica por Código + Descripción + Minutos.',
  'Si una fila falla, el proceso continúa y el error se muestra con su número de fila.'
]

export default function ImportAppointmentsModal({
  onSuccess,
  onCancel
}: ImportAppointmentsModalProps) {
  const { user, updateUser } = useAuthStore()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [results, setResults] = useState<any>(null)
  const [importDecision, setImportDecision] = useState<boolean | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [detectedProfessionalsModalOpen, setDetectedProfessionalsModalOpen] = useState(false)
  const [persistingDetectedProfessionals, setPersistingDetectedProfessionals] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]

      try {
        assertSupportedSpreadsheetFile(selectedFile)
      } catch (error: any) {
        toast.error(error.message)
        return
      }

      setFile(selectedFile)
      setPreview(null)
      setResults(null)
      setImportDecision(null)
      setDetectedProfessionalsModalOpen(false)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      await downloadAppointmentImportTemplateWorkbook()
      toast.success('Plantilla descargada')
    } catch (error) {
      console.error('Error generating appointment template:', error)
      toast.error('No se pudo generar la plantilla')
    }
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

      const response = await api.post('/appointments/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      const payload = response.data?.preview ?? response.data?.results ?? response.data ?? {}

      if (mode === 'preview') {
        const nextPreview = {
          ready: normalizeSection(resolveSection(payload, 'ready')),
          duplicates: normalizeSection(resolveSection(payload, 'duplicates')),
          missingClients: normalizeSection(resolveSection(payload, 'missingClients')),
          blocks: normalizeSection(resolveSection(payload, 'blocks')),
          conflicts: normalizeSection(resolveSection(payload, 'conflicts')),
          errors: normalizeSection(resolveSection(payload, 'errors'))
        }

        setPreview(nextPreview)
        setResults(null)
        setImportDecision(null)
        toast.success('Archivo analizado')
        return
      }

      const nextResults = {
        success: normalizeSection(resolveSection(payload, 'success')),
        createdClients: normalizeSection(resolveSection(payload, 'createdClients')),
        detectedProfessionals: normalizeSection(resolveSection(payload, 'detectedProfessionals')),
        duplicates: normalizeSection(resolveSection(payload, 'duplicates')),
        missingClients: normalizeSection(resolveSection(payload, 'missingClients')),
        blocks: normalizeSection(resolveSection(payload, 'blocks')),
        conflicts: normalizeSection(resolveSection(payload, 'conflicts')),
        errors: normalizeSection(resolveSection(payload, 'errors')),
        skipped: normalizeSection(resolveSection(payload, 'skipped'))
      }

      setResults(nextResults)
      setDetectedProfessionalsModalOpen(Number(nextResults.detectedProfessionals.count || 0) > 0)

      const successCount = Number(nextResults.success.count || 0)
      const createdClientsCount = Number(nextResults.createdClients.count || 0)
      const detectedProfessionalsCount = Number(nextResults.detectedProfessionals.count || 0)
      const duplicateCount = Number(nextResults.duplicates.count || 0)
      const missingCount = Number(nextResults.missingClients.count || 0)
      const blockCount = Number(nextResults.blocks.count || 0)
      const conflictCount = Number(nextResults.conflicts.count || 0)
      const skippedCount = Number(nextResults.skipped.count || 0)
      const errorCount = Number(nextResults.errors.count || 0)

      const summaryParts = [
        successCount > 0 ? `${successCount} citas importadas` : null,
        createdClientsCount > 0 ? `${createdClientsCount} fichas creadas` : null,
        detectedProfessionalsCount > 0 ? `${detectedProfessionalsCount} profesionales detectadas` : null,
        duplicateCount > 0 ? `${duplicateCount} duplicadas` : null,
        missingCount > 0 ? `${missingCount} sin ficha` : null,
        blockCount > 0 ? `${blockCount} bloqueos` : null,
        conflictCount > 0 ? `${conflictCount} conflictos` : null,
        skippedCount > 0 ? `${skippedCount} omitidas` : null,
        errorCount > 0 ? `${errorCount} errores` : null
      ].filter(Boolean)

      if (summaryParts.length > 0) {
        toast.success(summaryParts.join(' · '))
      } else {
        toast.success('Importación completada')
      }
    } catch (error: any) {
      console.error('Error importing appointments:', error)
      toast.error(error.response?.data?.error || 'Error al importar citas')
    } finally {
      setLoading(false)
    }
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

  const renderSectionItems = (sectionKey: string, items: any[]) => {
    const isExpanded = Boolean(expandedSections[sectionKey])
    const visibleItems = isExpanded ? items : items.slice(0, 8)

    return (
      <div className="mt-2 space-y-1">
        {visibleItems.map((item: any, idx: number) => (
          <p key={idx} className="text-xs text-gray-700 dark:text-gray-300">
            {renderItemLabel(item, idx + 1)}
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
    icon: any,
    items: any[]
  ) => {
    const colors = {
      green: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300',
      amber:
        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
      red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
      blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
    }

    return (
      <div className={`rounded-lg border p-3 ${colors[tone]}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{title}</span>
          {icon}
        </div>
        <p className="mt-1 text-2xl font-bold">{count}</p>
        {items.length > 0 && renderSectionItems(sectionKey, items)}
      </div>
    )
  }

  const previewReady = normalizeSection(preview?.ready)
  const previewDuplicates = normalizeSection(preview?.duplicates)
  const previewMissingClients = normalizeSection(preview?.missingClients)
  const previewBlocks = normalizeSection(preview?.blocks)
  const previewConflicts = normalizeSection(preview?.conflicts)
  const previewErrors = normalizeSection(preview?.errors)

  const commitSuccess = normalizeSection(results?.success)
  const commitCreatedClients = normalizeSection(results?.createdClients)
  const commitDetectedProfessionals = normalizeSection(results?.detectedProfessionals)
  const commitDuplicates = normalizeSection(results?.duplicates)
  const commitMissingClients = normalizeSection(results?.missingClients)
  const commitBlocks = normalizeSection(results?.blocks)
  const commitConflicts = normalizeSection(results?.conflicts)
  const commitErrors = normalizeSection(results?.errors)
  const commitSkipped = normalizeSection(results?.skipped)

  const hasPreview = Boolean(preview)
  const hasMissingClients = previewMissingClients.count > 0
  const canAnalyze = Boolean(file) && !loading
  const canCommit = hasPreview && !hasMissingClients && previewReady.count > 0 && !loading
  const canResolveMissing = hasPreview && hasMissingClients && !loading

  const handlePersistDetectedProfessionals = async () => {
    if (!user?.id || commitDetectedProfessionals.items.length === 0) {
      setDetectedProfessionalsModalOpen(false)
      return
    }

    setPersistingDetectedProfessionals(true)

    try {
      const professionalsResponse = await api.get<string[]>('/appointments/professionals')
      const currentProfessionals = Array.isArray(professionalsResponse.data) ? professionalsResponse.data : []
      const mergedProfessionals = [
        ...currentProfessionals,
        ...commitDetectedProfessionals.items.filter((item: unknown): item is string => typeof item === 'string')
      ]

      const response = await api.patch(`/users/${user.id}/account-settings`, {
        professionalNames: mergedProfessionals
      })

      invalidateAppointmentProfessionalsCache()

      if (response.data?.id && response.data.id === user.id) {
        updateUser({
          id: response.data.id,
          email: response.data.email,
          username: response.data.username || null,
          name: response.data.name,
          role: response.data.role
        })
      }

      toast.success('Profesionales añadidas al programa')
      setDetectedProfessionalsModalOpen(false)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudieron guardar las profesionales detectadas')
    } finally {
      setPersistingDetectedProfessionals(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex items-start">
          <AlertCircle className="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
              Instrucciones para importar citas
            </h3>
            <ol className="list-inside list-decimal space-y-1 text-sm text-blue-800 dark:text-blue-300">
              {instructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div>
        <button onClick={handleDownloadTemplate} className="btn btn-secondary w-full">
          Descargar Plantilla de Excel
        </button>
      </div>

      <div>
        <label className="label">Seleccionar archivo Excel</label>
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
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Excel (.xlsx)</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept={XLSX_FILE_ACCEPT}
              onClick={(event) => {
                event.currentTarget.value = ''
              }}
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {summaryCard('preview-ready', 'Listas para importar', previewReady.count, 'green', <CheckCircle className="h-5 w-5 text-green-600" />, previewReady.items)}
            {summaryCard(
              'preview-duplicates',
              'Duplicadas',
              previewDuplicates.count,
              'amber',
              <AlertCircle className="h-5 w-5 text-amber-600" />,
              previewDuplicates.items
            )}
            {summaryCard(
              'preview-missing',
              'Sin ficha',
              previewMissingClients.count,
              'red',
              <AlertCircle className="h-5 w-5 text-red-600" />,
              previewMissingClients.items
            )}
            {summaryCard(
              'preview-blocks',
              'Bloqueos',
              previewBlocks.count,
              'blue',
              <AlertCircle className="h-5 w-5 text-blue-600" />,
              previewBlocks.items
            )}
            {summaryCard(
              'preview-conflicts',
              'Conflictos',
              previewConflicts.count,
              'amber',
              <AlertCircle className="h-5 w-5 text-amber-600" />,
              previewConflicts.items
            )}
            {summaryCard(
              'preview-errors',
              'Errores',
              previewErrors.count,
              'red',
              <AlertCircle className="h-5 w-5 text-red-600" />,
              previewErrors.items
            )}
          </div>

          {hasMissingClients && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Hay citas con clientes sin ficha
              </h4>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Puedes crear la ficha antes de importar o omitir esas citas y darlas de alta manualmente.
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
                  Omitir esas citas e importar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {summaryCard(
              'result-success',
              'Importadas',
              commitSuccess.count,
              'green',
              <CheckCircle className="h-5 w-5 text-green-600" />,
              commitSuccess.items
            )}
            {summaryCard(
              'result-created-clients',
              'Fichas creadas',
              commitCreatedClients.count,
              'green',
              <CheckCircle className="h-5 w-5 text-green-600" />,
              commitCreatedClients.items
            )}
            {commitDetectedProfessionals.count > 0 &&
              summaryCard(
                'result-detected-professionals',
                'Profesionales detectadas',
                commitDetectedProfessionals.count,
                'blue',
                <AlertCircle className="h-5 w-5 text-blue-600" />,
                commitDetectedProfessionals.items
              )}
            {summaryCard(
              'result-duplicates',
              'Duplicadas',
              commitDuplicates.count,
              'amber',
              <AlertCircle className="h-5 w-5 text-amber-600" />,
              commitDuplicates.items
            )}
            {summaryCard(
              'result-missing',
              'Sin ficha',
              commitMissingClients.count,
              'red',
              <AlertCircle className="h-5 w-5 text-red-600" />,
              commitMissingClients.items
            )}
            {summaryCard(
              'result-blocks',
              'Bloqueos',
              commitBlocks.count,
              'blue',
              <AlertCircle className="h-5 w-5 text-blue-600" />,
              commitBlocks.items
            )}
            {summaryCard(
              'result-conflicts',
              'Conflictos',
              commitConflicts.count,
              'amber',
              <AlertCircle className="h-5 w-5 text-amber-600" />,
              commitConflicts.items
            )}
            {summaryCard(
              'result-skipped',
              'Omitidas',
              commitSkipped.count,
              'blue',
              <AlertCircle className="h-5 w-5 text-blue-600" />,
              commitSkipped.items
            )}
            {summaryCard(
              'result-errors',
              'Errores',
              commitErrors.count,
              'red',
              <AlertCircle className="h-5 w-5 text-red-600" />,
              commitErrors.items
            )}
          </div>

          {importDecision !== null && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200">
              {importDecision
                ? 'Se ha importado creando las fichas necesarias para los clientes ausentes.'
                : 'Se han omitido las citas de clientes sin ficha.'}
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

      <Modal
        isOpen={detectedProfessionalsModalOpen}
        onClose={() => {
          if (!persistingDetectedProfessionals) {
            setDetectedProfessionalsModalOpen(false)
          }
        }}
        title="Profesionales detectadas"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En la importación de citas se han detectado {commitDetectedProfessionals.count}{' '}
            {commitDetectedProfessionals.count === 1 ? 'profesional nueva' : 'profesionales nuevas'}.
            ¿Quieres dejarlas incluidas en el programa?
          </p>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap gap-2">
              {commitDetectedProfessionals.items.map((professional: any) => (
                <span
                  key={String(professional)}
                  className="badge badge-primary"
                >
                  {String(professional)}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setDetectedProfessionalsModalOpen(false)}
              className="btn btn-secondary"
              disabled={persistingDetectedProfessionals}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => void handlePersistDetectedProfessionals()}
              className="btn btn-primary"
              disabled={persistingDetectedProfessionals}
            >
              {persistingDetectedProfessionals ? 'Guardando...' : 'Sí, incluir'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
