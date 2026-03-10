import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar as BigCalendar, momentLocalizer, View } from 'react-big-calendar'
import moment from 'moment'
import 'moment/locale/es'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { ChevronLeft, ChevronRight, CreditCard, Plus } from 'lucide-react'
import api from '../utils/api'
import { formatDate } from '../utils/format'
import { paymentMethodLabel } from '../utils/tickets'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import AppointmentForm from '../components/AppointmentForm'

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
  SCHEDULED: '#64748b',
  CONFIRMED: '#2563eb',
  IN_PROGRESS: '#f59e0b',
  COMPLETED: '#10b981',
  CANCELLED: '#ef4444',
  NO_SHOW: '#b91c1c'
}

const cabinResources = [
  { resourceId: 'LUCY', resourceTitle: 'Lucy' },
  { resourceId: 'TAMARA', resourceTitle: 'Tamara' },
  { resourceId: 'CABINA_1', resourceTitle: 'Cabina 1' },
  { resourceId: 'CABINA_2', resourceTitle: 'Cabina 2' }
]

function AppointmentEvent({ event }: { event: any }) {
  return (
    <div className="leading-tight">
      <p className="font-semibold text-xs truncate">{event.appointment.client.firstName} {event.appointment.client.lastName}</p>
      <p className="text-[11px] opacity-90 truncate">{event.appointment.service.name}</p>
      <p className="text-[10px] opacity-80">
        {event.appointment.startTime} - {event.appointment.endTime}
      </p>
    </div>
  )
}

