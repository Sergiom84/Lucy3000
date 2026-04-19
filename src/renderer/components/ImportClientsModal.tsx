import { useState } from 'react'
import { FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { invalidateAppointmentClientsCache } from '../utils/appointmentCatalogs'
import {
  XLSX_FILE_ACCEPT,
  assertSupportedSpreadsheetFile,
  downloadWorkbook,
  markFirstRowAsHeader,
  setWorksheetColumnWidths,
  setWorksheetHeaderAutoFilter
} from '../utils/excel'

interface ImportClientsModalProps {
  onSuccess: () => void
  onCancel: () => void
}

const templateHeaders = [
  'Nº Cliente',
  'DNI',
  'Nombre',
  'Apellidos',
  'Sexo',
  'Teléfono principal',
  'Móvil',
  'Teléfono fijo',
  'Email',
  'Fecha de nacimiento',
  'Fecha de alta',
  'Última visita',
  'Dirección',
  'Ciudad',
  'CP',
  'Provincia',
  'Nº tratamientos activos',
  'Tratamientos activos',
  'Nº abonos',
  'Cheque regalo',
  'Obsequios',
  'Cantidad de servicios',
  'Importe facturado',
  'Importe pendiente',
  'Saldo a cuenta',
  'Avisar deuda',
  'Parentesco',
  'Cliente vinculado',
  'Alergias',
  'Notas',
  'Cliente activo'
]

const templateExampleRow = [
  'CL-001',
  '12345678A',
  'Maria',
  'Garcia Lopez',
  'MUJER',
  '600123456',
  '600123456',
  '914445566',
  'maria@example.com',
  '1985-03-15',
  '2026-01-10',
  '2026-03-20',
  'Calle Mayor, 1',
  'Madrid',
  '28001',
  'Madrid',
  '2',
  'Radiofrecuencia, Presoterapia',
  '1',
  'NAVIDAD26',
  'Crema hidratante',
  '12',
  '1250,50',
  '25,00',
  '30,00',
  'SI',
  'Madre',
  'CL-002',
  'Látex',
  'Prefiere citas de mañana',
  'SI'
]

const templateColumnWidths = [
  12, 14, 16, 24, 10, 18, 14, 16, 26, 18, 16, 16, 26, 16, 10, 14, 22, 28, 12, 16, 18, 18, 18, 18, 16, 14, 16, 18, 18, 28, 14
]

const guideRows = [
  ['Campo', 'Qué admite', 'Ejemplo'],
  ['Sexo', 'HOMBRE o MUJER', 'MUJER'],
  ['Fechas', 'Preferible AAAA-MM-DD. También se aceptan DD-MM-AA o DD-MM-AAAA', '1985-03-15'],
  ['Avisar deuda', 'SI/NO, TRUE/FALSE o 1/0', 'SI'],
  ['Cliente vinculado', 'Nº Cliente, email, teléfono o nombre completo de otro cliente', 'CL-002'],
  ['Cliente activo', 'SI/NO, TRUE/FALSE o 1/0', 'SI'],
  ['Teléfonos', 'Hace falta al menos uno: principal, móvil o fijo', '600123456']
]

export default function ImportClientsModal({ onSuccess, onCancel }: ImportClientsModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

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
      setResults(null)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      await downloadWorkbook('plantilla_clientes.xlsx', (workbook) => {
        const clientsSheet = workbook.addWorksheet('Clientes')
        clientsSheet.addRow(templateHeaders)
        clientsSheet.addRow(templateExampleRow)
        markFirstRowAsHeader(clientsSheet)
        setWorksheetColumnWidths(clientsSheet, templateColumnWidths)
        setWorksheetHeaderAutoFilter(clientsSheet, templateHeaders.length)

        const guideSheet = workbook.addWorksheet('Guia')
        guideRows.forEach((row) => guideSheet.addRow(row))
        markFirstRowAsHeader(guideSheet)
        setWorksheetColumnWidths(guideSheet, [22, 60, 22])
      })

      toast.success('Plantilla descargada')
    } catch (error) {
      console.error('Error generating clients template:', error)
      toast.error('No se pudo generar la plantilla')
    }
  }

  const handleImport = async () => {
    if (!file) {
      toast.error('Por favor selecciona un archivo')
      return
    }

    setLoading(true)
    setResults(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/clients/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const nextResults = response.data.results
      const successCount = Number(nextResults?.success || 0)
      const skippedCount = Number(nextResults?.skipped || 0)
      const errorCount = Array.isArray(nextResults?.errors) ? nextResults.errors.length : 0

      setResults(nextResults)

      if (successCount > 0) {
        invalidateAppointmentClientsCache()
        toast.success(
          skippedCount > 0
            ? `${successCount} clientes importados. ${skippedCount} omitidos por ya existir.`
            : `${successCount} clientes importados exitosamente`
        )
        if (errorCount === 0) {
          setTimeout(() => onSuccess(), 2000)
        }
      } else if (skippedCount > 0 && errorCount === 0) {
        toast.success(`No había clientes nuevos. ${skippedCount} ya existían y se omitieron.`)
      } else {
        toast.error('No se pudo importar ningun cliente')
      }
    } catch (error: any) {
      console.error('Error importing clients:', error)
      toast.error(error.response?.data?.error || 'Error al importar clientes')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
              Instrucciones para importar clientes
            </h3>
            <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Descarga la plantilla actualizada o usa tu archivo si respeta estas cabeceras</li>
              <li>Campos mínimos: <strong>Nombre, Apellidos</strong> y al menos un teléfono entre <strong>Teléfono principal, Móvil o Teléfono fijo</strong></li>
              <li>La plantilla ya incluye los mismos datos que el alta manual: alergias, parentesco, nº de abonos, saldo a cuenta, notas y más</li>
              <li><strong>Cliente vinculado</strong> puede referenciarse por Nº Cliente, email, teléfono o nombre completo</li>
              <li>Si un cliente ya existe en Lucy3000, se omite para no duplicarlo. Se detecta por código, DNI, email o nombre + teléfono</li>
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
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <FileSpreadsheet className="w-10 h-10 text-gray-400 mb-3" />
              {file ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-semibold">{file.name}</span>
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold">Haz clic para subir</span> o arrastra el archivo
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Excel (.xlsx)</p>
                </>
              )}
            </div>
            <input type="file" className="hidden" accept={XLSX_FILE_ACCEPT} onChange={handleFileChange} />
          </label>
        </div>
      </div>

      {results && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-800 dark:text-green-300">Exitosos</span>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-900 dark:text-green-200 mt-1">{results.success}</p>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-800 dark:text-red-300">Errores</span>
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-900 dark:text-red-200 mt-1">{results.errors.length}</p>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-orange-800 dark:text-orange-300">Omitidos</span>
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-200 mt-1">{results.skipped}</p>
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Errores encontrados:</h4>
              <div className="space-y-1">
                {results.errors.map((err: any, idx: number) => (
                  <p key={idx} className="text-xs text-red-600 dark:text-red-400">
                    Fila {err.row}: {err.error}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={loading}>
          {results ? 'Cerrar' : 'Cancelar'}
        </button>
        {!results && (
          <button onClick={handleImport} className="btn btn-primary" disabled={loading || !file}>
            {loading ? 'Importando...' : 'Importar Clientes'}
          </button>
        )}
      </div>
    </div>
  )
}
