import { useEffect, useMemo, useState, useCallback } from 'react'
import { Calendar as BigCalendar, momentLocalizer, View } from 'react-big-calendar'
import moment from 'moment'
import 'moment/locale/es'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import {
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Clock,
  AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import Modal from './Modal'
import AppointmentForm from './AppointmentForm'

moment.locale('es')

const localizer = momentLocalizer(moment)

const messages = {
  allDay: 'Todo el dia',
  previous: 'Anterior',
  next: 'Siguiente',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Dia',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Cita',
  noEventsInRange: 'No hay citas en este rango',
  showMore: (total: number) => `+${total}`
}

const statusColors: Record<string, string> = {
  SCHEDULED: '#64748b',
  CONFIRMED: '#2563eb',
  IN_PROGRESS: '#f59e0b',
  COMPLETED: '#10b981',
  CANCELLED: '#ef4444',
  NO_SHOW: '#b91c1c'
}

const statusLabels: Record<string, string> = {
  SCHEDULED: 'Programada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistio'
}

const cabinResources = [
  { resourceId: 'LUCY', resourceTitle: 'Lucy' },
  { resourceId: 'TAMARA', resourceTitle: 'Tamara' },
  { resourceId: 'CABINA_1', resourceTitle: 'Cabina 1' },
  { resourceId: 'CABINA_2', resourceTitle: 'Cabina 2' }
]

interface ClientCalendarDockProps {
  onClose: () => void
  selectedClientId?: string | null
}

function AppointmentEvent({ event }: { event: any }) {
  const isHighlighted = event.isHighlighted
  const durationMinutes = event.durationMinutes ?? 0
  const isTiny = durationMinutes <= 30
  const isCompact = durationMinutes > 30 && durationMinutes <= 60
  const clientName = `${event.appointment.client.firstName} ${event.appointment.client.lastName}`
  const serviceName = event.appointment.service.name
  const timeRange = `${event.appointment.startTime} - ${event.appointment.endTime}`

  return (
    <div
      title={`${clientName} • ${serviceName} • ${timeRange}`}
      className={`h-full overflow-hidden leading-[1.15] transition-all duration-200 ${
        isHighlighted ? 'ring-2 ring-cyan-400 ring-offset-1' : ''
      }`}
    >
      {isTiny ? (
        <p className="truncate pt-0.5 text-[10px] font-semibold">{`${clientName} • ${serviceName}`}</p>
      ) : isCompact ? (
        <>
          <p className="truncate text-[10px] font-semibold">{clientName}</p>
          <p className="truncate text-[9px] opacity-90">{serviceName}</p>
        </>
      ) : (
        <>
          <p className="truncate text-[11px] font-semibold">{clientName}</p>
          <p className="truncate text-[10px] opacity-90">{serviceName}</p>
          <p className="truncate text-[9px] opacity-75">{timeRange}</p>
        </>
      )}
    </div>
  )
}

export default function ClientCalendarDock({
  onClose,
  selectedClientId = null
}: ClientCalendarDockProps) {
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<View>('day')
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [initialCabin, setInitialCabin] = useState<'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'>('LUCY')

  useEffect(() => {
    fetchAppointments()
  }, [currentDate, view])

  useEffect(() => {
    const resizeTimeout = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 320)

    return () => window.clearTimeout(resizeTimeout)
  }, [])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      let startDate
      let endDate

      if (view === 'week') {
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
      console.error('Error fetching integrated calendar appointments:', error)
      toast.error('No se pudo cargar la agenda integrada')
    } finally {
      setLoading(false)
    }
  }

  const events = useMemo(
    () =>
      appointments.map((appointment) => {
        const appointmentDate = new Date(appointment.date)
        const [startHours, startMinutes] = appointment.startTime.split(':')
        const [endHours, endMinutes] = appointment.endTime.split(':')

        const start = new Date(appointmentDate)
        start.setHours(parseInt(startHours, 10), parseInt(startMinutes, 10), 0, 0)

        const end = new Date(appointmentDate)
        end.setHours(parseInt(endHours, 10), parseInt(endMinutes, 10), 0, 0)

        return {
          title: `${appointment.client.firstName} ${appointment.client.lastName}`,
          start,
          end,
          resourceId: appointment.cabin,
          appointment,
          durationMinutes: (end.getTime() - start.getTime()) / 60000,
          isHighlighted: selectedClientId === appointment.clientId
        }
      }),
    [appointments, selectedClientId]
  )

  const pendingPayment = useMemo(
    () =>
      appointments.filter((apt) => !apt.sale || apt.sale.status !== 'COMPLETED').length,
    [appointments]
  )

  const currentDateMoment = useMemo(() => moment(currentDate), [currentDate])
  const calendarWeekDays = useMemo(
    () => moment.weekdaysMin(true).map((day) => day.replace('.', '')),
    []
  )
  const monthGridDays = useMemo(() => {
    const monthStart = currentDateMoment.clone().startOf('month').startOf('week')
    return Array.from({ length: 42 }, (_, index) => monthStart.clone().add(index, 'days'))
  }, [currentDateMoment])

  const eventStyleGetter = useCallback(
    (event: any) => {
      const backgroundColor = statusColors[event.appointment.status] || '#64748b'
      const isHighlighted = event.isHighlighted
      const durationMinutes = event.durationMinutes ?? 0
      const isTiny = durationMinutes <= 30
      const isCompact = durationMinutes > 30 && durationMinutes <= 60

      return {
        style: {
          backgroundColor,
          borderRadius: isHighlighted ? '12px' : '10px',
          color: '#fff',
          border: isHighlighted ? '2px solid #22d3ee' : '0',
          boxShadow: isHighlighted
            ? '0 0 12px rgba(34, 211, 238, 0.5)'
            : '0 10px 24px rgba(15, 23, 42, 0.16)',
          padding: isTiny ? '1px 6px' : isCompact ? '2px 6px' : '4px 6px',
          transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
          transition: 'all 0.2s ease',
          overflow: 'hidden'
        }
      }
    },
    []
  )

  const handleSelectSlot = ({ start, resourceId }: { start: Date; resourceId?: string | number }) => {
    setSelectedDate(start)
    const selectedCabin = String(resourceId || 'LUCY') as typeof initialCabin
    setInitialCabin(selectedCabin)
    setEditingAppointment(null)
    setShowAppointmentModal(true)
  }

  const handleSelectEvent = (event: any) => {
    setEditingAppointment(event.appointment)
    setInitialCabin(event.appointment.cabin || 'LUCY')
    setSelectedDate(undefined)
    setShowAppointmentModal(true)
  }

  const handleCloseAppointmentModal = () => {
    setShowAppointmentModal(false)
    setEditingAppointment(null)
    setSelectedDate(undefined)
    setInitialCabin('LUCY')
  }

  const handleAppointmentSuccess = () => {
    handleCloseAppointmentModal()
    fetchAppointments()
  }

  const handleDeleteAppointment = async (id: string) => {
    if (!confirm('Estas seguro de eliminar esta cita?')) return

    try {
      await api.delete(`/appointments/${id}`)
      toast.success('Cita eliminada')
      fetchAppointments()
      handleCloseAppointmentModal()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al eliminar cita')
    }
  }

  const goToPreviousMonth = () => {
    setCurrentDate((value) => moment(value).subtract(1, 'month').toDate())
  }

  const goToNextMonth = () => {
    setCurrentDate((value) => moment(value).add(1, 'month').toDate())
  }

  const selectMiniCalendarDay = (dateValue: moment.Moment) => {
    setCurrentDate(dateValue.toDate())
  }

  return (
    <aside className="min-w-0 xl:sticky xl:top-6 xl:h-[calc(100vh-8rem)]">
      <div className="flex h-full min-h-[38rem] flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900 text-slate-50 shadow-[0_30px_70px_rgba(15,23,42,0.28)]">
        {/* Header */}
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_42%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(30,41,59,0.92))] px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Calendario de Citas</h2>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              title="Ocultar calendario"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Estadisticas */}
          <div className="mt-3 grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem]">
            <div className="self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-400" />
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Citas</p>
              </div>
              <p className="mt-0.5 text-2xl font-semibold text-white">{appointments.length}</p>
            </div>
            <div className="self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400" />
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Pendientes</p>
              </div>
              <p className="mt-0.5 text-2xl font-semibold text-white">{pendingPayment}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2 md:col-span-2 xl:col-span-1 xl:row-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <button
                  onClick={goToPreviousMonth}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
                  title="Mes anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <p className="text-[10px] font-semibold capitalize tracking-[0.08em] text-slate-200">
                  {currentDateMoment.format('MMMM YYYY')}
                </p>
                <button
                  onClick={goToNextMonth}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
                  title="Mes siguiente"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {calendarWeekDays.map((weekday) => (
                  <span
                    key={weekday}
                    className="text-[9px] font-medium uppercase tracking-[0.08em] text-slate-500"
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
                          ? 'bg-cyan-500 text-white'
                          : isToday
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : isCurrentMonth
                              ? 'text-slate-200 hover:bg-white/10'
                              : 'text-slate-500 hover:bg-white/5'
                      }`}
                    >
                      {day.date()}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="md:col-span-2 xl:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    onClick={() => setView('day')}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      view === 'day'
                        ? 'bg-cyan-500 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Dia
                  </button>
                  <button
                    onClick={() => setView('week')}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      view === 'week'
                        ? 'bg-cyan-500 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Semana
                  </button>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                  <button
                    onClick={() =>
                      setCurrentDate((current) =>
                        moment(current).subtract(view === 'week' ? 7 : 1, 'days').toDate()
                      )
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-200 transition hover:bg-white/10"
                    title="Anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-[10rem] text-center text-sm font-medium text-white">
                    {view === 'week'
                      ? `${moment(currentDate).startOf('week').format('D MMM')} - ${moment(currentDate).endOf('week').format('D MMM')}`
                      : moment(currentDate).format('dddd D [de] MMMM')}
                  </div>
                  <button
                    onClick={() =>
                      setCurrentDate((current) =>
                        moment(current).add(view === 'week' ? 7 : 1, 'days').toDate()
                      )
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-200 transition hover:bg-white/10"
                    title="Siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    setSelectedDate(new Date())
                    setInitialCabin('LUCY')
                    setEditingAppointment(null)
                    setShowAppointmentModal(true)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/30"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Calendario */}
        <div className="flex-1 min-h-0 bg-slate-950/80 p-4">
          <div className="h-full overflow-x-auto overflow-y-hidden rounded-[1.5rem] border border-slate-200/80 bg-white text-slate-900 shadow-inner">
            <div className="h-full min-w-[44rem]">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <BigCalendar
                  className="client-calendar-dock-calendar"
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  resources={view === 'day' ? cabinResources : undefined}
                  resourceIdAccessor="resourceId"
                  resourceTitleAccessor="resourceTitle"
                  messages={messages}
                  components={{ event: AppointmentEvent }}
                  toolbar={false}
                  views={['day', 'week']}
                  view={view}
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
                  dayLayoutAlgorithm="no-overlap"
                />
              )}
            </div>
          </div>
        </div>

        {/* Leyenda de estados */}
        <div className="border-t border-white/10 bg-slate-900/50 px-5 py-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Estados</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusColors).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] text-slate-400">{statusLabels[status]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal de Cita */}
      <Modal
        isOpen={showAppointmentModal}
        onClose={handleCloseAppointmentModal}
        title={editingAppointment?.id ? 'Editar Cita' : 'Nueva Cita'}
        maxWidth="xl"
      >
        <div className="space-y-4">
          {editingAppointment?.id && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-4">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: statusColors[editingAppointment.status] || '#64748b' }}
                >
                  {editingAppointment.client.firstName?.[0]}
                  {editingAppointment.client.lastName?.[0]}
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {editingAppointment.client.firstName} {editingAppointment.client.lastName}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {editingAppointment.service.name} - {cabinResources.find(r => r.resourceId === editingAppointment.cabin)?.resourceTitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDeleteAppointment(editingAppointment.id)}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:hover:bg-red-900"
              >
                Eliminar
              </button>
            </div>
          )}

          <AppointmentForm
            appointment={editingAppointment?.id ? editingAppointment : undefined}
            onSuccess={handleAppointmentSuccess}
            onCancel={handleCloseAppointmentModal}
            preselectedDate={selectedDate}
            initialCabin={initialCabin}
          />
        </div>
      </Modal>
    </aside>
  )
}
