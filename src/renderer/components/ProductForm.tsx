import { useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { invalidateActiveProductsCache } from '../utils/appointmentCatalogs'

interface ProductFormProps {
  product?: any
  availableCategories: string[]
  onSuccess: () => void
  onCancel: () => void
}

const units = [
  'unidad',
  'ml',
  'g',
  'kg',
  'l',
  'pack'
]

const NEW_CATEGORY_OPTION = '__new_category__'

const buildInitialFormData = (product?: any) => ({
  name: product?.name || '',
  description: product?.description || '',
  sku: product?.sku || '',
  barcode: product?.barcode || '',
  category: String(product?.category || '').trim(),
  brand: product?.brand || '',
  price: product?.price?.toString() || '',
  cost: product?.cost?.toString() || '',
  stock: product?.stock?.toString() || '',
  minStock: product?.minStock?.toString() || '',
  maxStock: product?.maxStock?.toString() || '',
  unit: product?.unit || 'unidad',
  isActive: product?.isActive ?? true
})

export default function ProductForm({ product, availableCategories, onSuccess, onCancel }: ProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [categoryMode, setCategoryMode] = useState<'existing' | 'new'>('existing')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [formData, setFormData] = useState(buildInitialFormData(product))

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...availableCategories, String(product?.category || '').trim()]
            .map((category) => String(category || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [availableCategories, product?.category]
  )

  useEffect(() => {
    setFormData(buildInitialFormData(product))
    setCategoryMode('existing')
    setNewCategoryName('')
  }, [product])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleCategorySelection = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target

    if (value === NEW_CATEGORY_OPTION) {
      setCategoryMode('new')
      return
    }

    setCategoryMode('existing')
    setFormData((prev) => ({
      ...prev,
      category: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const resolvedCategory =
        categoryMode === 'new' ? newCategoryName.trim() : formData.category.trim()

      // Validaciones
      if (!formData.name.trim()) {
        toast.error('El nombre del producto es requerido')
        setLoading(false)
        return
      }

      if (!resolvedCategory) {
        toast.error('La categoría es obligatoria')
        setLoading(false)
        return
      }

      if (!formData.sku.trim()) {
        toast.error('El SKU es requerido')
        setLoading(false)
        return
      }

      if (!formData.brand.trim()) {
        toast.error('La marca es obligatoria')
        setLoading(false)
        return
      }

      if (!formData.price || parseFloat(formData.price) <= 0) {
        toast.error('El precio debe ser mayor a 0')
        setLoading(false)
        return
      }

      if (!formData.cost || parseFloat(formData.cost) < 0) {
        toast.error('El costo no puede ser negativo')
        setLoading(false)
        return
      }

      if (!formData.stock || parseInt(formData.stock) < 0) {
        toast.error('El stock no puede ser negativo')
        setLoading(false)
        return
      }

      // Preparar datos
      const dataToSend = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        sku: formData.sku.trim(),
        barcode: formData.barcode.trim() || null,
        category: resolvedCategory,
        brand: formData.brand.trim(),
        price: parseFloat(formData.price),
        cost: parseFloat(formData.cost),
        stock: parseInt(formData.stock),
        minStock: formData.minStock.trim() === '' ? 0 : parseInt(formData.minStock, 10),
        maxStock: formData.maxStock ? parseInt(formData.maxStock) : null,
        unit: formData.unit,
        isActive: formData.isActive
      }

      if (product) {
        await api.put(`/products/${product.id}`, dataToSend)
        invalidateActiveProductsCache()
        toast.success('Producto actualizado exitosamente')
      } else {
        await api.post('/products', dataToSend)
        invalidateActiveProductsCache()
        toast.success('Producto creado exitosamente')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving product:', error)
      toast.error(error.response?.data?.error || 'Error al guardar el producto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Información Básica */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Información del Producto
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Código de Barras</label>
              <input
                type="text"
                name="barcode"
                value={formData.barcode}
                onChange={handleChange}
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">
                Categoría <span className="text-red-500">*</span>
              </label>
              <select
                value={categoryMode === 'new' ? NEW_CATEGORY_OPTION : formData.category}
                onChange={handleCategorySelection}
                className="input"
              >
                <option value={NEW_CATEGORY_OPTION}>Crear nueva categoría</option>
                <option value="">Selecciona una categoría</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">
                Marca <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="brand"
                value={formData.brand}
                onChange={handleChange}
                className="input"
                required
              />
            </div>

            {categoryMode === 'new' && (
              <div className="md:col-span-2">
                <label className="label">
                  Nueva categoría <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  className="input"
                  placeholder="Ej: Cosmética facial"
                  maxLength={120}
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="input resize-none"
              rows={3}
              placeholder="Añade notas, observaciones o aclaraciones del producto..."
            />
          </div>
        </div>
      </div>

      {/* Precios */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Precios
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">
              Precio de Venta (€) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              className="input"
              step="0.01"
              min="0"
              required
            />
          </div>

          <div>
            <label className="label">
              Costo (€) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="cost"
              value={formData.cost}
              onChange={handleChange}
              className="input"
              step="0.01"
              min="0"
              required
            />
          </div>
        </div>
      </div>

      {/* Inventario */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Inventario
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">
              Stock Actual <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="stock"
              value={formData.stock}
              onChange={handleChange}
              className="input"
              min="0"
              required
            />
          </div>

          <div>
            <label className="label">Unidad</label>
            <select
              name="unit"
              value={formData.unit}
              onChange={handleChange}
              className="input"
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Stock Mínimo</label>
            <input
              type="number"
              name="minStock"
              value={formData.minStock}
              onChange={handleChange}
              className="input"
              min="0"
            />
          </div>

          <div>
            <label className="label">Stock Máximo</label>
            <input
              type="number"
              name="maxStock"
              value={formData.maxStock}
              onChange={handleChange}
              className="input"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Estado */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="isActive"
          name="isActive"
          checked={formData.isActive}
          onChange={handleChange}
          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="isActive" className="ml-2 text-sm text-gray-900 dark:text-white">
          Producto activo
        </label>
      </div>

      {/* Botones */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Guardando...' : product ? 'Actualizar' : 'Crear Producto'}
        </button>
      </div>
    </form>
  )
}
