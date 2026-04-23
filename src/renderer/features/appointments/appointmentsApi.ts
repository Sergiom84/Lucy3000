import moment from 'moment'
import type { View } from 'react-big-calendar'
import api from '../../utils/api'
import { endOfCalendarWeek, startOfCalendarWeek } from '../../utils/calendarLocale'

type AppointmentRangeParams = {
  currentDate: Date
  view: View
}

export const buildAppointmentsRangeParams = ({ currentDate, view }: AppointmentRangeParams) => {
  let startDate: Date
  let endDate: Date

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

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  }
}

export const fetchAppointmentsInRange = async ({ currentDate, view }: AppointmentRangeParams) => {
  const params = buildAppointmentsRangeParams({ currentDate, view })
  const [appointmentsResponse, agendaBlocksResponse] = await Promise.all([
    api.get('/appointments', { params }),
    api.get('/appointments/blocks', { params })
  ])

  return {
    appointments: Array.isArray(appointmentsResponse.data) ? appointmentsResponse.data : [],
    agendaBlocks: Array.isArray(agendaBlocksResponse.data) ? agendaBlocksResponse.data : []
  }
}

export const fetchClientBonos = async (clientId: string) => {
  const response = await api.get(`/bonos/client/${clientId}`)
  return Array.isArray(response.data) ? response.data : []
}

export const deleteAppointmentById = async (appointmentId: string) => {
  await api.delete(`/appointments/${appointmentId}`)
}

export const updateAppointmentStatus = async (appointmentId: string, status: string) => {
  await api.put(`/appointments/${appointmentId}`, { status })
}

export const chargeAppointmentWithBono = async (
  appointmentId: string,
  payload: {
    bonoPackId?: string
    sessionsToConsume: number
  }
) => {
  const response = await api.post(`/appointments/${appointmentId}/charge-bono`, payload)
  return response.data
}
