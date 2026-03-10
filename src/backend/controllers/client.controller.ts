import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'

const parseDecimalValue = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const raw = String(value).trim().replace(/\s*€\s*/g, '').replace('%', '').replace(/\s/g, '')
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeBilledOutlier = (value: number | null): number | null => {
  if (value === null) return null
  if (value <= 10000) return value

  if (value < 1000000) return Math.trunc(value / 100)
  if (value < 5000000) return Math.trunc(value / 10000)
  return Math.trunc(value / 100000)
}

const parseDateValue = (value: unknown): Date | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeGender = (value: unknown): 'HOMBRE' | 'MUJER' | null => {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim().toUpperCase()
  if (normalized === 'HOMBRE' || normalized === 'MUJER') return normalized
  return null
}

const normalizeClientPayload = (payload: Record<string, any>, requireIdentityFields = true) => {
  const data: Record<string, any> = { ...payload }
  const hasFirstName = Object.prototype.hasOwnProperty.call(data, 'firstName')
  const hasLastName = Object.prototype.hasOwnProperty.call(data, 'lastName')
  const hasPhone = Object.prototype.hasOwnProperty.call(data, 'phone')

  if (requireIdentityFields || hasFirstName) {
    const firstName = String(data.firstName || '').trim()
    data.firstName = firstName || 'SIN_NOMBRE'
  }

  if (requireIdentityFields || hasLastName) {
    const lastName = String(data.lastName || '').trim()
    data.lastName = lastName || 'SIN_APELLIDOS'
  }

  if (requireIdentityFields || hasPhone) {
    const fallbackPhone =
      String(data.phone || '').trim() ||
      String(data.mobilePhone || '').trim() ||
      String(data.landlinePhone || '').trim()
    data.phone = fallbackPhone || `NO_PHONE_${Date.now()}`
  }

  const normalizedFirstName = String(data.firstName || '').trim()
  const normalizedLastName = String(data.lastName || '').trim()
  if (normalizedFirstName || normalizedLastName) {
    data.fullName = `${normalizedFirstName} ${normalizedLastName}`.trim()
  }

  if (data.email !== undefined && data.email !== null) {
    const email = String(data.email).trim().toLowerCase()
    data.email = email && email.includes('@') ? email : null
  }

  if (data.gender !== undefined) {
    data.gender = normalizeGender(data.gender)
  }

  const nullableTextFields = [
    'externalCode',
    'dni',
    'address',
    'city',
    'postalCode',
    'province',
    'landlinePhone',
    'mobilePhone',
    'notes',
    'allergies',
    'gifts',
    'activeTreatmentNames',
    'giftVoucher',
    'linkedClientReference',
    'relationshipType'
  ]

  for (const field of nullableTextFields) {
    if (data[field] !== undefined) {
      const normalized = String(data[field] ?? '').trim()
      data[field] = normalized ? normalized : null
    }
  }

  const nullableIntegerFields = [
    'serviceCount',
    'activeTreatmentCount',
    'bondCount',
    'birthDay',
    'birthMonthNumber',
    'birthYear'
  ]

  for (const field of nullableIntegerFields) {
    if (data[field] !== undefined) {
      const normalized = String(data[field] ?? '').trim()
      if (!normalized) {
        data[field] = null
      } else {
        const parsed = Number.parseInt(normalized, 10)
        data[field] = Number.isFinite(parsed) ? parsed : null
      }
    }
  }

  const nullableDateFields = ['birthDate', 'registrationDate', 'lastVisit']
  for (const field of nullableDateFields) {
    if (data[field] !== undefined) {
      data[field] = parseDateValue(data[field])
    }
  }

  if (data.pendingAmount !== undefined) {
    data.pendingAmount = parseDecimalValue(data.pendingAmount)
  }

  if (data.accountBalance !== undefined) {
    data.accountBalance = parseDecimalValue(data.accountBalance)
  }

  if (data.billedAmount !== undefined) {
    data.billedAmount = normalizeBilledOutlier(parseDecimalValue(data.billedAmount))
  }

  if (data.totalSpent !== undefined) {
    const totalSpent = parseDecimalValue(data.totalSpent)
    data.totalSpent = totalSpent === null ? 0 : normalizeBilledOutlier(totalSpent)
  }

  if (data.debtAlertEnabled === undefined) {
    data.debtAlertEnabled = (data.pendingAmount || 0) > 0
  }

  if (data.linkedClientId !== undefined) {
    const linkedId = String(data.linkedClientId || '').trim()
    data.linkedClientId = linkedId || null
  }

  return data
}

