import { prisma } from '../../db'
import { buildAppointmentsExportWorkbook } from '../../utils/appointment-spreadsheet'
import { buildInclusiveDateRange } from '../../utils/date-range'
import { AppointmentModuleError } from './errors'
import { appointmentInclude, buildAppointmentsWhere } from './shared'

export const listAppointments = async (query: {
  startDate?: unknown
  endDate?: unknown
  status?: unknown
  clientId?: unknown
  cabin?: unknown
}) => {
  const where = buildAppointmentsWhere(query)

  return prisma.appointment.findMany({
    where,
    include: appointmentInclude,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
  })
}

export const listAppointmentsByDate = async (date: string) => {
  const dateRange = buildInclusiveDateRange(date, date)

  return prisma.appointment.findMany({
    where: {
      date: dateRange
    },
    include: appointmentInclude,
    orderBy: [{ cabin: 'asc' }, { startTime: 'asc' }]
  })
}

export const exportAppointmentsBuffer = async (query: {
  startDate?: unknown
  endDate?: unknown
  status?: unknown
  clientId?: unknown
  cabin?: unknown
}) => {
  const appointments = await listAppointments(query)
  const workbook = buildAppointmentsExportWorkbook(appointments as any[])
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export const getAppointmentByIdOrThrow = async (id: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude
  })

  if (!appointment) {
    throw new AppointmentModuleError(404, 'Appointment not found')
  }

  return appointment
}
