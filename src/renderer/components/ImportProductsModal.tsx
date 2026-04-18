import { useState } from 'react'
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import {
  XLSX_FILE_ACCEPT,
  assertSupportedSpreadsheetFile,
  downloadWorkbook,
  markFirstRowAsHeader,
  setWorksheetColumnWidths
} from '../utils/excel'

interface ImportProductsModalProps {
  onSuccess: () => void
  onCancel: () => void
}

export default function ImportProductsModal({ onSuccess, onCancel }: ImportProductsModalProps) {
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
      await downloadWorkbook('plantilla_productos.xlsx', (workbook) => {
        const worksheet = workbook.addWorksheet('Productos')
        worksheet.addRow(['ID', 'Marca', 'Familia', 'Descripcion', 'Cantidad', 'PVP'])
        worksheet.addRow(['CHAMP-001', "L'Oréal", 'Cuidado del Cabello', 'Champu hidratante 500ml', 50, '15,99'])
        markFirstRowAsHeader(worksheet)
        setWorksheetColumnWidths(worksheet, [15, 20, 20, 35, 10, 10])
      })

      toast.success('Plantilla descargada')
    } catch (error) {
      console.error('Error generating products template:', error)
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

      const response = await api.post('/products/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setResults(response.data.results)

      if (response.data.results.success > 0) {
        toast.success(`${response.data.results.success} productos importados exitosamente`)

        // Si hay errores, mostrar el resumen pero no cerrar el modal
        if (response.data.results.errors.length === 0) {
          setTimeout(() => {
            onSuccess()
          }, 2000)
        }
      } else {
        toast.error('No se pudo importar ningún producto')
      }
    } catch (error: any) {
      console.error('Error importing products:', error)
      toast.error(error.response?.data?.error || 'Error al importar productos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Instrucciones */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
              Instrucciones para importar productos
            </h3>
            <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Descarga la plantilla de Excel haciendo clic en el botón de abajo</li>
              <li>Rellena la plantilla con los datos de tus productos</li>
              <li>Los campos <strong>obligatorios</strong> son: ID, Familia, Descripción, PVP</li>
              <li>Sube el archivo Excel completado</li>
              <li>Revisa los resultados y confirma la importación</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Descargar plantilla */}
      <div>
        <button
          onClick={handleDownloadTemplate}
          className="btn btn-secondary w-full"
        >
          <Download className="w-5 h-5 mr-2" />
          Descargar Plantilla de Excel
        </button>
      </div>

      {/* Seleccionar archivo */}
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
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Excel (.xlsx)
                  </p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept={XLSX_FILE_ACCEPT}
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      {/* Resultados */}
      {results && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-800 dark:text-green-300">Exitosos</span>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-900 dark:text-green-200 mt-1">
                {results.success}
              </p>
            </div>

            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-800 dark:text-red-300">Errores</span>
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-900 dark:text-red-200 mt-1">
                {results.errors.length}
              </p>
            </div>

            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-orange-800 dark:text-orange-300">Omitidos</span>
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-200 mt-1">
                {results.skipped}
              </p>
            </div>
          </div>

          {/* Detalles de errores */}
          {results.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Errores encontrados:
              </h4>
              <div className="space-y-1">
                {results.errors.map((err: any, idx: number) => (
                  <p key={idx} className="text-xs text-red-600 dark:text-red-400">
                    • Fila {err.row}: {err.error}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botones */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          <X className="w-4 h-4 mr-2" />
          {results ? 'Cerrar' : 'Cancelar'}
        </button>
        {!results && (
          <button
            onClick={handleImport}
            className="btn btn-primary"
            disabled={loading || !file}
          >
            <Upload className="w-4 h-4 mr-2" />
            {loading ? 'Importando...' : 'Importar Productos'}
          </button>
        )}
      </div>
    </div>
  )
}
