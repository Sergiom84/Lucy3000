import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar as BigCalendar, View } from 'react-big-calendar'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { ChevronLeft, ChevronRight, CreditCard, UserX } from 'lucide-react'
import api from '../utils/api'
import {
  loadAppointmentLegendItems,
  loadAppointmentLegendCategories,
  preloadAppointmentFormCatalogs,
  type AppointmentLegendCatalogItem
} from '../utils/appointmentCatalogs'
import { getAppointmentColorTheme } from '../utils/appointmentColors'
import {
  BUSINESS_END_MINUTES,
  BUSINESS_START_MINUTES,
  getTimeInputValueFromDate
} from '../utils/appointmentTime'
import { exportAppointmentsWorkbook } from '../utils/exports'
import { useAuthStore } from '../stores/authStore'
import { paymentMethodLabel } from '../utils/tickets'
import toast from 'react-hot-toast'
import AgendaDayNotesPanel from '../components/AgendaDayNotesPanel'
import Modal from '../components/Modal'
import AppointmentLegendModal from '../components/AppointmentLegendModal'
import AppointmentForm from '../components/AppointmentForm'
import { getAppointmentDisplayName } from '../../shared/customerDisplay'
import { getAppointmentPrimaryService, getAppointmentServiceLabel } from '../utils/appointmentServices'
import {
  calendarCulture,
  calendarFormats,
  calendarLocalizer,
  calendarMessages,
  calendarWeekDays,
  endOfCalendarWeek,
  formatCalendarText,
  startOfCalendarWeek
} from '../utils/calendarLocale'

const ImportAppointmentsModal = lazy(() => import('../components/ImportAppointmentsModal'))
const AgendaBlockForm = lazy(() => import('../components/AgendaBlockForm'))

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

const formatProfessionalLabel = (professional: string | null | undefined) =>
  professionalLabels[String(professional || '')] || String(professional || '')

const getSelectionTimeValue = (value: Date) => {
  return getTimeInputValueFromDate(value)
}

