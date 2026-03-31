import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { AppointmentSyncInput, googleCalendarService } from '../services/googleCalendar.service'
import { logError, logWarn } from '../utils/logger'
import { validateAppointmentSlot } from '../utils/appointment-validation'

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
  cabin: payload.cabin as string,
  professional: (payload.professional as string) || 'LUCY',
  date: toDate(String(payload.date)),
  startTime: String(payload.startTime),
  endTime: String(payload.endTime),
  status: payload.status as string,
  notes: payload.notes ? String(payload.notes) : null,
  reminder: payload.reminder === undefined ? true : Boolean(payload.reminder)
})

const buildAppointmentUpdatePayload = (payload: Record<string, unknown>): Prisma.AppointmentUncheckedUpdateInput => {
  const data: Prisma.AppointmentUncheckedUpdateInput = {}

  if (payload.clientId !== undefined) data.clientId = String(payload.clientId)
  if (payload.userId !== undefined) data.userId = String(payload.userId)
  if (payload.serviceId !== undefined) data.serviceId = String(payload.serviceId)
  if (payload.cabin !== undefined) data.cabin = payload.cabin as string
  if (payload.professional !== undefined) data.professional = payload.professional as string
  if (payload.date !== undefined) data.date = toDate(String(payload.date))
  if (payload.startTime !== undefined) data.startTime = String(payload.startTime)
  if (payload.endTime !== undefined) data.endTime = String(payload.endTime)
  if (payload.status !== undefined) data.status = payload.status as string
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

const releaseReservedBonoSessions = async (appointmentId: string) => {
  await prisma.bonoSession.updateMany({
    where: {
      appointmentId,
      status: 'AVAILABLE'
    },
    data: {
      appointmentId: null
    }
  })
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

    if (status) where.status = status as string
    if (clientId) where.clientId = clientId as string
    if (cabin) where.cabin = cabin as string

    const appointments = await prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    })

    res.json(appointments)
  } catch (error) {
    logError('Get appointments error', error, { query: req.query })
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
    logError('Get appointments by date error', error, { params: req.params })
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
    logError('Get appointment error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const data = buildAppointmentPayload(req.body)

    const validation = await validateAppointmentSlot({
      date: data.date as Date,
      startTime: data.startTime as string,
      endTime: data.endTime as string,
      professional: (data.professional as string) || 'LUCY',
      cabin: data.cabin as string,
    }, prisma)

    if (validation.errors.length > 0) {
      const statusCode = validation.errors[0].code.includes('CONFLICT') ? 409 : 400
      return res.status(statusCode).json({
        error: validation.errors[0].message,
        code: validation.errors[0].code,
        allErrors: validation.errors,
        warnings: validation.warnings
      })
    }

    const createdAppointment = await prisma.appointment.create({
      data,
      include: appointmentInclude
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(createdAppointment))
    const appointment = await persistCalendarSyncResult(createdAppointment.id, syncResult)

    if (syncResult.status === 'ERROR') {
      logWarn('Appointment created but Google Calendar sync failed', {
        appointmentId: createdAppointment.id,
        syncError: syncResult.error,
        clientId: createdAppointment.clientId,
        serviceId: createdAppointment.serviceId,
        date: createdAppointment.date,
        startTime: createdAppointment.startTime,
        endTime: createdAppointment.endTime
      })
    }

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
    logError('Create appointment error', error, {
      userId: req.user?.id || null,
      body: req.body
    })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const existing = await prisma.appointment.findUnique({ 
      where: { id }, 
      include: appointmentInclude 
    })

    if (!existing) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    const updateData = buildAppointmentUpdatePayload(req.body)

    // Validate only if scheduling-relevant fields are changing
    const schedulingFieldChanged = updateData.date !== undefined || updateData.startTime !== undefined ||
      updateData.endTime !== undefined || updateData.professional !== undefined || updateData.cabin !== undefined

    if (schedulingFieldChanged) {
      const validation = await validateAppointmentSlot({
        date: (updateData.date as Date) || existing.date,
        startTime: (updateData.startTime as string) || existing.startTime,
        endTime: (updateData.endTime as string) || existing.endTime,
        professional: (updateData.professional as string) || existing.professional,
        cabin: (updateData.cabin as string) || existing.cabin,
        excludeAppointmentId: id,
      }, prisma)

      if (validation.errors.length > 0) {
        const statusCode = validation.errors[0].code.includes('CONFLICT') ? 409 : 400
        return res.status(statusCode).json({
          error: validation.errors[0].message,
          code: validation.errors[0].code,
          allErrors: validation.errors,
          warnings: validation.warnings
        })
      }
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: appointmentInclude
    })

    const movedToCancelled =
      updatedAppointment.status === 'CANCELLED' || updatedAppointment.status === 'NO_SHOW'

    if (movedToCancelled) {
      await releaseReservedBonoSessions(updatedAppointment.id)
    }

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(updatedAppointment))
    const appointment = await persistCalendarSyncResult(updatedAppointment.id, syncResult)

    if (syncResult.status === 'ERROR') {
      logWarn('Appointment updated but Google Calendar sync failed', {
        appointmentId: updatedAppointment.id,
        syncError: syncResult.error,
        clientId: updatedAppointment.clientId,
        serviceId: updatedAppointment.serviceId,
        date: updatedAppointment.date,
        startTime: updatedAppointment.startTime,
        endTime: updatedAppointment.endTime
      })
    }

    res.json(appointment)
  } catch (error) {
    logError('Update appointment error', error, {
      userId: req.user?.id || null,
      params: req.params,
      body: req.body
    })
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
      logWarn('Google Calendar event deletion failed while deleting appointment', {
        appointmentId: appointment.id,
        syncError: deleteSyncResult.error
      })
    }

    await prisma.appointment.delete({
      where: { id }
    })

    res.json({ message: 'Appointment deleted successfully' })
  } catch (error) {
    logError('Delete appointment error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}
