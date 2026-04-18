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
import { getAppointmentColorTheme } from '../utils/appointmentColors'
import {
  loadAppointmentLegendItems,
  type AppointmentLegendCatalogItem
} from '../utils/appointmentCatalogs'
import {
  BUSINESS_END_MINUTES,
  BUSINESS_START_MINUTES,
  getTimeInputValueFromDate
} from '../utils/appointmentTime'
import Modal from './Modal'
import AppointmentForm from './AppointmentForm'
import { getAppointmentDisplayName, getNameInitials } from '../../shared/customerDisplay'

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

interface ClientCalendarDockProps {
  onClose: () => void
  selectedClientId?: string | null
}

function AppointmentEvent({ event }: { event: any }) {
  const isHighlighted = event.isHighlighted
  const durationMinutes = event.durationMinutes ?? 0
  const isTiny = durationMinutes <= 30
  const isCompact = durationMinutes > 30 && durationMinutes <= 60
  const clientName = getAppointmentDisplayName(event.appointment)
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
  const [legendItems, setLegendItems] = useState<AppointmentLegendCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<View>('day')
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [preselectedStartTime, setPreselectedStartTime] = useState<string | undefined>()
  const [initialCabin, setInitialCabin] = useState<'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'>('LUCY')

  useEffect(() => {
    fetchAppointments()
  }, [currentDate, view])

  useEffect(() => {
    void fetchAppointmentLegends()
  }, [])

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

  const fetchAppointmentLegends = async () => {
    try {
      const nextLegendItems = await loadAppointmentLegendItems()
      setLegendItems(nextLegendItems)
    } catch (error) {
      console.error('Error fetching integrated calendar legends:', error)
      toast.error('No se pudo cargar la leyenda de citas')
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
          title: getAppointmentDisplayName(appointment),
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

  const getThemeForAppointment = useCallback(
    (appointment: any) => getAppointmentColorTheme(legendItems, appointment.service?.category),
    [legendItems]
  )

  const eventStyleGetter = useCallback(
    (event: any) => {
      const theme = getThemeForAppointment(event.appointment)
      const isHighlighted = event.isHighlighted
      const durationMinutes = event.durationMinutes ?? 0
      const isTiny = durationMinutes <= 30
      const isCompact = durationMinutes > 30 && durationMinutes <= 60
      const isInactive = INACTIVE_STATUSES.has(String(event.appointment.status || '').toUpperCase())

      return {
        style: {
          backgroundColor: theme.background,
          borderRadius: isHighlighted ? '12px' : '10px',
          color: theme.text,
          border: isHighlighted ? '2px solid #22d3ee' : '0',
          boxShadow: isHighlighted
            ? '0 0 12px rgba(34, 211, 238, 0.5)'
            : `inset 0 0 0 1px ${theme.border}33`,
          opacity: isInactive ? 0.74 : 1,
          padding: isTiny ? '1px 6px' : isCompact ? '2px 6px' : '4px 6px',
          transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
          transition: 'all 0.2s ease',
          overflow: 'hidden'
        }
      }
    },
    [getThemeForAppointment]
  )

  const handleSelectSlot = ({ start, resourceId }: { start: Date; resourceId?: string | number }) => {
    setSelectedDate(start)
    const slotMinutes = start.getHours() * 60 + start.getMinutes()
    setPreselectedStartTime(
      slotMinutes >= BUSINESS_START_MINUTES && slotMinutes < BUSINESS_END_MINUTES
        ? getTimeInputValueFromDate(start)
        : undefined
    )
    const selectedCabin = String(resourceId || 'LUCY') as typeof initialCabin
    setInitialCabin(selectedCabin)
    setEditingAppointment(null)
    setShowAppointmentModal(true)
  }

  const handleSelectEvent = (event: any) => {
    setEditingAppointment(event.appointment)
    setInitialCabin(event.appointment.cabin || 'LUCY')
    setSelectedDate(undefined)
    setPreselectedStartTime(undefined)
    setShowAppointmentModal(true)
  }

  const handleCloseAppointmentModal = () => {
    setShowAppointmentModal(false)
    setEditingAppointment(null)
    setSelectedDate(undefined)
    setPreselectedStartTime(undefined)
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
                    setSelectedDate(new Date(currentDate))
                    setPreselectedStartTime(undefined)
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

        {/* Leyenda de tratamientos */}
        <div className="border-t border-white/10 bg-slate-900/50 px-5 py-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Tratamientos</p>
          <div className="flex flex-wrap gap-2">
            {legendItems.length === 0 ? (
              <span className="text-[11px] text-slate-400">No hay leyendas configuradas.</span>
            ) : (
              legendItems.map((item) => {
                const theme = getAppointmentColorTheme(legendItems, item.category)
                return (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: theme.background }}
                    />
                    <span className="text-[11px] text-slate-400">{item.category}</span>
                  </div>
                )
              })
            )}
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
            <div
              className="flex items-center justify-between rounded-lg p-4"
              style={{
                backgroundColor: getThemeForAppointment(editingAppointment).softBackground,
                border: `1px solid ${getThemeForAppointment(editingAppointment).border}`
              }}
            >
              <div className="flex items-center gap-4">
                {(() => {
                  const appointmentName = getAppointmentDisplayName(editingAppointment)
                  const theme = getThemeForAppointment(editingAppointment)
                  return (
                    <>
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold"
                        style={{ backgroundColor: theme.background }}
                      >
                        {getNameInitials(appointmentName)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {appointmentName}
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-slate-500 dark:text-slate-400">Profesional</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {professionalLabels[editingAppointment.professional] || editingAppointment.professional || 'Lucy'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-400">Hora de inicio</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {editingAppointment.startTime}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )
                })()}
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
            preselectedStartTime={preselectedStartTime}
            initialCabin={initialCabin}
          />
        </div>
      </Modal>
    </aside>
  )
}
