import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AppointmentSyncInput, googleCalendarService } from '../services/googleCalendar.service'
import { logError, logWarn } from '../utils/logger'
import { validateAppointmentSlot } from '../utils/appointment-validation'
import { buildInclusiveDateRange } from '../utils/date-range'
import { getProfessionalCatalog, normalizeProfessionalName } from '../utils/professional-catalog'

const agendaBlockSelect = {
  id: true,
  professional: true,
  calendarInviteEmail: true,
  cabin: true,
  date: true,
  startTime: true,
  endTime: true,
  notes: true,
  googleCalendarEventId: true,
  googleCalendarSyncStatus: true,
  googleCalendarSyncError: true,
  googleCalendarSyncedAt: true,
  createdAt: true,
  updatedAt: true
}

const CABIN_LABELS: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

const toDate = (value: string | Date) => new Date(value)

const formatCabinLabel = (cabin: string) => CABIN_LABELS[cabin] || cabin

const normalizeNullableText = (value: unknown) => {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

const buildAgendaBlockPayload = (payload: Record<string, unknown>) => ({
  professional: normalizeProfessionalName(payload.professional),
  calendarInviteEmail: normalizeNullableText(payload.calendarInviteEmail),
  cabin: String(payload.cabin),
  date: toDate(String(payload.date)),
  startTime: String(payload.startTime),
  endTime: String(payload.endTime),
  notes: normalizeNullableText(payload.notes)
})

const buildAgendaBlockUpdatePayload = (payload: Record<string, unknown>) => {
  const data: Record<string, unknown> = {}

  if (payload.professional !== undefined) data.professional = normalizeProfessionalName(payload.professional)
  if (payload.calendarInviteEmail !== undefined) {
    data.calendarInviteEmail = normalizeNullableText(payload.calendarInviteEmail)
  }
  if (payload.cabin !== undefined) data.cabin = String(payload.cabin)
  if (payload.date !== undefined) data.date = toDate(String(payload.date))
  if (payload.startTime !== undefined) data.startTime = String(payload.startTime)
  if (payload.endTime !== undefined) data.endTime = String(payload.endTime)
  if (payload.notes !== undefined) data.notes = normalizeNullableText(payload.notes)

  return data
}

const buildAgendaBlockSyncInput = (agendaBlock: {
  id: string
  professional: string
  calendarInviteEmail?: string | null
  cabin: string
  date: Date | string
  startTime: string
  endTime: string
  notes?: string | null
  googleCalendarEventId?: string | null
}): AppointmentSyncInput => {
  const notesLine = agendaBlock.notes ? `\nObservaciones: ${agendaBlock.notes}` : ''

  return {
    appointmentId: agendaBlock.id,
    existingEventId: agendaBlock.googleCalendarEventId || null,
    title: `Bloqueo - ${agendaBlock.professional}`,
    description: `Bloqueo de agenda\nProfesional: ${agendaBlock.professional}\nCabina: ${formatCabinLabel(agendaBlock.cabin)}${notesLine}`,
    date: agendaBlock.date,
    startTime: agendaBlock.startTime,
    endTime: agendaBlock.endTime,
    clientName: agendaBlock.professional,
    clientEmail: agendaBlock.calendarInviteEmail || null,
    forceSendUpdates: Boolean(agendaBlock.calendarInviteEmail)
  }
}

const persistAgendaBlockCalendarSyncResult = async (
  agendaBlockId: string,
  syncResult: Awaited<ReturnType<typeof googleCalendarService.upsertAppointmentEvent>>
) => {
  return prisma.agendaBlock.update({
    where: { id: agendaBlockId },
    data: {
      googleCalendarEventId: syncResult.eventId,
      googleCalendarSyncStatus: syncResult.status,
      googleCalendarSyncError: syncResult.error,
      googleCalendarSyncedAt: syncResult.status === 'SYNCED' ? new Date() : null
    },
    select: agendaBlockSelect
  })
}

export const getAgendaBlockProfessionals = async (_req: Request, res: Response) => {
  try {
    const professionals = await getProfessionalCatalog()
    res.json(professionals)
  } catch (error) {
    logError('Get agenda block professionals error', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAgendaBlocks = async (req: Request, res: Response) => {
  try {
    const where: Prisma.AgendaBlockWhereInput = {}

    if (req.query.startDate && req.query.endDate) {
      where.date = buildInclusiveDateRange(
        String(req.query.startDate),
        String(req.query.endDate)
      )
    }

    if (req.query.cabin) {
      where.cabin = String(req.query.cabin)
    }

    const agendaBlocks = await prisma.agendaBlock.findMany({
      where,
      select: agendaBlockSelect,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    })

    res.json(agendaBlocks)
  } catch (error) {
    logError('Get agenda blocks error', error, { query: req.query })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAgendaBlockById = async (req: Request, res: Response) => {
  try {
    const agendaBlock = await prisma.agendaBlock.findUnique({
      where: { id: req.params.id },
      select: agendaBlockSelect
    })

    if (!agendaBlock) {
      return res.status(404).json({ error: 'Agenda block not found' })
    }

    res.json(agendaBlock)
  } catch (error) {
    logError('Get agenda block by id error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAgendaBlock = async (req: Request, res: Response) => {
  try {
    const data = buildAgendaBlockPayload(req.body)

    const validation = await validateAppointmentSlot(
      {
        date: data.date as Date,
        startTime: String(data.startTime),
        endTime: String(data.endTime),
        professional: String(data.professional),
        cabin: String(data.cabin)
      },
      prisma
    )

    if (validation.errors.length > 0) {
      const statusCode = validation.errors[0].code.includes('CONFLICT') ? 409 : 400
      return res.status(statusCode).json({
        error: validation.errors[0].message,
        code: validation.errors[0].code,
        allErrors: validation.errors,
        warnings: validation.warnings
      })
    }

    const createdAgendaBlock = await prisma.agendaBlock.create({
      data,
      select: agendaBlockSelect
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(
      buildAgendaBlockSyncInput(createdAgendaBlock)
    )
    const agendaBlock = await persistAgendaBlockCalendarSyncResult(createdAgendaBlock.id, syncResult)

    if (syncResult.status === 'ERROR') {
      logWarn('Agenda block created but Google Calendar sync failed', {
        agendaBlockId: createdAgendaBlock.id,
        syncError: syncResult.error,
        professional: createdAgendaBlock.professional,
        cabin: createdAgendaBlock.cabin,
        date: createdAgendaBlock.date,
        startTime: createdAgendaBlock.startTime,
        endTime: createdAgendaBlock.endTime
      })
    }

    res.status(201).json(agendaBlock)
  } catch (error) {
    logError('Create agenda block error', error, { body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAgendaBlock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const existingAgendaBlock = await prisma.agendaBlock.findUnique({
      where: { id },
      select: agendaBlockSelect
    })

    if (!existingAgendaBlock) {
      return res.status(404).json({ error: 'Agenda block not found' })
    }

    const updateData = buildAgendaBlockUpdatePayload(req.body)
    const schedulingFieldChanged =
      updateData.date !== undefined ||
      updateData.startTime !== undefined ||
      updateData.endTime !== undefined ||
      updateData.professional !== undefined ||
      updateData.cabin !== undefined

    if (schedulingFieldChanged) {
      const validation = await validateAppointmentSlot(
        {
          date: (updateData.date as Date) || existingAgendaBlock.date,
          startTime: (updateData.startTime as string) || existingAgendaBlock.startTime,
          endTime: (updateData.endTime as string) || existingAgendaBlock.endTime,
          professional: (updateData.professional as string) || existingAgendaBlock.professional,
          cabin: (updateData.cabin as string) || existingAgendaBlock.cabin,
          excludeAgendaBlockId: id
        },
        prisma
      )

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

    const updatedAgendaBlock = await prisma.agendaBlock.update({
      where: { id },
      data: updateData,
      select: agendaBlockSelect
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(
      buildAgendaBlockSyncInput(updatedAgendaBlock)
    )
    const agendaBlock = await persistAgendaBlockCalendarSyncResult(updatedAgendaBlock.id, syncResult)

    if (syncResult.status === 'ERROR') {
      logWarn('Agenda block updated but Google Calendar sync failed', {
        agendaBlockId: updatedAgendaBlock.id,
        syncError: syncResult.error,
        professional: updatedAgendaBlock.professional,
        cabin: updatedAgendaBlock.cabin,
        date: updatedAgendaBlock.date,
        startTime: updatedAgendaBlock.startTime,
        endTime: updatedAgendaBlock.endTime
      })
    }

    res.json(agendaBlock)
  } catch (error) {
    logError('Update agenda block error', error, { params: req.params, body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteAgendaBlock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const agendaBlock = await prisma.agendaBlock.findUnique({
      where: { id },
      select: agendaBlockSelect
    })

    if (!agendaBlock) {
      return res.status(404).json({ error: 'Agenda block not found' })
    }

    const deleteSyncResult = await googleCalendarService.deleteAppointmentEvent(
      agendaBlock.googleCalendarEventId,
      agendaBlock.calendarInviteEmail || null,
      Boolean(agendaBlock.calendarInviteEmail)
    )

    if (deleteSyncResult.error) {
      logWarn('Google Calendar event deletion failed while deleting agenda block', {
        agendaBlockId: agendaBlock.id,
        syncError: deleteSyncResult.error
      })
    }

    await prisma.agendaBlock.delete({
      where: { id }
    })

    res.json({ message: 'Agenda block deleted successfully' })
  } catch (error) {
    logError('Delete agenda block error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}