const syncDebtNotification = async (client: {
  id: string
  firstName: string
  lastName: string
  pendingAmount: any
  debtAlertEnabled: boolean
  isActive: boolean
}) => {
  const pendingAmount = Number(client.pendingAmount || 0)
  const title = `Cobro pendiente: ${client.firstName} ${client.lastName}`
  const shouldAlert = client.isActive && client.debtAlertEnabled && pendingAmount > 0

  if (!shouldAlert) {
    await prisma.notification.updateMany({
      where: {
        type: 'PENDING_DEBT',
        title,
        isRead: false
      },
      data: {
        isRead: true
      }
    })
    return
  }

  const existing = await prisma.notification.findFirst({
    where: {
      type: 'PENDING_DEBT',
      title,
      isRead: false
    }
  })

  const message = `El cliente tiene ${pendingAmount.toFixed(2)}€ pendientes de pago.`

  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: { message, priority: 'HIGH' }
    })
    return
  }

  await prisma.notification.create({
    data: {
      type: 'PENDING_DEBT',
      title,
      message,
      priority: 'HIGH'
    }
  })
}

export const getClients = async (req: Request, res: Response) => {
  try {
    const { search, isActive, paginated, page, limit, includeCounts } = req.query
    const normalizedSearch = typeof search === 'string' ? search.trim() : ''
    const shouldPaginate = paginated === 'true'
    const shouldIncludeCounts = includeCounts !== 'false'

    const where: Prisma.ClientWhereInput = {}

    if (normalizedSearch) {
      where.OR = [
        { firstName: { contains: normalizedSearch, mode: 'insensitive' } },
        { lastName: { contains: normalizedSearch, mode: 'insensitive' } },
        { externalCode: { contains: normalizedSearch, mode: 'insensitive' } },
        { dni: { contains: normalizedSearch, mode: 'insensitive' } },
        { email: { contains: normalizedSearch, mode: 'insensitive' } },
        { phone: { contains: normalizedSearch, mode: 'insensitive' } },
        { mobilePhone: { contains: normalizedSearch, mode: 'insensitive' } },
        { landlinePhone: { contains: normalizedSearch, mode: 'insensitive' } }
      ]
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true'
    }

    const include: Prisma.ClientInclude = {
      linkedClient: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },
      ...(shouldIncludeCounts
        ? {
            _count: {
              select: {
                appointments: true,
                sales: true
              }
            }
          }
        : {})
    }

    if (shouldPaginate) {
      const parsedPage = Number.parseInt(String(page ?? '1'), 10)
      const parsedLimit = Number.parseInt(String(limit ?? '50'), 10)
      const pageNumber = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
      const pageSize = Number.isFinite(parsedLimit)
        ? Math.min(100, Math.max(10, parsedLimit))
        : 50
      const skip = (pageNumber - 1) * pageSize

      const [total, activeCount, debtAlertCount, clients] = await prisma.$transaction([
        prisma.client.count({ where }),
        prisma.client.count({
          where: {
            AND: [where, { isActive: true }]
          }
        }),
        prisma.client.count({
          where: {
            AND: [where, { debtAlertEnabled: true, pendingAmount: { gt: 0 } }]
          }
        }),
        prisma.client.findMany({
          where,
          include,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize
        })
      ])

      const totalPages = Math.max(1, Math.ceil(total / pageSize))

      return res.json({
        data: clients,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total,
          totalPages
        },
        summary: {
          total,
          active: activeCount,
          debtAlerts: debtAlertCount
        }
      })
    }

    const clients = await prisma.client.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' }
    })

    res.json(clients)
  } catch (error) {
    console.error('Get clients error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getClientById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        appointments: {
          include: {
            service: true,
            user: {
              select: { name: true }
            }
          },
          orderBy: { date: 'desc' },
          take: 10
        },
        sales: {
          include: {
            items: true
          },
          orderBy: { date: 'desc' },
          take: 10
        },
        clientHistory: {
          orderBy: { date: 'desc' }
        },
        bonoPacks: {
          include: {
            service: { select: { id: true, name: true } },
            sessions: { orderBy: { sessionNumber: 'asc' } }
          },
          orderBy: { purchaseDate: 'desc' }
        },
        linkedClient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            externalCode: true
          }
        },
        relatedClients: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            relationshipType: true
          }
        }
      }
    })

    if (!client) {
      return res.status(404).json({ error: 'Client not found' })
    }

    res.json(client)
  } catch (error) {
    console.error('Get client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createClient = async (req: Request, res: Response) => {
  try {
    const data = normalizeClientPayload(req.body)

    if (!data.gender) {
      return res.status(400).json({ error: 'Gender must be HOMBRE or MUJER' })
    }

    if (data.linkedClientId && typeof data.linkedClientId === 'string') {
      const linkedClient = await prisma.client.findUnique({
        where: { id: data.linkedClientId },
        select: { id: true }
      })
      if (!linkedClient) {
        return res.status(400).json({ error: 'Linked client not found' })
      }
    }

    const client = await prisma.client.create({
      data: data as Prisma.ClientCreateInput
    })

    await syncDebtNotification(client)

    res.status(201).json(client)
  } catch (error) {
    console.error('Create client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const hasGenderInPayload = Object.prototype.hasOwnProperty.call(req.body, 'gender')
    const data = normalizeClientPayload(req.body, false)

    if (hasGenderInPayload && !data.gender) {
      return res.status(400).json({ error: 'Gender must be HOMBRE or MUJER' })
    }

    if (data.linkedClientId && data.linkedClientId === id) {
      return res.status(400).json({ error: 'A client cannot be linked to itself' })
    }

    if (data.linkedClientId && typeof data.linkedClientId === 'string') {
      const linkedClient = await prisma.client.findUnique({
        where: { id: data.linkedClientId },
        select: { id: true }
      })
      if (!linkedClient) {
        return res.status(400).json({ error: 'Linked client not found' })
      }
    }

    const client = await prisma.client.update({
      where: { id },
      data: data as Prisma.ClientUpdateInput
    })

    await syncDebtNotification(client)

    res.json(client)
  } catch (error) {
    console.error('Update client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.client.delete({
      where: { id }
    })

    res.json({ message: 'Client deleted successfully' })
  } catch (error) {
    console.error('Delete client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getClientHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const history = await prisma.clientHistory.findMany({
      where: { clientId: id },
      orderBy: { date: 'desc' }
    })

    res.json(history)
  } catch (error) {
    console.error('Get client history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const addClientHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = req.body

    const history = await prisma.clientHistory.create({
      data: {
        ...data,
        clientId: id
      }
    })

    // Actualizar total gastado del cliente
    await prisma.client.update({
      where: { id },
      data: {
        totalSpent: {
          increment: data.amount
        }
      }
    })

    res.status(201).json(history)
  } catch (error) {
    console.error('Add client history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getBirthdaysThisMonth = async (_req: Request, res: Response) => {
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1

    const clients = await prisma.client.findMany({
      where: {
        isActive: true,
        birthDate: {
          not: null
        }
      }
    })

    const birthdaysThisMonth = clients.filter(client => {
      if (!client.birthDate) return false
      const birthMonth = new Date(client.birthDate).getMonth() + 1
      return birthMonth === currentMonth
    })

    res.json(birthdaysThisMonth)
  } catch (error) {
    console.error('Get birthdays error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
