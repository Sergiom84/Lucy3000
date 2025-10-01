import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'

interface AppointmentFormProps {
  appointment?: any
  onSuccess: () => void
  onCancel: () => void
  preselectedDate?: Date
}

const statusOptions = [
  { value: 'SCHEDULED', label: 'Programada', color: 'secondary' },
  { value: 'CONFIRMED', label: 'Confirmada', color: 'primary' },
  { value: 'IN_PROGRESS', label: 'En Progreso', color: 'warning' },
  { value: 'COMPLETED', label: 'Completada', color: 'success' },
  { value: 'CANCELLED', label: 'Cancelada', color: 'danger' },
  { value: 'NO_SHOW', label: 'No Asistió', color: 'danger' }
]

export default function AppointmentForm({ appointment, onSuccess, onCancel, preselectedDate }: AppointmentFormProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<any>(null)

  const [formData, setFormData] = useState({
    clientId: '',
    serviceId: '',
    userId: user?.id || '',
    date: '',
    startTime: '',
    endTime: '',
    status: 'SCHEDULED',
    notes: '',
    reminder: true
  })

  useEffect(() => {
    fetchClients()
    fetchServices()
  }, [])

  useEffect(() => {
    if (appointment) {
      const appointmentDate = new Date(appointment.date)
      setFormData({
        clientId: appointment.clientId || '',
        serviceId: appointment.serviceId || '',
        userId: appointment.userId || user?.id || '',
        date: appointmentDate.toISOString().split('T')[0],
        startTime: appointment.startTime || '',
        endTime: appointment.endTime || '',
        status: appointment.status || 'SCHEDULED',
        notes: appointment.notes || '',
        reminder: appointment.reminder ?? true
      })
      if (appointment.service) {
        setSelectedService(appointment.service)
      }
    } else if (preselectedDate) {
      setFormData(prev => ({
        ...prev,
        date: preselectedDate.toISOString().split('T')[0]
      }))
    }
  }, [appointment, preselectedDate, user])

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients?isActive=true')
      // Ordenar alfabéticamente por nombre
      const sortedClients = response.data.sort((a: any, b: any) => {
        const fullNameA = `${a.firstName} ${a.lastName}`
        const fullNameB = `${b.firstName} ${b.lastName}`
        return fullNameA.localeCompare(fullNameB, 'es', { sensitivity: 'base' })
      })
      setClients(sortedClients)
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }

  const fetchServices = async () => {
    try {
      const response = await api.get('/services?isActive=true')
      // Ordenar alfabéticamente por nombre
      const sortedServices = response.data.sort((a: any, b: any) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      )
      setServices(sortedServices)
    } catch (error) {
      console.error('Error fetching services:', error)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))

    // Si cambia el servicio, calcular endTime automáticamente
    if (name === 'serviceId') {
      const service = services.find(s => s.id === value)
      setSelectedService(service)
      if (service && formData.startTime) {
        const [hours, minutes] = formData.startTime.split(':')
        const startDate = new Date()
        startDate.setHours(parseInt(hours), parseInt(minutes))
        startDate.setMinutes(startDate.getMinutes() + service.duration)
        const endTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
        setFormData(prev => ({ ...prev, endTime }))
      }
    }

    // Si cambia startTime y hay un servicio seleccionado, recalcular endTime
    if (name === 'startTime' && selectedService) {
      const [hours, minutes] = value.split(':')
      const startDate = new Date()
      startDate.setHours(parseInt(hours), parseInt(minutes))
      startDate.setMinutes(startDate.getMinutes() + selectedService.duration)
      const endTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
      setFormData(prev => ({ ...prev, endTime }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validaciones
      if (!formData.clientId) {
        toast.error('Debe seleccionar un cliente')
        setLoading(false)
        return
      }

      if (!formData.serviceId) {
        toast.error('Debe seleccionar un servicio')
        setLoading(false)
        return
      }

      if (!formData.date) {
        toast.error('Debe seleccionar una fecha')
        setLoading(false)
        return
      }

      if (!formData.startTime || !formData.endTime) {
        toast.error('Debe seleccionar horario de inicio y fin')
        setLoading(false)
        return
      }

      // Preparar datos
      const dataToSend = {
        clientId: formData.clientId,
        serviceId: formData.serviceId,
        userId: formData.userId || user?.id,
        date: new Date(formData.date).toISOString(),
        startTime: formData.startTime,
        endTime: formData.endTime,
        status: formData.status,
        notes: formData.notes.trim() || null,
        reminder: formData.reminder
      }

      if (appointment) {
        await api.put(`/appointments/${appointment.id}`, dataToSend)
        toast.success('Cita actualizada exitosamente')
      } else {
        await api.post('/appointments', dataToSend)
        toast.success('Cita creada exitosamente')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving appointment:', error)
      toast.error(error.response?.data?.error || 'Error al guardar la cita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente y Servicio */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Cliente y Servicio
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">
              Cliente <span className="text-red-500">*</span>
            </label>
            <select
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName} - {client.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">
              Servicio <span className="text-red-500">*</span>
            </label>
            <select
              name="serviceId"
              value={formData.serviceId}
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Seleccionar servicio</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} ({service.duration} min)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Fecha y Hora */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Fecha y Horario
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">
              Fecha <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">
              Hora Inicio <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleChange}
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">
              Hora Fin <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
        </div>
      </div>

      {/* Estado */}
      <div>
        <label className="label">Estado</label>
        <select
          name="status"
          value={formData.status}
          onChange={handleChange}
          className="input"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
          placeholder="Instrucciones especiales, preferencias del cliente..."
        />
      </div>

      {/* Recordatorio */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="reminder"
          name="reminder"
          checked={formData.reminder}
          onChange={handleChange}
          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="reminder" className="ml-2 text-sm text-gray-900 dark:text-white">
          Enviar recordatorio al cliente
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
          {loading ? 'Guardando...' : appointment ? 'Actualizar Cita' : 'Crear Cita'}
        </button>
      </div>
    </form>
  )
}
