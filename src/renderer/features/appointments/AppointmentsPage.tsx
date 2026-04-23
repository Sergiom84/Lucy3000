import { Suspense, lazy, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar as BigCalendar, View } from 'react-big-calendar'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getAppointmentColorTheme } from '../../utils/appointmentColors'
import {
  hasConsumedAppointmentBono,
  hasNonChargeableAppointmentStatus,
  isAppointmentInactiveForCalendar,
  requiresAppointmentCharge
} from '../../utils/appointmentBilling'
import {
  BUSINESS_END_MINUTES,
  BUSINESS_START_MINUTES,
  getTimeInputValueFromDate
} from '../../utils/appointmentTime'
import { exportAppointmentsWorkbook } from '../../utils/exports'
import { useAuthStore } from '../../stores/authStore'
import { salePaymentMethodLabel } from '../../utils/tickets'
import toast from 'react-hot-toast'
import AgendaDayNotesPanel from '../../components/AgendaDayNotesPanel'
import ReminderModal from '../../components/ReminderModal'
import Modal from '../../components/Modal'
import AppointmentLegendModal from '../../components/AppointmentLegendModal'
import AppointmentForm from '../../components/AppointmentForm'
import { getAppointmentDisplayName } from '../../../shared/customerDisplay'
import { getAppointmentPrimaryService, getAppointmentServiceLabel } from '../../utils/appointmentServices'
import {
  calendarCulture,
  calendarFormats,
  calendarLocalizer,
  calendarMessages,
  calendarWeekDays,
  formatCalendarText
} from '../../utils/calendarLocale'
import {
  chargeAppointmentWithBono,
  deleteAppointmentById,
  updateAppointmentStatus
} from './appointmentsApi'
import { useAppointmentsPageData } from './useAppointmentsPageData'

const ImportAppointmentsModal = lazy(() => import('../../components/ImportAppointmentsModal'))
const AgendaBlockForm = lazy(() => import('../../components/AgendaBlockForm'))

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

const cabinLabels: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

const saleStatusLabels: Record<string, string> = {
  PENDING: 'pendiente',
  CANCELLED: 'cancelada',
  REFUNDED: 'devuelta',
  COMPLETED: 'completada'
}

const formatProfessionalLabel = (professional: string | null | undefined) =>
  professionalLabels[String(professional || '')] || String(professional || '')

