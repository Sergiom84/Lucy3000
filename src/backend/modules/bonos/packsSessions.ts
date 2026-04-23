import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../../db'
import {
  type AppointmentSyncInput,
  googleCalendarService
} from '../../services/googleCalendar.service'
import { validateAppointmentSlot } from '../../utils/appointment-validation'
import {
  getAppointmentDisplayEmail,
  getAppointmentDisplayName,
  getAppointmentDisplayPhone
} from '../../utils/customer-display'
import {
  calculateAppointmentEndTime,
  deriveAppointmentServiceIds,
  getAppointmentServiceLabel
} from '../../utils/appointment-services'
import { BonoOperationError, toBonoHttpError } from './errors'
import {
  normalizeBonoTemplateId,
  readBonoTemplates,
  resolveBonoTemplateForPack
} from './templateCatalog'

const isExpiredStatusDate = (expiryDate: Date | null) => {
  if (!expiryDate) return false

  const today = new Date()
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return expiryDate < normalizedToday
}

const resolveBonoPackStatus = (payload: {
  expiryDate: Date | null
  totalSessions: number
  consumedSessions: number
}) => {
  if (isExpiredStatusDate(payload.expiryDate)) {
    return 'EXPIRED' as const
  }

  return payload.totalSessions - payload.consumedSessions <= 0 ? ('DEPLETED' as const) : ('ACTIVE' as const)
}

const appointmentInclude = {
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
  },
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

type AppointmentRecord = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>

const buildAppointmentServicesCreateData = (serviceIds: string[]) =>
  serviceIds.map((serviceId, index) => ({
    serviceId,
    sortOrder: index
  }))

const sessionInclude = {
  orderBy: { sessionNumber: 'asc' as const },
  include: {
    appointment: {
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        cabin: true
      }
    }
  }
}

const toDate = (value: string | Date) => new Date(value)

const resolveProfessionalName = async (userId: unknown, professional: unknown) => {
  const normalizedProfessional = String(professional ?? '').trim()
  if (normalizedProfessional) {
    return normalizedProfessional
  }

  const normalizedUserId = String(userId ?? '').trim()
  if (!normalizedUserId) {
    return ''
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: { name: true }
  })

  return String(user?.name ?? '').trim()
}

