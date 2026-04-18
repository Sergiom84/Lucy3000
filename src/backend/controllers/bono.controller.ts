import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import type { Workbook } from 'exceljs'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { AppointmentSyncInput, googleCalendarService } from '../services/googleCalendar.service'
import { validateAppointmentSlot } from '../utils/appointment-validation'
import {
  getAppointmentDisplayEmail,
  getAppointmentDisplayName,
  getAppointmentDisplayPhone
} from '../utils/customer-display'
import { normalizeTopUpPaymentMethod } from '../utils/payment-breakdown'
import { loadWorkbookFromBuffer, worksheetToObjects } from '../utils/spreadsheet'

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
const BONO_TEMPLATES_SETTING_KEY = 'bono_templates_catalog'

type BonoTemplate = {
  id: string
  category: string
  description: string
  serviceId: string
  serviceName: string
  serviceLookup: string
  totalSessions: number
  price: number
  isActive: boolean
  createdAt: string
}

const sortBonoTemplates = (templates: BonoTemplate[]) =>
  [...templates].sort((left, right) => {
    const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'es', {
      sensitivity: 'base'
    })
    if (categoryCompare !== 0) return categoryCompare

    const descriptionCompare = String(left.description || '').localeCompare(String(right.description || ''), 'es', {
      sensitivity: 'base'
    })
    if (descriptionCompare !== 0) return descriptionCompare

    return Number(left.totalSessions || 0) - Number(right.totalSessions || 0)
  })

const normalizeTemplateKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const buildNormalizedTemplateRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeTemplateKey(key)
    if (!normalizedKey || Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) continue
    normalized[normalizedKey] = value
  }

  return normalized
}

const getTemplateRowValue = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeTemplateKey(alias)
    if (!normalizedAlias || !Object.prototype.hasOwnProperty.call(row, normalizedAlias)) continue
    const value = row[normalizedAlias]
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }

  return null
}

const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const parseTemplatePrice = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === '') return 0
  const normalized = String(value).trim().replace(/\s*€\s*/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? normalizeMoney(parsed) : 0
}

const parseTemplateSessions = (value: unknown) => {
  if (value === null || value === undefined) return null
  const match = String(value).match(/(\d+)/)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const readBonoTemplates = async () => {
  const setting = await prisma.setting.findUnique({
    where: { key: BONO_TEMPLATES_SETTING_KEY }
  })

  if (!setting) return [] as BonoTemplate[]

  try {
    const parsed = JSON.parse(setting.value)
    return Array.isArray(parsed) ? (parsed as BonoTemplate[]) : []
  } catch {
    return []
  }
}

const writeBonoTemplates = async (templates: BonoTemplate[]) => {
  await prisma.setting.upsert({
    where: { key: BONO_TEMPLATES_SETTING_KEY },
    update: {
      value: JSON.stringify(sortBonoTemplates(templates)),
      description: 'Catalogo importado de bonos'
    },
    create: {
      key: BONO_TEMPLATES_SETTING_KEY,
      value: JSON.stringify(sortBonoTemplates(templates)),
      description: 'Catalogo importado de bonos'
    }
  })
}

const selectBonoTemplateSheet = (workbook: Workbook) => {
  let bestMatch: {
    sheetName: string
    rawRows: Record<string, unknown>[]
    score: number
  } | null = null

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name
    const rawRows = worksheetToObjects(worksheet)
    const normalizedRows = rawRows.slice(0, 25).map((row) => buildNormalizedTemplateRow(row || {}))

    const hasDescriptionColumn = normalizedRows.some((row) =>
      getTemplateRowValue(row, ['Descripcion', 'Descripción', 'Nombre', 'Bono']) !== null
    )
    const hasServiceLookupColumn = normalizedRows.some((row) =>
      getTemplateRowValue(row, ['Codigo', 'Código', 'Servicio', 'Tratamiento', 'service']) !== null
    )
    const hasPriceColumn = normalizedRows.some((row) =>
      getTemplateRowValue(row, ['Tarifa 1', 'Tarifa', 'Precio', 'PVP']) !== null
    )
    const bonusHintCount = normalizedRows.filter((row) => {
      return ['Descripcion', 'Descripción', 'Nombre', 'Bono'].some((alias) => {
        const value = getTemplateRowValue(row, [alias])
        return typeof value === 'string' && normalizeSearchText(value).includes('bono')
      })
    }).length

    const score =
      (rawRows.length > 0 ? 1 : 0) +
      (hasDescriptionColumn ? 3 : 0) +
      (hasServiceLookupColumn ? 3 : 0) +
      (hasPriceColumn ? 2 : 0) +
      bonusHintCount * 5

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { sheetName, rawRows, score }
    }
  }

  return bestMatch
}

