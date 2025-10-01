import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

interface ClientFormProps {
  client?: any
  onSuccess: () => void
  onCancel: () => void
}

export default function ClientForm({ client, onSuccess, onCancel }: ClientFormProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    address: '',
    city: '',
    postalCode: '',
    notes: '',
    isActive: true
  })

  useEffect(() => {
    if (client) {
      setFormData({
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        email: client.email || '',
        phone: client.phone || '',
        birthDate: client.birthDate ? new Date(client.birthDate).toISOString().split('T')[0] : '',
        address: client.address || '',
        city: client.city || '',
        postalCode: client.postalCode || '',
        notes: client.notes || '',
        isActive: client.isActive ?? true
      })
    }
  }, [client])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
      // Validaciones básicas
      if (!formData.firstName.trim()) {
        toast.error('El nombre es requerido')
        setLoading(false)
        return
      }

      if (!formData.lastName.trim()) {
        toast.error('El apellido es requerido')
        setLoading(false)
        return
      }

      if (!formData.phone.trim()) {
        toast.error('El teléfono es requerido')
        setLoading(false)
        return
      }

      // Preparar datos para enviar
      const dataToSend: any = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || null,
        birthDate: formData.birthDate ? new Date(formData.birthDate).toISOString() : null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        postalCode: formData.postalCode.trim() || null,
        notes: formData.notes.trim() || null,
        isActive: formData.isActive
      }

      if (client) {
        // Actualizar cliente existente
        await api.put(`/clients/${client.id}`, dataToSend)
        toast.success('Cliente actualizado exitosamente')
      } else {
        // Crear nuevo cliente
        await api.post('/clients', dataToSend)
        toast.success('Cliente creado exitosamente')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving client:', error)
      toast.error(error.response?.data?.error || 'Error al guardar el cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Información Personal */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Información Personal
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className="input"
              placeholder="Ej: María"
              required
            />
          </div>

          <div>
            <label className="label">
              Apellidos <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className="input"
              placeholder="Ej: García López"
              required
            />
          </div>

          <div>
            <label className="label">
              Fecha de Nacimiento
            </label>
            <input
              type="date"
              name="birthDate"
              value={formData.birthDate}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Información de Contacto */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Contacto
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">
              Teléfono <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="input"
              placeholder="Ej: 612345678"
              required
            />
          </div>

          <div>
            <label className="label">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="input"
              placeholder="cliente@email.com"
            />
          </div>
        </div>
      </div>

      {/* Dirección */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Dirección
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">Dirección</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="input"
              placeholder="Calle, número, piso..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Ciudad</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="input"
                placeholder="Ej: Madrid"
              />
            </div>

            <div>
              <label className="label">Código Postal</label>
              <input
                type="text"
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                className="input"
                placeholder="Ej: 28001"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="label">Notas</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          className="input resize-none"
          rows={3}
          placeholder="Preferencias, alergias, comentarios..."
        />
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
          Cliente activo
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
          {loading ? 'Guardando...' : client ? 'Actualizar' : 'Crear Cliente'}
        </button>
      </div>
    </form>
  )
}
