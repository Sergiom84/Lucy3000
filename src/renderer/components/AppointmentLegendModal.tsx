import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  createAppointmentLegendItem,
  deleteAppointmentLegendItem,
  type AppointmentLegendCatalogItem
} from '../utils/appointmentCatalogs'

const DEFAULT_LEGEND_COLOR = '#7C3AED'

interface AppointmentLegendModalProps {
  isOpen: boolean
  legendItems: AppointmentLegendCatalogItem[]
  availableCategories: string[]
  onUpdated: (items: AppointmentLegendCatalogItem[]) => void
}

const normalizeCategoryKey = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()

export default function AppointmentLegendModal({
  isOpen,
  legendItems,
  availableCategories,
  onUpdated
}: AppointmentLegendModalProps) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [color, setColor] = useState(DEFAULT_LEGEND_COLOR)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const usedCategoryKeys = useMemo(
    () => new Set(legendItems.map((item) => normalizeCategoryKey(item.category))),
    [legendItems]
  )
  const remainingCategories = useMemo(
    () =>
      availableCategories.filter(
        (category) => !usedCategoryKeys.has(normalizeCategoryKey(category))
      ),
    [availableCategories, usedCategoryKeys]
  )

  useEffect(() => {
    if (!isOpen) return

    setSelectedCategory(remainingCategories[0] || '')
    setColor(DEFAULT_LEGEND_COLOR)
  }, [isOpen, remainingCategories])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!selectedCategory) {
      toast.error('Selecciona una categoría')
      return
    }

    setSaving(true)

    try {
      const nextItems = await createAppointmentLegendItem({
        category: selectedCategory,
        color
      })
      onUpdated(nextItems)
      setSelectedCategory('')
      toast.success('Leyenda añadida')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo añadir la leyenda')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)

    try {
      const nextItems = await deleteAppointmentLegendItem(id)
      onUpdated(nextItems)
      toast.success('Leyenda eliminada')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo eliminar la leyenda')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[7rem_minmax(0,1fr)_auto] gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
        <span>Color</span>
        <span>Categoría</span>
        <span className="text-right">Acción</span>
      </div>

      {legendItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800/40 dark:text-gray-400">
          No hay leyendas configuradas todavía.
        </div>
      ) : (
        <div className="space-y-2">
          {legendItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-6 w-6 rounded-full border border-black/10"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{item.color}</span>
              </div>
              <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{item.category}</span>
              <button
                type="button"
                onClick={() => void handleDelete(item.id)}
                className="btn btn-secondary btn-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                disabled={deletingId === item.id}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {deletingId === item.id ? 'Borrando...' : 'Eliminar'}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <div>
            <label className="label">Color</label>
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value.toUpperCase())}
              className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="label">Categoría</label>
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="input"
              disabled={remainingCategories.length === 0}
            >
              {remainingCategories.length === 0 ? (
                <option value="">No hay categorías disponibles</option>
              ) : (
                <>
                  <option value="">Selecciona una categoría</option>
                  {remainingCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </>
              )}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Las categorías se leen directamente de los tratamientos guardados.
            </p>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="btn btn-primary w-full md:w-auto"
              disabled={saving || remainingCategories.length === 0 || !selectedCategory}
            >
              <Plus className="mr-2 h-4 w-4" />
              {saving ? 'Añadiendo...' : 'Añadir'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