const serializeMovement = (movement: {
  id: string
  clientId: string
  saleId: string | null
  type: string
  paymentMethod?: string | null
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
  const clientName = getAppointmentDisplayName(appointment, 'Cliente')
  const phone = getAppointmentDisplayPhone(appointment)
  const phoneLine = phone ? `\nTelefono: ${phone}` : ''

  return {
    appointmentId: appointment.id,
    existingEventId: appointment.googleCalendarEventId || null,
    title: `${appointment.service.name} - ${clientName}`,
    description: `Cita para ${appointment.service.name}\nCliente: ${clientName}${phoneLine}`,
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

export const getBonoTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await readBonoTemplates()
    res.json(sortBonoTemplates(templates.filter((template) => template.isActive !== false)))
  } catch (error) {
    console.error('Get bono templates error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoTemplate = async (req: Request, res: Response) => {
  try {
    const category = String(req.body.category || '').trim()
    const description = String(req.body.description || '').trim()
    const serviceId = String(req.body.serviceId || '').trim()
    const totalSessions = Number.parseInt(String(req.body.totalSessions), 10)
    const price = normalizeMoney(Number(req.body.price || 0))
    const isActive = req.body.isActive !== false

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        name: true,
        serviceCode: true,
        category: true
      }
    })

    if (!service) {
      return res.status(404).json({ error: 'No se encontró el tratamiento base seleccionado' })
    }

    const templates = await readBonoTemplates()
    const normalizedDescription = normalizeSearchText(description)
    const duplicateTemplate = templates.find(
      (template) =>
        template.serviceId === service.id &&
        normalizeSearchText(template.description) === normalizedDescription &&
        Number(template.totalSessions || 0) === totalSessions
    )

    if (duplicateTemplate) {
      return res.status(409).json({
        error: 'Ya existe un bono con ese tratamiento, descripción y número de sesiones'
      })
    }

    const nextTemplate: BonoTemplate = {
      id: randomUUID(),
      category: category || String(service.category || '').trim() || 'Bonos',
      description,
      serviceId: service.id,
      serviceName: service.name,
      serviceLookup: String(service.serviceCode || service.name || '').trim(),
      totalSessions,
      price,
      isActive,
      createdAt: new Date().toISOString()
    }

    await writeBonoTemplates([...templates, nextTemplate])
    res.status(201).json(nextTemplate)
  } catch (error) {
    console.error('Create bono template error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const importBonoTemplatesFromExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const workbook = await loadWorkbookFromBuffer(req.file.buffer)
    const selectedSheet = selectBonoTemplateSheet(workbook)

    if (!selectedSheet || selectedSheet.rawRows.length === 0) {
      return res.status(400).json({ error: 'No se encontró una hoja válida para importar bonos' })
    }

    const { sheetName, rawRows } = selectedSheet

    const services = await prisma.service.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        serviceCode: true,
        category: true
      }
    })

    const resolveService = (lookupValue: string) => {
      const normalizedLookup = normalizeSearchText(lookupValue)
      if (!normalizedLookup) return null

      return (
        services.find((service) => normalizeSearchText(service.serviceCode) === normalizedLookup) ||
        services.find((service) => normalizeSearchText(service.name) === normalizedLookup) ||
        services.find((service) => normalizeSearchText(`${service.name} ${service.category}`) === normalizedLookup) ||
        services.find((service) => normalizeSearchText(service.name).includes(normalizedLookup))
      )
    }

    const results = {
      success: 0,
      errors: [] as { row: number; error: string }[],
      skipped: 0
    }

    const importedTemplates: BonoTemplate[] = []

    for (let i = 0; i < rawRows.length; i += 1) {
      const row = buildNormalizedTemplateRow(rawRows[i] || {})

      try {
        const category = String(
          getTemplateRowValue(row, ['Categoria', 'Categoría', 'Familia', 'family']) || ''
        ).trim()
        const serviceLookup = String(
          getTemplateRowValue(row, ['Codigo', 'Código', 'Servicio', 'Tratamiento', 'service']) || ''
        ).trim()
        const description = String(
          getTemplateRowValue(row, ['Descripcion', 'Descripción', 'Nombre', 'Bono']) || ''
        ).trim()
        const price = parseTemplatePrice(
          getTemplateRowValue(row, ['Tarifa 1', 'Tarifa', 'Precio', 'PVP'])
        )
        const totalSessions =
          parseTemplateSessions(getTemplateRowValue(row, ['Sesiones', 'Total sesiones', 'Numero sesiones'])) ||
          parseTemplateSessions(description)

        if (!serviceLookup || !description) {
          results.skipped += 1
          continue
        }

        if (!totalSessions) {
          throw new Error('No se pudo deducir el número de sesiones')
        }

        const resolvedService = resolveService(serviceLookup)
        if (!resolvedService) {
          throw new Error(`No se encontró el tratamiento base: ${serviceLookup}`)
        }

        importedTemplates.push({
          id: randomUUID(),
          category: category || resolvedService.category || 'Bonos',
          description,
          serviceId: resolvedService.id,
          serviceName: resolvedService.name,
          serviceLookup,
          totalSessions,
          price,
          isActive: true,
          createdAt: new Date().toISOString()
        })

        results.success += 1
      } catch (error: any) {
        results.errors.push({
          row: i + 2,
          error: error.message
        })
        results.skipped += 1
      }
    }

    const dedupedTemplates = importedTemplates.filter((template, index, source) => {
      return source.findIndex((candidate) =>
        candidate.serviceId === template.serviceId &&
        candidate.description === template.description &&
        candidate.totalSessions === template.totalSessions
      ) === index
    })

    if (dedupedTemplates.length > 0) {
      await writeBonoTemplates(dedupedTemplates)
    }

    res.json({
      message: `Bonus catalog imported from ${sheetName}`,
      results: {
        ...results,
        success: dedupedTemplates.length,
        skipped: results.skipped + (importedTemplates.length - dedupedTemplates.length)
      }
    })
  } catch (error) {
    console.error('Import bono templates error:', error)
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

    const professional = (req.body.professional as string) || 'LUCY'

    const appointmentPayload: Prisma.AppointmentUncheckedCreateInput = {
      clientId: bonoPack.clientId,
      userId: String(userId),
      serviceId: resolvedServiceId,
      cabin: cabin as string,
      professional,
      date: toDate(String(date)),
      startTime: String(startTime),
      endTime: String(endTime),
      status: (status as string) || 'SCHEDULED',
      notes: notes ? String(notes) : null,
      reminder: reminder === undefined ? true : Boolean(reminder)
    }

    const validation = await validateAppointmentSlot({
      date: appointmentPayload.date as Date,
      startTime: appointmentPayload.startTime as string,
      endTime: appointmentPayload.endTime as string,
      professional,
      cabin: appointmentPayload.cabin as string,
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

export const getGlobalAccountBalanceHistory = async (req: Request, res: Response) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit ?? '300'), 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 300

    const movements = await prisma.accountBalanceMovement.findMany({
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            paymentMethod: true
          }
        }
      },
      orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }],
      take: limit
    })

    res.json({
      movements: movements.map((movement) => ({
        ...serializeMovement(movement),
        client: movement.client,
        sale: movement.sale
      }))
    })
  } catch (error) {
    console.error('Get global account balance history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAccountBalanceTopUp = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { description, amount, paymentMethod, operationDate, notes } = req.body

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new AccountBalanceError(400, 'Amount must be greater than zero')
    }

    const normalizedPaymentMethod = normalizeTopUpPaymentMethod(paymentMethod)
    if (!normalizedPaymentMethod) {
      throw new AccountBalanceError(400, 'Invalid payment method for top-up')
    }

    if (!req.user?.id) {
      throw new AccountBalanceError(401, 'Unauthorized')
    }
    const userId = req.user.id

    const response = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, firstName: true, lastName: true, accountBalance: true }
      })

      if (!client) {
        throw new AccountBalanceError(404, 'Client not found')
      }

      const currentBalance = toNumber(client.accountBalance)
      const nextBalance = normalizeMoney(currentBalance + parsedAmount)
      const operationAt = operationDate ? new Date(operationDate) : new Date()

      await tx.client.update({
        where: { id: clientId },
        data: { accountBalance: nextBalance }
      })

      const movement = await tx.accountBalanceMovement.create({
        data: {
          clientId,
          type: 'TOP_UP',
          paymentMethod: normalizedPaymentMethod,
          operationDate: operationAt,
          description: String(description).trim(),
          referenceItem: null,
          amount: parsedAmount,
          balanceAfter: nextBalance,
          notes: notes || null
        } as Prisma.AccountBalanceMovementUncheckedCreateInput
      })

      const openCashRegister = await tx.cashRegister.findFirst({
        where: { status: 'OPEN' },
        select: { id: true }
      })

      if (openCashRegister) {
        await tx.cashMovement.create({
          data: {
            cashRegisterId: openCashRegister.id,
            userId,
            type: 'INCOME',
            paymentMethod: normalizedPaymentMethod,
            amount: parsedAmount,
            category: 'Abonos',
            description: `Recarga de abono · ${client.firstName} ${client.lastName}`.trim(),
            reference: String(description).trim(),
            date: operationAt
          }
        })
      }

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