function CalendarEvent({ event }: { event: any }) {
  if (event.kind === 'agenda-block') {
    const agendaBlock = event.agendaBlock
    const timeRange = `${agendaBlock.startTime} - ${agendaBlock.endTime}`
    const tooltip = [
      'Bloqueo de agenda',
      `Profesional: ${formatProfessionalLabel(agendaBlock.professional)}`,
      timeRange,
      `Cabina: ${cabinLabels[agendaBlock.cabin] || agendaBlock.cabin}`,
      agendaBlock.notes ? `Observaciones: ${agendaBlock.notes}` : null
    ]
      .filter(Boolean)
      .join('\n')

    return (
      <div className="leading-tight overflow-hidden" title={tooltip}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] truncate">Bloqueo</p>
        <p className="text-[11px] truncate">{formatProfessionalLabel(agendaBlock.professional)}</p>
        <p className="text-[10px] opacity-80">{timeRange}</p>
      </div>
    )
  }

  const { appointment } = event
  const clientName = getAppointmentDisplayName(appointment)
  const serviceName = getAppointmentServiceLabel(appointment) || appointment.service?.name || ''
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
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<any[]>([])
  const [agendaBlocks, setAgendaBlocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [legendLoading, setLegendLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showLegendModal, setShowLegendModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<any>(null)
  const [editingAgendaBlock, setEditingAgendaBlock] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [preselectedStartTime, setPreselectedStartTime] = useState<string | undefined>()
  const [preselectedEndTime, setPreselectedEndTime] = useState<string | undefined>()
  const [initialCabin, setInitialCabin] = useState<'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'>('LUCY')
  const [view, setView] = useState<View>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [legendItems, setLegendItems] = useState<AppointmentLegendCatalogItem[]>([])
  const [legendCategories, setLegendCategories] = useState<string[]>([])
  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    fetchAppointments()
  }, [currentDate, view])

  useEffect(() => {
    void preloadAppointmentFormCatalogs()
    void fetchAppointmentLegends()
    void fetchAppointmentLegendCategories()
  }, [])

  const fetchAppointments = async () => {
    try {
      let startDate
      let endDate

      if (view === 'month') {
        startDate = moment(currentDate).startOf('month').subtract(7, 'days').toDate()
        endDate = moment(currentDate).endOf('month').add(7, 'days').toDate()
      } else if (view === 'week') {
        startDate = startOfCalendarWeek(currentDate)
        endDate = endOfCalendarWeek(currentDate)
      } else {
        startDate = moment(currentDate).startOf('day').toDate()
        endDate = moment(currentDate).endOf('day').toDate()
      }

      const params = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }

      const [appointmentsResponse, agendaBlocksResponse] = await Promise.all([
        api.get('/appointments', { params }),
        api.get('/appointments/blocks', { params })
      ])

      setAppointments(Array.isArray(appointmentsResponse.data) ? appointmentsResponse.data : [])
      setAgendaBlocks(Array.isArray(agendaBlocksResponse.data) ? agendaBlocksResponse.data : [])
    } catch (error) {
      console.error('Error fetching appointments:', error)
      toast.error('Error al cargar la agenda')
    } finally {
      setLoading(false)
    }
  }

  const fetchAppointmentLegends = async () => {
    try {
      setLegendLoading(true)
      const nextLegendItems = await loadAppointmentLegendItems()
      setLegendItems(nextLegendItems)
    } catch (error) {
      console.error('Error fetching appointment legends:', error)
      toast.error('No se pudo cargar la leyenda de citas')
    } finally {
      setLegendLoading(false)
    }
  }

  const fetchAppointmentLegendCategories = async () => {
    try {
      const nextLegendCategories = await loadAppointmentLegendCategories()
      setLegendCategories(nextLegendCategories)
    } catch (error) {
      console.error('Error fetching appointment legend categories:', error)
      toast.error('No se pudieron cargar las categorías de tratamientos')
    }
  }

  const handleSelectSlot = ({
    start,
    end,
    resourceId,
    action
  }: {
    start: Date
    end: Date
    resourceId?: string | number
    action: 'select' | 'click' | 'doubleClick'
  }) => {
    setSelectedDate(start)
    const selectedCabin = String(resourceId || 'LUCY') as typeof initialCabin
    setInitialCabin(selectedCabin)
    setEditingAppointment(null)
    setEditingAgendaBlock(null)

    const slotMinutes = start.getHours() * 60 + start.getMinutes()
    const nextStartTime =
      slotMinutes >= BUSINESS_START_MINUTES && slotMinutes < BUSINESS_END_MINUTES
        ? getSelectionTimeValue(start)
        : undefined

    setPreselectedStartTime(nextStartTime)
    setPreselectedEndTime(nextStartTime ? getSelectionTimeValue(end) : undefined)

    const shouldOpenBlockModal = action === 'select' && (view === 'day' || view === 'week')

    if (shouldOpenBlockModal) {
      setShowModal(false)
      setShowBlockModal(true)
      return
    }

    setShowBlockModal(false)
    setShowModal(true)
  }

  const handleSelectEvent = (event: any) => {
    setSelectedDate(undefined)
    setPreselectedStartTime(undefined)
    setPreselectedEndTime(undefined)

    if (event.kind === 'agenda-block') {
      setEditingAppointment(null)
      setEditingAgendaBlock(event.agendaBlock)
      setInitialCabin(event.agendaBlock.cabin || 'LUCY')
      setShowModal(false)
      setShowBlockModal(true)
      return
    }

    setEditingAgendaBlock(null)
    setEditingAppointment(event.appointment)
    setInitialCabin(event.appointment.cabin || 'LUCY')
    setShowBlockModal(false)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingAppointment(null)
    setSelectedDate(undefined)
    setPreselectedStartTime(undefined)
    setPreselectedEndTime(undefined)
    setInitialCabin('LUCY')
  }

  const handleCloseBlockModal = () => {
    setShowBlockModal(false)
    setEditingAgendaBlock(null)
    setSelectedDate(undefined)
    setPreselectedStartTime(undefined)
    setPreselectedEndTime(undefined)
    setInitialCabin('LUCY')
  }

  const handleFormSuccess = () => {
    handleCloseModal()
    fetchAppointments()
  }

  const handleAgendaBlockSuccess = () => {
    handleCloseBlockModal()
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

  const handleExportAppointments = async () => {
    try {
      if (appointments.length === 0) {
        toast.error('No hay citas para exportar en el rango actual')
        return
      }

      await exportAppointmentsWorkbook(appointments)
      toast.success('Citas exportadas a Excel')
    } catch (error) {
      console.error('Appointments export error:', error)
      toast.error('No se pudo exportar el listado de citas')
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
    () => [
      ...appointments.map((appointment) => {
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
          kind: 'appointment',
          resourceId: appointment.cabin
        }
      }),
      ...agendaBlocks.map((agendaBlock) => {
        const blockDate = new Date(agendaBlock.date)
        const [startHours, startMinutes] = agendaBlock.startTime.split(':')
        const [endHours, endMinutes] = agendaBlock.endTime.split(':')

        const start = new Date(blockDate)
        start.setHours(parseInt(startHours, 10), parseInt(startMinutes, 10))

        const end = new Date(blockDate)
        end.setHours(parseInt(endHours, 10), parseInt(endMinutes, 10))

        return {
          title: `Bloqueo - ${formatProfessionalLabel(agendaBlock.professional)}`,
          start,
          end,
          agendaBlock,
          kind: 'agenda-block',
          resourceId: agendaBlock.cabin
        }
      })
    ],
    [agendaBlocks, appointments]
  )

  const getThemeForAppointment = (appointment: any) =>
    getAppointmentColorTheme(
      legendItems,
      getAppointmentPrimaryService(appointment)?.category || appointment.service?.category
    )

  const eventStyleGetter = (event: any) => {
    if (event.kind === 'agenda-block') {
      return {
        style: {
          backgroundColor: '#FDE68A',
          borderRadius: '8px',
          color: '#7C2D12',
          border: '1px dashed #D97706',
          boxShadow: 'none',
          opacity: 1,
          fontSize: '12px',
          padding: '4px 6px'
        }
      }
    }

    const theme = getThemeForAppointment(event.appointment)
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
  const monthGridDays = useMemo(() => {
    const monthStart = currentDateMoment.clone().startOf('month').startOf('isoWeek')
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
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Haz clic en un hueco para crear una cita o arrastra en el calendario para bloquear una franja.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setShowLegendModal(true)} className="btn btn-secondary">
            Añadir Leyenda
          </button>
          {isAdmin ? (
            <>
              <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
                Importar
              </button>
              <button onClick={() => void handleExportAppointments()} className="btn btn-secondary">
                Exportar
              </button>
            </>
          ) : null}
          <button
            onClick={() => {
              setEditingAppointment(null)
              setEditingAgendaBlock(null)
              setShowBlockModal(false)
              setInitialCabin('LUCY')
              setSelectedDate(new Date(currentDate))
              setPreselectedStartTime(undefined)
              setPreselectedEndTime(undefined)
              setShowModal(true)
            }}
            className="btn btn-primary"
          >
            Nueva Cita
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
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
          </div>

          {view === 'day' ? (
            <AgendaDayNotesPanel dayKey={currentDateMoment.format('YYYY-MM-DD')} />
          ) : null}
        </div>

        <div className="card flex h-full flex-col p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <button
              onClick={goToPreviousMonth}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              title="Mes anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <p className="text-xs font-semibold capitalize tracking-[0.08em] text-gray-700 dark:text-gray-200">
              {formatCalendarText(currentDate, 'MMMM YYYY')}
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
          {legendLoading ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">Cargando...</span>
          ) : legendItems.length === 0 ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">No hay leyendas configuradas</span>
          ) : (
            legendItems.map((item) => {
              const theme = getAppointmentColorTheme(legendItems, item.category)
              return (
                <span key={item.id} className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: theme.background }}
                  />
                  {item.category}
                </span>
              )
            })
          )}
        </div>
      </div>

      <div className="card" style={{ height: '760px' }}>
        <BigCalendar
          localizer={calendarLocalizer}
          culture={calendarCulture}
          formats={calendarFormats}
          events={events}
          startAccessor="start"
          endAccessor="end"
          resources={cabinResources}
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
          messages={calendarMessages}
          components={{ event: CalendarEvent }}
          views={['month', 'week', 'day', 'agenda']}
          view={view}
          onView={setView}
          date={currentDate}
          onNavigate={setCurrentDate}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          selectable="ignoreEvents"
          eventPropGetter={eventStyleGetter}
          style={{ height: '100%' }}
          step={15}
          timeslots={4}
          longPressThreshold={250}
          min={new Date(2024, 0, 1, 8, 0, 0)}
          max={new Date(2024, 0, 1, 21, 0, 0)}
        />
      </div>

      <Modal
        isOpen={showLegendModal}
        onClose={() => setShowLegendModal(false)}
        title="Añadir Leyenda"
        maxWidth="lg"
      >
        <AppointmentLegendModal
          isOpen={showLegendModal}
          legendItems={legendItems}
          availableCategories={legendCategories}
          onUpdated={setLegendItems}
        />
      </Modal>

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
                backgroundColor: getThemeForAppointment(editingAppointment).softBackground,
                border: `1px solid ${getThemeForAppointment(editingAppointment).border}`
              }}
            >
              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Profesional</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatProfessionalLabel(editingAppointment.professional) || 'Lucy'}
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
            preselectedStartTime={preselectedStartTime}
            preselectedEndTime={preselectedEndTime}
            initialCabin={initialCabin}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showBlockModal}
        onClose={handleCloseBlockModal}
        title={editingAgendaBlock?.id ? 'Editar Bloqueo' : 'Nuevo Bloqueo'}
        maxWidth="lg"
      >
        {showBlockModal ? (
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Cargando formulario...
              </div>
            }
          >
            <div className="space-y-4">
              <AgendaBlockForm
                agendaBlock={editingAgendaBlock?.id ? editingAgendaBlock : undefined}
                onSuccess={handleAgendaBlockSuccess}
                onCancel={handleCloseBlockModal}
                preselectedDate={selectedDate}
                preselectedStartTime={preselectedStartTime}
                preselectedEndTime={preselectedEndTime}
                initialCabin={initialCabin}
              />
            </div>
          </Suspense>
        ) : null}
      </Modal>

      {isAdmin ? (
        <Modal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="Importar Citas desde Excel"
          maxWidth="xl"
        >
          {showImportModal ? (
            <Suspense
              fallback={
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Cargando importación...
                </div>
              }
            >
              <ImportAppointmentsModal
                onSuccess={() => {
                  setShowImportModal(false)
                  void fetchAppointments()
                }}
                onCancel={() => setShowImportModal(false)}
              />
            </Suspense>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}
