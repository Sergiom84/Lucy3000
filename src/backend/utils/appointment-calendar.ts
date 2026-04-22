import { Prisma } from '@prisma/client'
import { AppointmentSyncInput } from '../services/googleCalendar.service'
import { getAppointmentServiceLabel } from './appointment-services'
import {
  getAppointmentDisplayEmail,
  getAppointmentDisplayName,
  getAppointmentDisplayPhone
} from './customer-display'

export const appointmentCalendarSyncInclude = {
  client: true,
  user: {
    select: { id: true, name: true, email: true }
  },
  service: true,
  appointmentServices: {
    include: {
      service: true
    },
    orderBy: {
      sortOrder: 'asc' as const
    }
  }
} satisfies Prisma.AppointmentInclude

export type AppointmentCalendarSyncRecord = Prisma.AppointmentGetPayload<{
  include: typeof appointmentCalendarSyncInclude
}>

const parseTimePart = (value: string, index: number) => {
  const part = Number.parseInt(String(value || '').split(':')[index] || '0', 10)
  return Number.isFinite(part) ? part : 0
}

export const getAppointmentStartsAt = (
  appointment: Pick<AppointmentCalendarSyncRecord, 'date' | 'startTime'>
) => {
  const at = new Date(appointment.date)
  at.setHours(parseTimePart(appointment.startTime, 0), parseTimePart(appointment.startTime, 1), 0, 0)
  return at
}

export const isUpcomingAppointment = (
  appointment: Pick<AppointmentCalendarSyncRecord, 'date' | 'startTime'>,
  now: Date = new Date()
) => getAppointmentStartsAt(appointment).getTime() >= now.getTime()

export const buildAppointmentCalendarSyncInput = (
  appointment: AppointmentCalendarSyncRecord
): AppointmentSyncInput => {
  const clientName = getAppointmentDisplayName(appointment)
  const phone = getAppointmentDisplayPhone(appointment)
  const phoneLine = phone ? `\nTelefono: ${phone}` : ''
  const serviceLabel = getAppointmentServiceLabel(appointment) || String(appointment.service?.name || '').trim()

  return {
    appointmentId: appointment.id,
    existingEventId: appointment.googleCalendarEventId || null,
    title: `${serviceLabel} - ${clientName}`,
    description: `Cita para ${serviceLabel}\nCliente: ${clientName}${phoneLine}`,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    clientEmail: getAppointmentDisplayEmail(appointment),
    clientName
  }
}
