import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

interface ProductFormProps {
  product?: any
  onSuccess: () => void
  onCancel: () => void
}

const categories = [
  'Cuidado del Cabello',
  'Coloración',
  'Tratamientos',
  'Manicura y Pedicura',
  'Maquillaje',
  'Cosmética Facial',
  'Accesorios',
  'Otros'
]

const units = [
  'unidad',
  'ml',
  'g',
  'kg',
  'l',
  'pack'
]

export default function ProductForm({ product, onSuccess, onCancel }: ProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    category: categories[0],
    brand: '',
    price: '',
    cost: '',
    stock: '',
    minStock: '5',
    maxStock: '',
    unit: 'unidad',
    isActive: true
  })

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        category: product.category || categories[0],
        brand: product.brand || '',
        price: product.price?.toString() || '',
        cost: product.cost?.toString() || '',
        stock: product.stock?.toString() || '',
        minStock: product.minStock?.toString() || '5',
        maxStock: product.maxStock?.toString() || '',
        unit: product.unit || 'unidad',
        isActive: product.isActive ?? true
      })
    }
  }, [product])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validaciones
      if (!formData.name.trim()) {
        toast.error('El nombre del producto es requerido')
        setLoading(false)
        return
      }

      if (!formData.sku.trim()) {
        toast.error('El SKU es requerido')
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
        category: formData.category,
        brand: formData.brand.trim() || null,
        price: parseFloat(formData.price),
        cost: parseFloat(formData.cost),
        stock: parseInt(formData.stock),
        minStock: parseInt(formData.minStock) || 5,
        maxStock: formData.maxStock ? parseInt(formData.maxStock) : null,
        unit: formData.unit,
        isActive: formData.isActive
      }

      if (product) {
        await api.put(`/products/${product.id}`, dataToSend)
        toast.success('Producto actualizado exitosamente')
      } else {
        await api.post('/products', dataToSend)
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
              placeholder="Ej: Champú Hidratante"
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
                placeholder="CHAMP-001"
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
                placeholder="1234567890123"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Categoría</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="input"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Marca</label>
              <input
                type="text"
                name="brand"
                value={formData.brand}
                onChange={handleChange}
                className="input"
                placeholder="Ej: L'Oréal"
              />
            </div>
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="input resize-none"
              rows={3}
              placeholder="Descripción detallada del producto..."
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
              placeholder="15.99"
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
              placeholder="8.50"
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
              placeholder="100"
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
              placeholder="5"
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
              placeholder="500"
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
          <X className="w-4 h-4 mr-2" />
          Cancelar
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Guardando...' : product ? 'Actualizar' : 'Crear Producto'}
        </button>
      </div>
    </form>
  )
}