export default function Appointments() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [initialCabin, setInitialCabin] = useState<'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'>('LUCY')
  const [view, setView] = useState<View>('day')
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    fetchAppointments()
  }, [currentDate, view])

  const fetchAppointments = async () => {
    try {
      let startDate
      let endDate

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

  const handleSelectSlot = ({ start, resourceId }: { start: Date; resourceId?: string | number }) => {
    setSelectedDate(start)
    const selectedCabin = String(resourceId || 'LUCY') as typeof initialCabin
    setInitialCabin(selectedCabin)
    setEditingAppointment(null)
    setShowModal(true)
  }

  const handleSelectEvent = (event: any) => {
    setEditingAppointment(event.appointment)
    setInitialCabin(event.appointment.cabin || 'LUCY')
    setSelectedDate(undefined)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingAppointment(null)
    setSelectedDate(undefined)
    setInitialCabin('LUCY')
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
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al eliminar cita')
    }
  }

  const goToCharge = (appointment: any) => {
    navigate(
      `/sales?clientId=${appointment.clientId}&serviceId=${appointment.serviceId}&appointmentId=${appointment.id}`
    )
  }

  const events = useMemo(
    () =>
      appointments.map((appointment) => {
        const appointmentDate = new Date(appointment.date)
        const [startHours, startMinutes] = appointment.startTime.split(':')
        const [endHours, endMinutes] = appointment.endTime.split(':')

        const start = new Date(appointmentDate)
        start.setHours(parseInt(startHours, 10), parseInt(startMinutes, 10))

        const end = new Date(appointmentDate)
        end.setHours(parseInt(endHours, 10), parseInt(endMinutes, 10))

        return {
          title: `${appointment.client.firstName} ${appointment.client.lastName}`,
          start,
          end,
          appointment,
          resourceId: appointment.cabin
        }
      }),
    [appointments]
  )

  const eventStyleGetter = (event: any) => {
    const backgroundColor = statusColors[event.appointment.status] || '#64748b'
    return {
      style: {
        backgroundColor,
        borderRadius: '8px',
        color: 'white',
        border: '0px',
        fontSize: '12px',
        padding: '4px 6px'
      }
    }
  }

  const todayAppointments = appointments.filter((appointment) => {
    const appointmentDate = new Date(appointment.date)
    const today = new Date()
    return appointmentDate.toDateString() === today.toDateString()
  })

  const activeCabinsToday = new Set(todayAppointments.map((appointment) => appointment.cabin)).size
  const remainingTodayAppointments = todayAppointments.filter(
    (appointment) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status)
  ).length

  const currentDateMoment = useMemo(() => moment(currentDate), [currentDate])
  const calendarWeekDays = useMemo(
    () => moment.weekdaysMin(true).map((day) => day.replace('.', '')),
    []
  )
  const monthGridDays = useMemo(() => {
    const monthStart = currentDateMoment.clone().startOf('month').startOf('week')
    return Array.from({ length: 42 }, (_, index) => monthStart.clone().add(index, 'days'))
  }, [currentDateMoment])

  const goToPreviousMonth = () => {
    setCurrentDate((value) => moment(value).subtract(1, 'month').toDate())
  }

  const goToNextMonth = () => {
    setCurrentDate((value) => moment(value).add(1, 'month').toDate())
  }

  const selectMiniCalendarDay = (dateValue: moment.Moment) => {
    setCurrentDate(dateValue.toDate())
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agenda de Citas</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Vista diaria priorizada por cabinas.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingAppointment(null)
            setInitialCabin('LUCY')
            setSelectedDate(new Date())
            setShowModal(true)
          }}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva Cita
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_22rem]">
        <div className="card self-start p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Citas hoy</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {todayAppointments.length}
          </p>
        </div>
        <div className="card self-start p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Cabinas activas</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {activeCabinsToday}
          </p>
        </div>
        <div className="card self-start p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Citas que quedan</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {remainingTodayAppointments}
          </p>
        </div>
        <div className="card self-start p-2.5 md:col-span-3 xl:col-span-1">
          <div className="mb-1.5 flex items-center justify-between">
            <button
              onClick={goToPreviousMonth}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              title="Mes anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <p className="text-xs font-semibold capitalize tracking-[0.08em] text-gray-700 dark:text-gray-200">
              {currentDateMoment.format('MMMM YYYY')}
            </p>
            <button
              onClick={goToNextMonth}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              title="Mes siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarWeekDays.map((weekday) => (
              <span
                key={weekday}
                className="text-[9px] font-medium uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
              >
                {weekday}
              </span>
            ))}
            {monthGridDays.map((day) => {
              const isCurrentMonth = day.isSame(currentDateMoment, 'month')
              const isSelectedDay = day.isSame(currentDateMoment, 'day')
              const isToday = day.isSame(moment(), 'day')

              return (
                <button
                  key={day.format('YYYY-MM-DD')}
                  onClick={() => selectMiniCalendarDay(day)}
                  className={`h-5 rounded-md text-[9px] font-semibold transition ${
                    isSelectedDay
                      ? 'bg-primary-600 text-white'
                      : isToday
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                        : isCurrentMonth
                          ? 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                          : 'text-gray-400 hover:bg-gray-100 dark:text-gray-600 dark:hover:bg-gray-700'
                  }`}
                >
                  {day.date()}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ height: '760px' }}>
        <BigCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          resources={cabinResources}
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
          messages={messages}
          components={{ event: AppointmentEvent }}
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

      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingAppointment?.id ? 'Editar Cita' : 'Nueva Cita'}
        maxWidth="xl"
      >
        <div className="space-y-4">
          {editingAppointment?.id && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
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
                  <p className="text-gray-600 dark:text-gray-400">Cabina</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {cabinResources.find((resource) => resource.resourceId === editingAppointment.cabin)?.resourceTitle}
                  </p>
                </div>
              </div>

              {editingAppointment.sale?.status === 'COMPLETED' ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-200">
                  Cita cobrada en {editingAppointment.sale.saleNumber} por {paymentMethodLabel(editingAppointment.sale.paymentMethod)}.
                </div>
              ) : (
                <button onClick={() => goToCharge(editingAppointment)} className="btn btn-primary">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Cobrar ahora
                </button>
              )}

              <button
                onClick={() => handleDeleteAppointment(editingAppointment.id)}
                className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-900 text-sm"
              >
                Eliminar Cita
              </button>
            </div>
          )}

          <AppointmentForm
            appointment={editingAppointment?.id ? editingAppointment : undefined}
            onSuccess={handleFormSuccess}
            onCancel={handleCloseModal}
            preselectedDate={selectedDate}
            initialCabin={initialCabin}
          />
        </div>
      </Modal>
    </div>
  )
}
