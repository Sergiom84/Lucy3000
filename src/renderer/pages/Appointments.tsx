import { useEffect, useState, useMemo } from 'react'
import { Calendar as BigCalendar, momentLocalizer, View } from 'react-big-calendar'
import moment from 'moment'
import 'moment/locale/es'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Plus, Calendar as CalendarIcon, Clock, User, List } from 'lucide-react'
import api from '../utils/api'
import { formatDate, formatTime } from '../utils/format'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import AppointmentForm from '../components/AppointmentForm'

// Configurar moment en español
moment.locale('es')
const localizer = momentLocalizer(moment)

const messages = {
  allDay: 'Todo el día',
  previous: 'Anterior',
  next: 'Siguiente',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Cita',
  noEventsInRange: 'No hay citas en este rango',
  showMore: (total: number) => `+ Ver más (${total})`
}

const statusColors: Record<string, string> = {
  SCHEDULED: '#6B7280',
  CONFIRMED: '#d946ef',
  IN_PROGRESS: '#f59e0b',
  COMPLETED: '#10b981',
  CANCELLED: '#ef4444',
  NO_SHOW: '#ef4444'
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [view, setView] = useState<View>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    fetchAppointments()
  }, [currentDate, view])

  const fetchAppointments = async () => {
    try {
      // Calcular rango de fechas según la vista
      let startDate, endDate

      if (view === 'month') {
        startDate = moment(currentDate).startOf('month').subtract(7, 'days').toDate()
        endDate = moment(currentDate).endOf('month').add(7, 'days').toDate()
      } else if (view === 'week') {
        startDate = moment(currentDate).startOf('week').toDate()
        endDate = moment(currentDate).endOf('week').toDate()
      } else {
        startDate = moment(currentDate).startOf('day').toDate()
        endDate = moment(currentDate).endOf('day').toDate()
      }

      const response = await api.get('/appointments', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      })
      setAppointments(response.data)
    } catch (error) {
      console.error('Error fetching appointments:', error)
      toast.error('Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setSelectedDate(start)
    setEditingAppointment(null)
    setShowModal(true)
  }

  const handleSelectEvent = (event: any) => {
    setEditingAppointment(event.appointment)
    setSelectedDate(undefined)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingAppointment(null)
    setSelectedDate(undefined)
  }

  const handleFormSuccess = () => {
    handleCloseModal()
    fetchAppointments()
  }

  const handleDeleteAppointment = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta cita?')) return

    try {
      await api.delete(`/appointments/${id}`)
      toast.success('Cita eliminada')
      fetchAppointments()
      handleCloseModal()
    } catch (error) {
      toast.error('Error al eliminar cita')
    }
  }

  // Convertir citas a eventos del calendario
  const events = useMemo(() => {
    return appointments.map(appointment => {
      const appointmentDate = new Date(appointment.date)
      const [startHours, startMinutes] = appointment.startTime.split(':')
      const [endHours, endMinutes] = appointment.endTime.split(':')

      const start = new Date(appointmentDate)
      start.setHours(parseInt(startHours), parseInt(startMinutes))

      const end = new Date(appointmentDate)
      end.setHours(parseInt(endHours), parseInt(endMinutes))

      return {
        title: `${appointment.client.firstName} ${appointment.client.lastName} - ${appointment.service.name}`,
        start,
        end,
        appointment,
        resource: appointment
      }
    })
  }, [appointments])

  // Estilo personalizado para eventos
  const eventStyleGetter = (event: any) => {
    const backgroundColor = statusColors[event.appointment.status] || '#6B7280'
    return {
      style: {
        backgroundColor,
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
        fontSize: '12px'
      }
    }
  }

  // Estadísticas del día actual
  const todayAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.date)
    const today = new Date()
    return aptDate.toDateString() === today.toDateString()
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Agenda de Citas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona las citas de tus clientes
          </p>
        </div>
        <button
          onClick={() => {
            setEditingAppointment(null)
            setSelectedDate(new Date())
            setShowModal(true)
          }}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva Cita
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Citas Hoy
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {todayAppointments.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Confirmadas
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {todayAppointments.filter(a => a.status === 'CONFIRMED').length}
          </p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Completadas
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {todayAppointments.filter(a => a.status === 'COMPLETED').length}
          </p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total Mes
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {appointments.length}
          </p>
        </div>
      </div>

      {/* Calendar */}
      <div className="card" style={{ height: '700px' }}>
        <BigCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          messages={messages}
          views={['month', 'week', 'day', 'agenda']}
          view={view}
          onView={setView}
          date={currentDate}
          onNavigate={setCurrentDate}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          selectable
          eventPropGetter={eventStyleGetter}
          style={{ height: '100%' }}
          step={15}
          timeslots={4}
          min={new Date(2024, 0, 1, 8, 0, 0)}
          max={new Date(2024, 0, 1, 21, 0, 0)}
        />
      </div>

      {/* Modal de Formulario */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingAppointment ? 'Editar Cita' : 'Nueva Cita'}
        maxWidth="xl"
      >
        <div className="space-y-4">
          {editingAppointment && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Cliente</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {editingAppointment.client.firstName} {editingAppointment.client.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Servicio</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {editingAppointment.service.name}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Fecha</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(editingAppointment.date)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Horario</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {editingAppointment.startTime} - {editingAppointment.endTime}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => handleDeleteAppointment(editingAppointment.id)}
                  className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-900 text-sm"
                >
                  Eliminar Cita
                </button>
              </div>
            </div>
          )}

          <AppointmentForm
            appointment={editingAppointment}
            onSuccess={handleFormSuccess}
            onCancel={handleCloseModal}
            preselectedDate={selectedDate}
          />
        </div>
      </Modal>
    </div>
  )
}
