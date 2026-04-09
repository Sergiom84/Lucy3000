import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar as BigCalendar, momentLocalizer, View } from 'react-big-calendar'
import moment from 'moment'
import 'moment/locale/es'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { ChevronLeft, ChevronRight, CreditCard, Plus, UserX } from 'lucide-react'
import api from '../utils/api'
import { getAppointmentColorTheme, TREATMENT_CATEGORY_LABELS } from '../utils/appointmentColors'
import { paymentMethodLabel } from '../utils/tickets'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import AppointmentForm from '../components/AppointmentForm'
import { getAppointmentDisplayName } from '../../shared/customerDisplay'

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

const cabinResources = [
  { resourceId: 'LUCY', resourceTitle: 'Lucy' },
  { resourceId: 'TAMARA', resourceTitle: 'Tamara' },
  { resourceId: 'CABINA_1', resourceTitle: 'Cabina 1' },
  { resourceId: 'CABINA_2', resourceTitle: 'Cabina 2' }
]

const professionalLabels: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CHEMA: 'Chema',
  OTROS: 'Otros'
}
const INACTIVE_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW'])

const cabinLabels: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

function AppointmentEvent({ event }: { event: any }) {
  const { appointment } = event
  const clientName = getAppointmentDisplayName(appointment)
  const serviceName = appointment.service?.name || ''
  const timeRange = `${appointment.startTime} - ${appointment.endTime}`
  const tooltip = `${clientName}\n${serviceName}\n${timeRange}\nCabina: ${cabinLabels[appointment.cabin] || appointment.cabin}`

  const startMinutes = (() => {
    const [h, m] = appointment.startTime.split(':').map(Number)
    return h * 60 + m
  })()
  const endMinutes = (() => {
    const [h, m] = appointment.endTime.split(':').map(Number)
    return h * 60 + m
  })()
  const duration = endMinutes - startMinutes

  if (duration <= 30) {
    return (
      <div className="leading-[1.15] overflow-hidden" title={tooltip}>
        <p className="text-[10px] font-semibold truncate">{clientName} &middot; {serviceName}</p>
      </div>
    )
  }

  if (duration <= 45) {
    return (
      <div className="leading-[1.15] overflow-hidden" title={tooltip}>
        <p className="text-[11px] font-semibold truncate">{clientName}</p>
        <p className="text-[10px] opacity-90 truncate">{serviceName}</p>
      </div>
    )
  }

  return (
    <div className="leading-tight overflow-hidden" title={tooltip}>
      <p className="font-semibold text-xs truncate">{clientName}</p>
      <p className="text-[11px] opacity-90 truncate">{serviceName}</p>
      <p className="text-[10px] opacity-80">{timeRange}</p>
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

  const handleMarkNoShow = async (id: string) => {
    if (!confirm('¿Marcar esta cita como "No acudio"?')) return

    try {
      await api.put(`/appointments/${id}`, { status: 'NO_SHOW' })
      toast.success('Cita marcada como no acudio')
      fetchAppointments()
      handleCloseModal()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al actualizar cita')
    }
  }

  const goToCharge = (appointment: any) => {
    const params = new URLSearchParams({
      serviceId: appointment.serviceId,
      appointmentId: appointment.id
    })
    if (appointment.clientId) {
      params.set('clientId', appointment.clientId)
    }
    navigate(`/sales?${params.toString()}`)
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
          title: getAppointmentDisplayName(appointment),
          start,
          end,
          appointment,
          resourceId: appointment.cabin
        }
      }),
    [appointments]
  )

  const eventStyleGetter = (event: any) => {
    const theme = getAppointmentColorTheme(
      event.appointment.service?.category,
      event.appointment.service?.name
    )
    const isInactive = INACTIVE_STATUSES.has(String(event.appointment.status || '').toUpperCase())

    return {
      style: {
        backgroundColor: theme.background,
        borderRadius: '8px',
        color: theme.text,
        border: '0px',
        boxShadow: `inset 0 0 0 1px ${theme.border}33`,
        opacity: isInactive ? 0.74 : 1,
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
            Vista diaria priorizada por cabinas. El color de cada cita se asigna segun el tratamiento.
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

      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Leyenda:</span>
          {TREATMENT_CATEGORY_LABELS.map(({ key, label }) => {
            const theme = getAppointmentColorTheme(label, null)
            return (
              <span key={key} className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: theme.background }}
                />
                {label}
              </span>
            )
          })}
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
            <div
              className="space-y-4 rounded-lg p-4"
              style={{
                backgroundColor: getAppointmentColorTheme(editingAppointment.service?.category, editingAppointment.service?.name).softBackground,
                border: `1px solid ${getAppointmentColorTheme(editingAppointment.service?.category, editingAppointment.service?.name).border}`
              }}
            >
              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Profesional</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {professionalLabels[editingAppointment.professional] || editingAppointment.professional || 'Lucy'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Cabina</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {cabinLabels[editingAppointment.cabin] || editingAppointment.cabin}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Fecha</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(editingAppointment.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Horario</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {editingAppointment.startTime} - {editingAppointment.endTime}
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

              <div className="flex gap-2">
                <button
                  onClick={() => handleMarkNoShow(editingAppointment.id)}
                  className="btn btn-secondary text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30 text-sm"
                >
                  <UserX className="w-4 h-4 mr-2" />
                  No acudio
                </button>
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
