import { AppointmentStatus, Cabin, Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AppointmentSyncInput, googleCalendarService } from '../services/googleCalendar.service'

const appointmentInclude = {
  client: true,
  user: {
    select: { id: true, name: true, email: true }
  },
  service: true,
  sale: {
    select: {
      id: true,
      saleNumber: true,
      total: true,
      paymentMethod: true,
      status: true,
      date: true
    }
  }
} satisfies Prisma.AppointmentInclude

const toDate = (value: string | Date) => new Date(value)

const buildAppointmentPayload = (payload: Record<string, unknown>): Prisma.AppointmentUncheckedCreateInput => ({
  clientId: String(payload.clientId),
  userId: String(payload.userId),
  serviceId: String(payload.serviceId),
  cabin: payload.cabin as Cabin,
  date: toDate(String(payload.date)),
  startTime: String(payload.startTime),
  endTime: String(payload.endTime),
  status: payload.status as AppointmentStatus,
  notes: payload.notes ? String(payload.notes) : null,
  reminder: payload.reminder === undefined ? true : Boolean(payload.reminder)
})

const buildAppointmentUpdatePayload = (payload: Record<string, unknown>): Prisma.AppointmentUncheckedUpdateInput => {
  const data: Prisma.AppointmentUncheckedUpdateInput = {}

  if (payload.clientId !== undefined) data.clientId = String(payload.clientId)
  if (payload.userId !== undefined) data.userId = String(payload.userId)
  if (payload.serviceId !== undefined) data.serviceId = String(payload.serviceId)
  if (payload.cabin !== undefined) data.cabin = payload.cabin as Cabin
  if (payload.date !== undefined) data.date = toDate(String(payload.date))
  if (payload.startTime !== undefined) data.startTime = String(payload.startTime)
  if (payload.endTime !== undefined) data.endTime = String(payload.endTime)
  if (payload.status !== undefined) data.status = payload.status as AppointmentStatus
  if (payload.notes !== undefined) data.notes = payload.notes ? String(payload.notes) : null
  if (payload.reminder !== undefined) data.reminder = Boolean(payload.reminder)

  return data
}

const buildCalendarSyncInput = (appointment: any): AppointmentSyncInput => {
  const clientName = `${appointment.client.firstName} ${appointment.client.lastName}`.trim()
  const phoneLine = appointment.client.phone ? `\nTelefono: ${appointment.client.phone}` : ''

  return {
    appointmentId: appointment.id,
    existingEventId: appointment.googleCalendarEventId || null,
    title: `${appointment.service.name} - ${clientName}`,
    description: `Cita para ${appointment.service.name}\nCliente: ${clientName}${phoneLine}`,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    clientEmail: appointment.client.email,
    clientName
  }
}

const persistCalendarSyncResult = async (appointmentId: string, syncResult: Awaited<ReturnType<typeof googleCalendarService.upsertAppointmentEvent>>) => {
  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      googleCalendarEventId: syncResult.eventId,
      googleCalendarSyncStatus: syncResult.status,
      googleCalendarSyncError: syncResult.error,
      googleCalendarSyncedAt: syncResult.status === 'SYNCED' ? new Date() : null
    },
    include: appointmentInclude
  })
}

export const getAppointments = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status, clientId, cabin } = req.query

    const where: Prisma.AppointmentWhereInput = {}

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      }
    }

    if (status) where.status = status as AppointmentStatus
    if (clientId) where.clientId = clientId as string
    if (cabin) where.cabin = cabin as Cabin

    const appointments = await prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    })

    res.json(appointments)
  } catch (error) {
    console.error('Get appointments error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentsByDate = async (req: Request, res: Response) => {
  try {
    const { date } = req.params
    const targetDate = new Date(`${date}T00:00:00.000Z`)

    const startOfDay = new Date(targetDate)
    startOfDay.setUTCHours(0, 0, 0, 0)

    const endOfDay = new Date(targetDate)
    endOfDay.setUTCHours(23, 59, 59, 999)

    const appointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: appointmentInclude,
      orderBy: [{ cabin: 'asc' }, { startTime: 'asc' }]
    })

    res.json(appointments)
  } catch (error) {
    console.error('Get appointments by date error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: appointmentInclude
    })

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    res.json(appointment)
  } catch (error) {
    console.error('Get appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAppointment = async (req: Request, res: Response) => {
  try {
    const data = buildAppointmentPayload(req.body)

    const createdAppointment = await prisma.appointment.create({
      data,
      include: appointmentInclude
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(createdAppointment))
    const appointment = await persistCalendarSyncResult(createdAppointment.id, syncResult)

    if (data.reminder) {
      await prisma.notification.create({
        data: {
          type: 'APPOINTMENT',
          title: 'Nueva cita programada',
          message: `Cita con ${appointment.client.firstName} ${appointment.client.lastName} el ${new Date(appointment.date).toLocaleDateString()}`,
          priority: 'NORMAL'
        }
      })
    }

    res.status(201).json(appointment)
  } catch (error) {
    console.error('Create appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const existing = await prisma.appointment.findUnique({ 
      where: { id }, 
      include: appointmentInclude 
    })

    if (!existing) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: buildAppointmentUpdatePayload(req.body),
      include: appointmentInclude
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(updatedAppointment))
    const appointment = await persistCalendarSyncResult(updatedAppointment.id, syncResult)

    res.json(appointment)
  } catch (error) {
    console.error('Update appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        sale: { select: { id: true, status: true } },
        client: true,
        service: true
      }
    })

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    if (appointment.sale?.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot delete an appointment with a completed sale linked' })
    }

    const deleteSyncResult = await googleCalendarService.deleteAppointmentEvent(
      appointment.googleCalendarEventId,
      appointment.client.email
    )

    if (deleteSyncResult.error) {
      console.error('Error eliminando evento de Google Calendar:', deleteSyncResult.error)
    }

    await prisma.appointment.delete({
      where: { id }
    })

    res.json({ message: 'Appointment deleted successfully' })
  } catch (error) {
    console.error('Delete appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