const formatSaleStatusLabel = (status: string | null | undefined) =>
  saleStatusLabels[String(status || '').toUpperCase()] || 'registrada'

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
  const [showModal, setShowModal] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showLegendModal, setShowLegendModal] = useState(false)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<any>(null)
  const [editingAgendaBlock, setEditingAgendaBlock] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [preselectedStartTime, setPreselectedStartTime] = useState<string | undefined>()
  const [preselectedEndTime, setPreselectedEndTime] = useState<string | undefined>()
  const [initialCabin, setInitialCabin] = useState<'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'>('LUCY')
  const [view, setView] = useState<View>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showChargeBonoModal, setShowChargeBonoModal] = useState(false)
  const [bonoSessionsToConsume, setBonoSessionsToConsume] = useState(1)
  const [chargeBonoSubmitting, setChargeBonoSubmitting] = useState(false)
  const isAdmin = user?.role === 'ADMIN'
  const {
    agendaBlocks,
    appointmentBonoCandidates,
    appointmentBonosLoading,
    appointments,
    consumedAppointmentBono,
    legendCategories,
    legendItems,
    legendLoading,
    loading,
    refreshAppointments,
    selectedAppointmentBonoId,
    setLegendItems,
    setSelectedAppointmentBonoId
  } = useAppointmentsPageData({
    currentDate,
    editingAppointment,
    view
  })

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
    setShowChargeBonoModal(false)
    setBonoSessionsToConsume(1)
    setChargeBonoSubmitting(false)
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
    void refreshAppointments()
  }

  const handleAgendaBlockSuccess = () => {
    handleCloseBlockModal()
    void refreshAppointments()
  }

  const handleDeleteAppointment = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta cita?')) return

    try {
      await deleteAppointmentById(id)
      toast.success('Cita eliminada')
      await refreshAppointments()
      handleCloseModal()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al eliminar cita')
    }
  }

  const handleMarkNoShow = async (id: string) => {
    if (!confirm('¿Marcar esta cita como "No acudio"?')) return

    try {
      await updateAppointmentStatus(id, 'NO_SHOW')
      toast.success('Cita marcada como no acudio')
      await refreshAppointments()
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
    if (appointment.sale?.id) {
      navigate(
        appointment.sale.status === 'PENDING'
          ? `/sales?pendingSaleId=${appointment.sale.id}`
          : `/sales?view=history&openSaleId=${appointment.sale.id}`
      )
      setShowModal(false)
      return
    }

    const params = new URLSearchParams({
      serviceId: appointment.serviceId,
      appointmentId: appointment.id
    })
    if (appointment.clientId) {
      params.set('clientId', appointment.clientId)
    }
    navigate(`/sales?${params.toString()}`)
    setShowModal(false)
  }

  const handleChargeWithBono = async () => {
    if (!editingAppointment?.id) return

    const selectedBonoCandidate =
      appointmentBonoCandidates.find((bonoPack) => bonoPack.id === selectedAppointmentBonoId) ||
      (appointmentBonoCandidates.length === 1 ? appointmentBonoCandidates[0] : null)

    if (!selectedBonoCandidate) {
      toast.error('Selecciona un bono para esta cita')
      return
    }

    setSelectedAppointmentBonoId(selectedBonoCandidate.id)
    setBonoSessionsToConsume(1)
    setShowChargeBonoModal(true)
  }

  const handleConfirmChargeWithBono = async () => {
    if (!editingAppointment?.id) return

    const bonoPackId =
      selectedAppointmentBonoId ||
      (appointmentBonoCandidates.length === 1 ? appointmentBonoCandidates[0].id : '')

    const selectedBonoCandidate =
      appointmentBonoCandidates.find((bonoPack) => bonoPack.id === bonoPackId) ||
      (appointmentBonoCandidates.length === 1 ? appointmentBonoCandidates[0] : null)

    if (!selectedBonoCandidate) {
      toast.error('Selecciona un bono para esta cita')
      return
    }

    const sessionsToConsume = Math.max(1, Math.min(bonoSessionsToConsume, selectedBonoCandidate.chargeableSessions))

    try {
      setChargeBonoSubmitting(true)
      const response = await chargeAppointmentWithBono(editingAppointment.id, {
        bonoPackId: bonoPackId || undefined,
        sessionsToConsume
      })
      const chargedSessions =
        Number(response?.bonoChargeSummary?.sessionsConsumed) > 0
          ? Number(response?.bonoChargeSummary?.sessionsConsumed)
          : sessionsToConsume
      const chargedBonoName =
        response?.bonoChargeSummary?.bonoPackName ||
        response?.bonoSessions?.[0]?.bonoPack?.name ||
        appointmentBonoCandidates.find((bonoPack) => bonoPack.id === bonoPackId)?.name ||
        'el bono seleccionado'
      toast.success(
        chargedSessions === 1
          ? `Bono descontado: ${chargedBonoName}`
          : `${chargedSessions} sesiones descontadas de ${chargedBonoName}`
      )
      setShowChargeBonoModal(false)
      handleCloseModal()
      await refreshAppointments()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo descontar el bono')
    } finally {
      setChargeBonoSubmitting(false)
    }
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

  const selectedAppointmentBonoCandidate =
    appointmentBonoCandidates.find((bonoPack) => bonoPack.id === selectedAppointmentBonoId) ||
    (appointmentBonoCandidates.length === 1 ? appointmentBonoCandidates[0] : null)

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
    const isInactive = isAppointmentInactiveForCalendar(event.appointment)

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
    (appointment) => !isAppointmentInactiveForCalendar(appointment)
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

          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowReminderModal(true)}
              className="btn btn-secondary w-full"
            >
              Añadir recordatorio
            </button>
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
                  Cita cobrada en {editingAppointment.sale.saleNumber} por {salePaymentMethodLabel(editingAppointment.sale)}.
                </div>
              ) : editingAppointment.sale ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                    {editingAppointment.sale.status === 'PENDING'
                      ? `Esta cita ya tiene la venta ${editingAppointment.sale.saleNumber} pendiente. Continúa el cobro desde esa venta.`
                      : `Esta cita ya tiene la venta ${editingAppointment.sale.saleNumber} ${formatSaleStatusLabel(
                          editingAppointment.sale.status
                        )}. Revísala desde historial antes de crear otra.`}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => goToCharge(editingAppointment)} className="btn btn-primary">
                      {editingAppointment.sale.status === 'PENDING' ? 'Cobrar pendiente' : 'Ver venta'}
                    </button>
                  </div>
                </div>
              ) : consumedAppointmentBono || hasConsumedAppointmentBono(editingAppointment) ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-200">
                  Cita descontada con bono {consumedAppointmentBono?.name || editingAppointment.bonoSessions?.[0]?.bonoPack?.name}
                  {consumedAppointmentBono?.consumedCount
                    ? consumedAppointmentBono.consumedCount === 1
                      ? ` · sesión #${consumedAppointmentBono.sessionNumber}`
                      : ` · ${consumedAppointmentBono.consumedCount} sesiones`
                    : Array.isArray(editingAppointment.bonoSessions) && editingAppointment.bonoSessions.length > 0
                      ? editingAppointment.bonoSessions.length === 1
                        ? ` · sesión #${editingAppointment.bonoSessions[0]?.sessionNumber || ''}`
                        : ` · ${editingAppointment.bonoSessions.length} sesiones`
                      : ''}
                  .
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {requiresAppointmentCharge(editingAppointment) &&
                    !editingAppointment.sale &&
                    appointmentBonoCandidates.length > 0 ? (
                      <button onClick={() => void handleChargeWithBono()} className="btn btn-primary">
                        Descontar bono
                      </button>
                    ) : requiresAppointmentCharge(editingAppointment) ? (
                      <button onClick={() => goToCharge(editingAppointment)} className="btn btn-primary">
                        {editingAppointment.sale?.status === 'PENDING'
                          ? 'Continuar cobro'
                          : editingAppointment.sale
                            ? 'Ver venta'
                            : 'Cobrar'}
                      </button>
                    ) : null}
                    {!hasNonChargeableAppointmentStatus(editingAppointment) && (
                      <button
                        onClick={() => handleMarkNoShow(editingAppointment.id)}
                        className="btn btn-secondary text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30 text-sm"
                      >
                        No acudio
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteAppointment(editingAppointment.id)}
                      className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-900 text-sm"
                    >
                      Eliminar cita
                    </button>
                  </div>
                  {appointmentBonosLoading ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Buscando bonos compatibles...</p>
                  ) : appointmentBonoCandidates.length > 0 && !editingAppointment.sale ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
                      {appointmentBonoCandidates.length > 1 ? (
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                          <span className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                            Bono para esta cita
                          </span>
                          <select
                            value={selectedAppointmentBonoId}
                            onChange={(event) => setSelectedAppointmentBonoId(event.target.value)}
                            className="input h-10 min-w-0 border-blue-200 bg-white text-sm dark:border-blue-800 dark:bg-gray-900"
                          >
                            {appointmentBonoCandidates.map((bonoPack) => (
                              <option key={bonoPack.id} value={bonoPack.id}>
                                {bonoPack.name}
                                {bonoPack.serviceName ? ` · ${bonoPack.serviceName}` : ''}
                                {bonoPack.isReservedForAppointment && bonoPack.reservedSessionNumber
                                  ? ` · reservada sesión ${bonoPack.reservedSessionNumber}`
                                  : ''}
                                {bonoPack.chargeableSessions > 1 ? ` · ${bonoPack.chargeableSessions} disponibles` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p>
                          Se descontará {appointmentBonoCandidates[0].name}
                          {appointmentBonoCandidates[0].reservedSessionNumber
                            ? ` · sesión ${appointmentBonoCandidates[0].reservedSessionNumber}`
                            : ''}
                          {appointmentBonoCandidates[0].chargeableSessions > 1
                            ? ` · hasta ${appointmentBonoCandidates[0].chargeableSessions} sesiones`
                            : ''}
                          .
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
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
        isOpen={showChargeBonoModal}
        onClose={() => {
          if (chargeBonoSubmitting) return
          setShowChargeBonoModal(false)
          setBonoSessionsToConsume(1)
        }}
        title="Descontar bono"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
            {selectedAppointmentBonoCandidate ? (
              <>
                <p className="font-medium">{selectedAppointmentBonoCandidate.name}</p>
                <p className="mt-1">¿Cuántos bonos a descontar?</p>
                <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  Máximo disponible para esta cita: {selectedAppointmentBonoCandidate.chargeableSessions}
                </p>
              </>
            ) : (
              <p>No hay bono seleccionado para esta cita.</p>
            )}
          </div>

          <div>
            <label htmlFor="bonoSessionsToConsume" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sesiones a descontar
            </label>
            <input
              id="bonoSessionsToConsume"
              type="number"
              min={1}
              max={selectedAppointmentBonoCandidate?.chargeableSessions || 1}
              value={bonoSessionsToConsume}
              onChange={(event) => {
                const nextValue = Number.parseInt(event.target.value || '1', 10)
                const maxValue = selectedAppointmentBonoCandidate?.chargeableSessions || 1
                setBonoSessionsToConsume(Math.max(1, Math.min(Number.isFinite(nextValue) ? nextValue : 1, maxValue)))
              }}
              className="input mt-2"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowChargeBonoModal(false)
                setBonoSessionsToConsume(1)
              }}
              disabled={chargeBonoSubmitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleConfirmChargeWithBono()}
              disabled={!selectedAppointmentBonoCandidate || chargeBonoSubmitting}
            >
              {chargeBonoSubmitting ? 'Descontando...' : 'Descontar bono'}
            </button>
          </div>
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

      <ReminderModal
        isOpen={showReminderModal}
        onClose={() => setShowReminderModal(false)}
      />

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
                  void refreshAppointments()
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
