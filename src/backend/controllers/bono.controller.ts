import { AppointmentStatus, Cabin, Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AppointmentSyncInput, googleCalendarService } from '../services/googleCalendar.service'

class AccountBalanceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

class BonoOperationError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

const toNumber = (value: unknown) => Number(value || 0)
const normalizeMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const serializeMovement = (movement: {
  id: string
  clientId: string
  saleId: string | null
  type: string
  operationDate: Date
  description: string
  referenceItem: string | null
  amount: Prisma.Decimal
  balanceAfter: Prisma.Decimal
  notes: string | null
  createdAt: Date
}) => ({
  ...movement,
  amount: toNumber(movement.amount),
  balanceAfter: toNumber(movement.balanceAfter)
})

const toHttpError = (error: unknown) => {
  if (error instanceof AccountBalanceError || error instanceof BonoOperationError) {
    return { statusCode: error.statusCode, message: error.message }
  }

  return { statusCode: 500, message: 'Internal server error' }
}

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

type AppointmentRecord = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>

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

const toAppointmentDateTime = (appointment: { date: Date; startTime: string }) => {
  const at = new Date(appointment.date)
  const [hours, minutes] = String(appointment.startTime || '00:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10))
  at.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return at
}

const buildCalendarSyncInput = (appointment: AppointmentRecord): AppointmentSyncInput => {
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
        service: { select: { id: true, name: true } },
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
    const { clientId, name, serviceId, totalSessions, price, expiryDate, notes } = req.body

    if (!clientId || !name || !totalSessions || totalSessions < 1) {
      return res.status(400).json({ error: 'clientId, name and totalSessions (>= 1) are required' })
    }

    const parsedTotalSessions = Number.parseInt(String(totalSessions), 10)
    if (!Number.isFinite(parsedTotalSessions) || parsedTotalSessions < 1) {
      return res.status(400).json({ error: 'totalSessions must be a positive integer' })
    }

    const parsedPrice = Number(price || 0)

    const bonoPack = await prisma.bonoPack.create({
      data: {
        clientId,
        name,
        serviceId: serviceId || null,
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
        service: { select: { id: true, name: true } },
        sessions: sessionInclude
      }
    })

    res.status(201).json(bonoPack)
  } catch (error) {
    console.error('Create bono pack error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoAppointment = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params
    const {
      serviceId,
      userId,
      cabin,
      date,
      startTime,
      endTime,
      status,
      notes,
      reminder
    } = req.body

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

    const resolvedServiceId = String(serviceId || bonoPack.serviceId || '').trim()
    if (!resolvedServiceId) {
      throw new BonoOperationError(400, 'serviceId is required for this bono')
    }

    const nextReservableSession = bonoPack.sessions.find(
      (session) => session.status === 'AVAILABLE' && !session.appointmentId
    )

    if (!nextReservableSession) {
      throw new BonoOperationError(400, 'No available sessions to reserve')
    }

    const appointmentPayload: Prisma.AppointmentUncheckedCreateInput = {
      clientId: bonoPack.clientId,
      userId: String(userId),
      serviceId: resolvedServiceId,
      cabin: cabin as Cabin,
      date: toDate(String(date)),
      startTime: String(startTime),
      endTime: String(endTime),
      status: (status as AppointmentStatus) || 'SCHEDULED',
      notes: notes ? String(notes) : null,
      reminder: reminder === undefined ? true : Boolean(reminder)
    }

    const createdAppointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: appointmentPayload,
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
      await prisma.notification.create({
        data: {
          type: 'APPOINTMENT',
          title: 'Nueva cita programada desde bono',
          message: `Cita con ${appointment.client.firstName} ${appointment.client.lastName} el ${new Date(appointment.date).toLocaleDateString()}`,
          priority: 'NORMAL'
        }
      })
    }

    res.status(201).json(appointment)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
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
      return toAppointmentDateTime({
        date: session.appointment.date,
        startTime: session.appointment.startTime
      }) > new Date()
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

export const getAccountBalanceHistory = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const parsedLimit = Number.parseInt(String(req.query.limit ?? '50'), 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50

    const [client, movements] = await prisma.$transaction([
      prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          accountBalance: true
        }
      }),
      prisma.accountBalanceMovement.findMany({
        where: { clientId },
        orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }],
        take: limit
      })
    ])

    if (!client) {
      return res.status(404).json({ error: 'Client not found' })
    }

    res.json({
      clientId: client.id,
      currentBalance: toNumber(client.accountBalance),
      movements: movements.map(serializeMovement)
    })
  } catch (error) {
    console.error('Get account balance history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAccountBalanceTopUp = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const { description, amount, operationDate, notes } = req.body

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new AccountBalanceError(400, 'Amount must be greater than zero')
    }

    const response = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, accountBalance: true }
      })

      if (!client) {
        throw new AccountBalanceError(404, 'Client not found')
      }

      const currentBalance = toNumber(client.accountBalance)
      const nextBalance = normalizeMoney(currentBalance + parsedAmount)

      await tx.client.update({
        where: { id: clientId },
        data: { accountBalance: nextBalance }
      })

      const movement = await tx.accountBalanceMovement.create({
        data: {
          clientId,
          type: 'TOP_UP',
          operationDate: operationDate ? new Date(operationDate) : new Date(),
          description: String(description).trim(),
          referenceItem: null,
          amount: parsedAmount,
          balanceAfter: nextBalance,
          notes: notes || null
        }
      })

      return {
        currentBalance: nextBalance,
        movement: serializeMovement(movement)
      }
    })

    res.status(201).json(response)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Create account balance top-up error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const consumeAccountBalance = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const { operationDate, referenceItem, amount, notes, saleId, description } = req.body

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new AccountBalanceError(400, 'Amount must be greater than zero')
    }

    const response = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, accountBalance: true }
      })

      if (!client) {
        throw new AccountBalanceError(404, 'Client not found')
      }

      const currentBalance = toNumber(client.accountBalance)
      if (currentBalance < parsedAmount) {
        throw new AccountBalanceError(400, 'Insufficient account balance')
      }

      const nextBalance = normalizeMoney(currentBalance - parsedAmount)

      await tx.client.update({
        where: { id: clientId },
        data: { accountBalance: nextBalance }
      })

      const movement = await tx.accountBalanceMovement.create({
        data: {
          clientId,
          saleId: saleId || null,
          type: 'CONSUMPTION',
          operationDate: operationDate ? new Date(operationDate) : new Date(),
          description: String(description || 'Consumo de abono').trim(),
          referenceItem: String(referenceItem).trim(),
          amount: parsedAmount,
          balanceAfter: nextBalance,
          notes: notes || null
        }
      })

      return {
        currentBalance: nextBalance,
        movement: serializeMovement(movement)
      }
    })

    res.status(201).json(response)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Consume account balance error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const updateAccountBalance = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const { accountBalance } = req.body

    const nextBalance = accountBalance !== null && accountBalance !== undefined ? Number(accountBalance) : 0
    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      return res.status(400).json({ error: 'accountBalance must be a valid number >= 0' })
    }

    const response = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, accountBalance: true }
      })

      if (!client) {
        throw new AccountBalanceError(404, 'Client not found')
      }

      const previousBalance = toNumber(client.accountBalance)
      const normalizedNext = normalizeMoney(nextBalance)

      const updatedClient = await tx.client.update({
        where: { id: clientId },
        data: { accountBalance: normalizedNext }
      })

      if (previousBalance !== normalizedNext) {
        const difference = Math.abs(normalizedNext - previousBalance)
        await tx.accountBalanceMovement.create({
          data: {
            clientId,
            type: 'ADJUSTMENT',
            operationDate: new Date(),
            description: `Ajuste manual de saldo: ${previousBalance.toFixed(2)}€ -> ${normalizedNext.toFixed(2)}€`,
            referenceItem: null,
            amount: difference,
            balanceAfter: normalizedNext,
            notes: null
          }
        })
      }

      return updatedClient
    })

    res.json(response)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Update account balance error:', error)
    res.status(statusCode).json({ error: message })
  }
}
