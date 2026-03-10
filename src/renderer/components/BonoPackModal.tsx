import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

interface BonoPackModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  onSuccess: () => void
}

export default function BonoPackModal({ isOpen, onClose, clientId, onSuccess }: BonoPackModalProps) {
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState<any[]>([])
  const [formData, setFormData] = useState({
    name: '',
    serviceId: '',
    totalSessions: '5',
    price: '',
    expiryDate: '',
    notes: ''
  })

  useEffect(() => {
    if (isOpen) {
      api.get('/services?isActive=true')
        .then(res => setServices(res.data || []))
        .catch(() => {})
      setFormData({ name: '', serviceId: '', totalSessions: '5', price: '', expiryDate: '', notes: '' })
    }
  }, [isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('El nombre del bono es requerido')
      return
    }
    const totalSessions = parseInt(formData.totalSessions, 10)
    if (!totalSessions || totalSessions < 1) {
      toast.error('El número de sesiones debe ser al menos 1')
      return
    }

    setLoading(true)
    try {
      await api.post('/bonos', {
        clientId,
        name: formData.name.trim(),
        serviceId: formData.serviceId || null,
        totalSessions,
        price: formData.price ? parseFloat(formData.price.replace(',', '.')) : 0,
        expiryDate: formData.expiryDate || null,
        notes: formData.notes.trim() || null
      })
      toast.success('Bono creado exitosamente')
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Error creating bono:', error)
      toast.error(error.response?.data?.error || 'Error al crear el bono')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Bono" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nombre del bono <span className="text-red-500">*</span></label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="input"
            placeholder="Ej: 5 sesiones de Mechas"
            required
          />
        </div>

        <div>
          <label className="label">Servicio asociado</label>
          <select
            name="serviceId"
            value={formData.serviceId}
            onChange={handleChange}
            className="input"
          >
            <option value="">Sin servicio específico</option>
            {services.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name} - {s.category}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nº sesiones <span className="text-red-500">*</span></label>
            <input
              type="number"
              name="totalSessions"
              value={formData.totalSessions}
              onChange={handleChange}
              className="input"
              min="1"
              max="100"
              required
            />
          </div>
          <div>
            <label className="label">Precio total</label>
            <input
              type="text"
              name="price"
              value={formData.price}
              onChange={handleChange}
              className="input"
              placeholder="0,00"
            />
          </div>
        </div>

        <div>
          <label className="label">Fecha de expiración</label>
          <input
            type="date"
            name="expiryDate"
            value={formData.expiryDate}
            onChange={handleChange}
            className="input"
          />
        </div>

        <div>
          <label className="label">Notas</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="input resize-none"
            rows={2}
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Creando...' : 'Crear Bono'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
