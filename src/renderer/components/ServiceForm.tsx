import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

interface ServiceFormProps {
  service?: any
  onSuccess: () => void
  onCancel: () => void
}

const categories = [
  'Corte y Peinado',
  'Coloración',
  'Tratamientos Capilares',
  'Manicura y Pedicura',
  'Depilación',
  'Tratamientos Faciales',
  'Maquillaje',
  'Extensiones',
  'Otros'
]

export default function ServiceForm({ service, onSuccess, onCancel }: ServiceFormProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: categories[0],
    price: '',
    duration: '',
    isActive: true
  })

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || '',
        description: service.description || '',
        category: service.category || categories[0],
        price: service.price?.toString() || '',
        duration: service.duration?.toString() || '',
        isActive: service.isActive ?? true
      })
    }
  }, [service])

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
        toast.error('El nombre del servicio es requerido')
        setLoading(false)
        return
      }

      if (!formData.price || parseFloat(formData.price) <= 0) {
        toast.error('El precio debe ser mayor a 0')
        setLoading(false)
        return
      }

      if (!formData.duration || parseInt(formData.duration) <= 0) {
        toast.error('La duración debe ser mayor a 0 minutos')
        setLoading(false)
        return
      }

      // Preparar datos
      const dataToSend = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category,
        price: parseFloat(formData.price),
        duration: parseInt(formData.duration),
        isActive: formData.isActive
      }

      if (service) {
        await api.put(`/services/${service.id}`, dataToSend)
        toast.success('Servicio actualizado exitosamente')
      } else {
        await api.post('/services', dataToSend)
        toast.success('Servicio creado exitosamente')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving service:', error)
      toast.error(error.response?.data?.error || 'Error al guardar el servicio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Información Básica */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Información del Servicio
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">
              Nombre del Servicio <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input"
              placeholder="Ej: Corte de Cabello"
              required
            />
          </div>

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
            <label className="label">Descripción</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="input resize-none"
              rows={3}
              placeholder="Descripción breve del servicio..."
            />
          </div>
        </div>
      </div>

      {/* Precio y Duración */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Precio y Duración
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">
              Precio (€) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              className="input"
              placeholder="25.00"
              step="0.01"
              min="0"
              required
            />
          </div>

          <div>
            <label className="label">
              Duración (minutos) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="duration"
              value={formData.duration}
              onChange={handleChange}
              className="input"
              placeholder="30"
              step="5"
              min="5"
              required
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
          Servicio activo
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
          {loading ? 'Guardando...' : service ? 'Actualizar' : 'Crear Servicio'}
        </button>
      </div>
    </form>
  )
}