const toAppointmentDateTime = (appointment: { date: Date; startTime: string }) => {
  const at = new Date(appointment.date)
  const [hours, minutes] = String(appointment.startTime || '00:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10))
  at.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return at
}

const buildCalendarSyncInput = (appointment: AppointmentRecord): AppointmentSyncInput => {
  const clientName = getAppointmentDisplayName(appointment, 'Cliente')
  const phone = getAppointmentDisplayPhone(appointment)
  const phoneLine = phone ? `\nTelefono: ${phone}` : ''
  const serviceLabel = getAppointmentServiceLabel(appointment) || appointment.service.name

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

const persistCalendarSyncResult = async (
  appointmentId: string,
  syncResult: Awaited<ReturnType<typeof googleCalendarService.upsertAppointmentEvent>>
) => {
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

export const getClientBonos = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params

    const bonoPacks = await prisma.bonoPack.findMany({
      where: { clientId },
      include: {
        service: { select: { id: true, name: true, category: true, serviceCode: true } },
        sessions: sessionInclude
      },
      orderBy: { purchaseDate: 'desc' }
    })

    res.json(bonoPacks)
  } catch (error) {
    console.error('Get client bonos error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoPack = async (req: Request, res: Response) => {
  try {
    const { clientId, name, serviceId, bonoTemplateId, totalSessions, price, expiryDate, notes } = req.body

    if (!clientId || !name || !totalSessions || totalSessions < 1) {
      return res.status(400).json({ error: 'clientId, name and totalSessions (>= 1) are required' })
    }

    const parsedTotalSessions = Number.parseInt(String(totalSessions), 10)
    if (!Number.isFinite(parsedTotalSessions) || parsedTotalSessions < 1) {
      return res.status(400).json({ error: 'totalSessions must be a positive integer' })
    }

    const parsedPrice = Number(price || 0)
    const templates = await readBonoTemplates()
    const matchedTemplate = resolveBonoTemplateForPack(templates, {
      bonoTemplateId: bonoTemplateId || null,
      serviceId: serviceId || null,
      name,
      totalSessions: parsedTotalSessions
    })
    const resolvedServiceId = matchedTemplate?.serviceId || normalizeBonoTemplateId(serviceId) || null

    if (resolvedServiceId) {
      const linkedService = await prisma.service.findUnique({
        where: { id: resolvedServiceId },
        select: { id: true }
      })

      if (!linkedService) {
        return res.status(404).json({ error: 'No se encontró el tratamiento asociado al bono' })
      }
    }

    const bonoPack = await prisma.bonoPack.create({
      data: {
        clientId,
        name,
        serviceId: resolvedServiceId,
        bonoTemplateId: matchedTemplate?.id || null,
        totalSessions: parsedTotalSessions,
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        notes: notes || null,
        sessions: {
          create: Array.from({ length: parsedTotalSessions }, (_, i) => ({
            sessionNumber: i + 1
          }))
        }
      },
      include: {
        service: { select: { id: true, name: true, category: true, serviceCode: true } },
        sessions: sessionInclude
      }
    })

    res.status(201).json(bonoPack)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Create bono pack error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const updateBonoPack = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params
    const { name, serviceId, bonoTemplateId, totalSessions, price, expiryDate, notes } = req.body

    const parsedTotalSessions = Number.parseInt(String(totalSessions), 10)
    if (!Number.isFinite(parsedTotalSessions) || parsedTotalSessions < 1) {
      return res.status(400).json({ error: 'totalSessions must be a positive integer' })
    }

    const existingBonoPack = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        service: { select: { id: true, name: true, category: true, serviceCode: true } },
        sessions: sessionInclude
      }
    })

    if (!existingBonoPack) {
      return res.status(404).json({ error: 'BonoPack not found' })
    }

    const parsedPrice = Number(price || 0)
    const templates = await readBonoTemplates()
    const matchedTemplate = resolveBonoTemplateForPack(templates, {
      bonoTemplateId: bonoTemplateId || null,
      serviceId: serviceId || null,
      name,
      totalSessions: parsedTotalSessions
    })
    const resolvedServiceId = matchedTemplate?.serviceId || normalizeBonoTemplateId(serviceId) || null

    if (resolvedServiceId) {
      const linkedService = await prisma.service.findUnique({
        where: { id: resolvedServiceId },
        select: { id: true }
      })

      if (!linkedService) {
        return res.status(404).json({ error: 'No se encontró el tratamiento asociado al bono' })
      }
    }

    const consumedSessions = existingBonoPack.sessions.filter((session) => session.status === 'CONSUMED')
    if (parsedTotalSessions < consumedSessions.length) {
      return res.status(400).json({
        error: `No se puede dejar el bono por debajo de las ${consumedSessions.length} sesiones ya consumidas`
      })
    }

    const sessionDelta = parsedTotalSessions - existingBonoPack.totalSessions
    if (sessionDelta < 0) {
      const removableSessions = existingBonoPack.sessions
        .filter((session) => session.status === 'AVAILABLE' && !session.appointmentId)
        .sort((left, right) => right.sessionNumber - left.sessionNumber)

      if (removableSessions.length < Math.abs(sessionDelta)) {
        return res.status(400).json({
          error: 'No hay suficientes sesiones libres para reducir este bono. Libera antes las reservadas si hace falta.'
        })
      }

      const protectedSessions = existingBonoPack.sessions.filter(
        (session) =>
          session.status === 'CONSUMED' ||
          (session.status === 'AVAILABLE' && Boolean(session.appointmentId))
      )
      const highestProtectedSessionNumber = protectedSessions.reduce(
        (highest, session) => Math.max(highest, Number(session.sessionNumber || 0)),
        0
      )

      if (highestProtectedSessionNumber > parsedTotalSessions) {
        return res.status(400).json({
          error: 'No se puede reducir este bono sin alterar sesiones ya consumidas o reservadas. Ajusta solo sesiones libres del final.'
        })
      }
    }

    const normalizedExpiryDate = expiryDate ? new Date(expiryDate) : null
    const nextStatus = resolveBonoPackStatus({
      expiryDate: normalizedExpiryDate,
      totalSessions: parsedTotalSessions,
      consumedSessions: consumedSessions.length
    })

    await prisma.$transaction(async (tx) => {
      if (sessionDelta > 0) {
        await tx.bonoSession.createMany({
          data: Array.from({ length: sessionDelta }, (_, index) => ({
            bonoPackId,
            sessionNumber: existingBonoPack.totalSessions + index + 1
          }))
        })
      } else if (sessionDelta < 0) {
        const removableSessionIds = existingBonoPack.sessions
          .filter((session) => session.status === 'AVAILABLE' && !session.appointmentId)
          .sort((left, right) => right.sessionNumber - left.sessionNumber)
          .slice(0, Math.abs(sessionDelta))
          .map((session) => session.id)

        if (removableSessionIds.length > 0) {
          await tx.bonoSession.deleteMany({
            where: {
              id: {
                in: removableSessionIds
              }
            }
          })
        }
      }

      await tx.bonoPack.update({
        where: { id: bonoPackId },
        data: {
          name,
          serviceId: resolvedServiceId,
          bonoTemplateId: matchedTemplate?.id || null,
          totalSessions: parsedTotalSessions,
          price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
          expiryDate: normalizedExpiryDate,
          notes: notes || null,
          status: nextStatus
        }
      })
    })

    const updatedBonoPack = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        service: { select: { id: true, name: true, category: true, serviceCode: true } },
        sessions: sessionInclude
      }
    })

    res.json(updatedBonoPack)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Update bono pack error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const createBonoAppointment = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params
    const { userId, cabin, date, startTime, status, notes, reminder } = req.body

    const bonoPack = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        client: true,
        service: true,
        sessions: {
          orderBy: { sessionNumber: 'asc' }
        }
      }
    })

    if (!bonoPack) {
      throw new BonoOperationError(404, 'BonoPack not found')
    }

    if (bonoPack.status !== 'ACTIVE') {
      throw new BonoOperationError(400, 'BonoPack is not active')
    }

    const requestedServiceIds = deriveAppointmentServiceIds(req.body, bonoPack.serviceId ? [bonoPack.serviceId] : [])
    if (requestedServiceIds.length === 0) {
      throw new BonoOperationError(400, 'serviceId is required for this bono')
    }

    const availableServices = await prisma.service.findMany({
      where: {
        id: {
          in: requestedServiceIds
        }
      },
      select: {
        id: true,
        name: true,
        duration: true
      }
    })

    const servicesById = new Map(availableServices.map((service) => [service.id, service]))
    const selectedServices = requestedServiceIds
      .map((serviceId: string) => servicesById.get(serviceId) || null)
      .filter((service): service is (typeof availableServices)[number] => service !== null)

    if (selectedServices.length !== requestedServiceIds.length) {
      throw new BonoOperationError(400, 'Uno o mas servicios no existen')
    }

    const resolvedServiceId = selectedServices[0]?.id || ''
    if (!resolvedServiceId) {
      throw new BonoOperationError(400, 'serviceId is required for this bono')
    }

    const nextReservableSession = bonoPack.sessions.find(
      (session) => session.status === 'AVAILABLE' && !session.appointmentId
    )

    if (!nextReservableSession) {
      throw new BonoOperationError(400, 'No available sessions to reserve')
    }

    const professional = await resolveProfessionalName(userId, req.body.professional)
    if (!professional) {
      throw new BonoOperationError(400, 'Debe indicar un profesional valido')
    }

    const appointmentPayload: Prisma.AppointmentUncheckedCreateInput = {
      clientId: bonoPack.clientId,
      userId: String(userId),
      serviceId: resolvedServiceId,
      cabin: cabin as string,
      professional,
      date: toDate(String(date)),
      startTime: String(startTime),
      endTime: calculateAppointmentEndTime(
        String(startTime),
        selectedServices.reduce((total, service) => total + Math.max(0, Number(service.duration || 0)), 0)
      ),
      status: (status as string) || 'SCHEDULED',
      notes: notes ? String(notes) : null,
      reminder: reminder === undefined ? true : Boolean(reminder)
    }

    const validation = await validateAppointmentSlot(
      {
        date: appointmentPayload.date as Date,
        startTime: appointmentPayload.startTime as string,
        endTime: appointmentPayload.endTime as string,
        professional,
        cabin: appointmentPayload.cabin as string
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

    const createdAppointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          ...appointmentPayload,
          appointmentServices: {
            create: buildAppointmentServicesCreateData(selectedServices.map((service) => service.id))
          }
        },
        include: appointmentInclude
      })

      const reservedCount = await tx.bonoSession.updateMany({
        where: {
          id: nextReservableSession.id,
          status: 'AVAILABLE',
          appointmentId: null
        },
        data: {
          appointmentId: created.id
        }
      })

      if (reservedCount.count === 0) {
        throw new BonoOperationError(409, 'The selected bono session is no longer available')
      }

      return created
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(createdAppointment))
    const appointment = await persistCalendarSyncResult(createdAppointment.id, syncResult)

    if (appointmentPayload.reminder) {
      const appointmentName = getAppointmentDisplayName(appointment, 'Cliente')
      await prisma.notification.create({
        data: {
          type: 'APPOINTMENT',
          title: 'Nueva cita programada desde bono',
          message: `Cita con ${appointmentName} el ${new Date(appointment.date).toLocaleDateString()}`,
          priority: 'NORMAL'
        }
      })
    }

    res.status(201).json(appointment)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Create bono appointment error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const consumeSession = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params

    const bonoPack = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        sessions: sessionInclude,
        client: { select: { id: true, firstName: true, lastName: true } }
      }
    })

    if (!bonoPack) {
      return res.status(404).json({ error: 'BonoPack not found' })
    }

    if (bonoPack.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'BonoPack is not active' })
    }

    const isFutureReservation = (session: (typeof bonoPack.sessions)[number]) => {
      if (session.status !== 'AVAILABLE' || !session.appointment) return false
      const status = String(session.appointment.status || '').toUpperCase()
      if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'COMPLETED') return false
      return (
        toAppointmentDateTime({
          date: session.appointment.date,
          startTime: session.appointment.startTime
        }) > new Date()
      )
    }

    const nextAvailable = bonoPack.sessions.find(
      (session) => session.status === 'AVAILABLE' && !isFutureReservation(session)
    )
    if (!nextAvailable) {
      return res.status(400).json({ error: 'No available sessions ready to consume' })
    }

    await prisma.bonoSession.update({
      where: { id: nextAvailable.id },
      data: { status: 'CONSUMED', consumedAt: new Date() }
    })

    const remainingAvailable = bonoPack.sessions.filter((session) => session.status === 'AVAILABLE').length - 1
    if (remainingAvailable === 0) {
      await prisma.bonoPack.update({
        where: { id: bonoPackId },
        data: { status: 'DEPLETED' }
      })

      await prisma.notification.create({
        data: {
          type: 'BONO_DEPLETED',
          title: `Bono agotado: ${bonoPack.name}`,
          message: `El bono "${bonoPack.name}" de ${bonoPack.client.firstName} ${bonoPack.client.lastName} se ha agotado.`,
          priority: 'NORMAL'
        }
      })
    }

    const updated = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        service: { select: { id: true, name: true } },
        sessions: sessionInclude
      }
    })

    res.json(updated)
  } catch (error) {
    console.error('Consume session error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteBonoPack = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params

    await prisma.bonoPack.delete({
      where: { id: bonoPackId }
    })

    res.json({ message: 'BonoPack deleted successfully' })
  } catch (error) {
    console.error('Delete bono pack error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
