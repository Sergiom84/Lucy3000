import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { loadWorkbookFromBuffer, worksheetToObjects } from '../utils/spreadsheet'

const buildSearchTerms = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)

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
  const normalized = String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  if (['HOMBRE', 'MASCULINO', 'VARON', 'MALE', 'H'].includes(normalized)) return 'HOMBRE'
  if (['MUJER', 'FEMENINO', 'FEMALE', 'F'].includes(normalized)) return 'MUJER'
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
    const shouldPaginate = typeof paginated === 'boolean' ? paginated : paginated === 'true'
    const shouldIncludeCounts =
      typeof includeCounts === 'boolean' ? includeCounts : includeCounts !== 'false'

    const where: Prisma.ClientWhereInput = {}

    if (normalizedSearch) {
      const searchTerms = buildSearchTerms(normalizedSearch)

      where.AND = searchTerms.map((term) => ({
        OR: [
          { firstName: { contains: term } },
          { lastName: { contains: term } },
          { externalCode: { contains: term } },
          { dni: { contains: term } },
          { email: { contains: term } },
          { phone: { contains: term } },
          { mobilePhone: { contains: term } },
          { landlinePhone: { contains: term } }
        ]
      }))
    }

    if (isActive !== undefined) {
      where.isActive = typeof isActive === 'boolean' ? isActive : isActive === 'true'
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
          take: 50
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
          where: { clientId: id },
          include: {
            service: { select: { id: true, name: true } },
            sessions: {
              orderBy: { sessionNumber: 'asc' },
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

const textOrNull = (val: unknown): string | null => {
  if (!val) return null
  const s = String(val).trim()
  return s === '' || s === '@' ? null : s
}

const normalizeColumnKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const buildNormalizedRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeColumnKey(key)
    if (!normalizedKey || Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) continue
    normalized[normalizedKey] = value
  }

  return normalized
}

const getRowValue = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeColumnKey(alias)
    if (!normalizedAlias || !Object.prototype.hasOwnProperty.call(row, normalizedAlias)) continue
    const value = row[normalizedAlias]
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }

  return null
}

const parseBooleanValue = (value: unknown): boolean | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value

  const normalized = normalizeColumnKey(String(value).trim())
  if (!normalized) return null

  if (['si', 'true', '1', 'yes', 'y', 'x', 'activo', 'activa'].includes(normalized)) return true
  if (['no', 'false', '0', 'n', 'inactivo', 'inactiva'].includes(normalized)) return false

  return null
}

const parseIntegerValue = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number.parseInt(String(value).trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const getMonthName = (monthNumber: number | null): string | null => {
  if (!monthNumber || monthNumber < 1 || monthNumber > 12) return null

  const date = new Date(2000, monthNumber - 1, 1)
  const monthName = date.toLocaleDateString('es-ES', { month: 'long' })
  return monthName.charAt(0).toUpperCase() + monthName.slice(1)
}

const parseBirthMonthValue = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null

  const numericMonth = parseIntegerValue(value)
  if (numericMonth && numericMonth >= 1 && numericMonth <= 12) return numericMonth

  const normalized = normalizeColumnKey(String(value))
  const monthMap: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12
  }

  return monthMap[normalized] ?? null
}

const parseExcelDate = (val: unknown): Date | null => {
  if (!val) return null
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val
  }
  if (typeof val === 'number') {
    const epoch = new Date(1899, 11, 30)
    return new Date(epoch.getTime() + val * 86400000)
  }
  const s = String(val).trim()
  if (!s || s === '01-01-01') return null

  const normalizedDate = s.replace(/[./]/g, '-')
  const parts = normalizedDate.split('-')
  if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) {
    let day: number
    let month: number
    let yyOrYear: number

    if (parts[0].length === 4) {
      yyOrYear = parseInt(parts[0], 10)
      month = parseInt(parts[1], 10)
      day = parseInt(parts[2], 10)
    } else {
      day = parseInt(parts[0], 10)
      month = parseInt(parts[1], 10)
      yyOrYear = parseInt(parts[2], 10)
    }

    if (isNaN(day) || isNaN(month) || isNaN(yyOrYear)) return null
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const year = parts[0].length === 4 || parts[2].length === 4
      ? yyOrYear
      : (yyOrYear <= 30 ? 2000 + yyOrYear : 1900 + yyOrYear)
    const parsed = new Date(year, month - 1, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const resolveBirthMetadata = (row: Record<string, unknown>) => {
  const explicitYear = parseIntegerValue(getRowValue(row, ['Año de nacimiento', 'Ano de nacimiento', 'birthYear']))
  const explicitDay = parseIntegerValue(getRowValue(row, ['Día de nacimiento', 'Dia de nacimiento', 'birthDay']))
  const explicitMonthNumber = parseBirthMonthValue(
    getRowValue(row, ['Mes de nacimiento', 'Mes de nacimiento 2', 'Mes nacimiento', 'birthMonthNumber', 'birthMonthName'])
  )

  const birthDateRaw = getRowValue(row, ['Fecha de nacimiento', 'birthDate'])
  const birthDate = parseExcelDate(birthDateRaw)

  if (birthDate) {
    if (explicitYear) birthDate.setFullYear(explicitYear)

    return {
      birthDate,
      birthDay: birthDate.getDate(),
      birthMonthNumber: birthDate.getMonth() + 1,
      birthMonthName: getMonthName(birthDate.getMonth() + 1),
      birthYear: birthDate.getFullYear()
    }
  }

  return {
    birthDate: null,
    birthDay: explicitDay,
    birthMonthNumber: explicitMonthNumber,
    birthMonthName: getMonthName(explicitMonthNumber),
    birthYear: explicitYear
  }
}

const addClientReferenceToLookup = (
  lookup: Map<string, string>,
  client: {
    id: string
    externalCode?: string | null
    email?: string | null
    phone?: string | null
    mobilePhone?: string | null
    landlinePhone?: string | null
    firstName?: string | null
    lastName?: string | null
  }
) => {
  const addValue = (value: string | null | undefined) => {
    const normalized = textOrNull(value)
    if (!normalized) return

    const key = normalizeColumnKey(normalized)
    if (!key || lookup.has(key)) return
    lookup.set(key, client.id)
  }

  addValue(client.externalCode)
  addValue(client.email)
  addValue(client.phone)
  addValue(client.mobilePhone)
  addValue(client.landlinePhone)

  const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim()
  addValue(fullName)
}

export const importClientsFromExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const workbook = await loadWorkbookFromBuffer(req.file.buffer)
    const worksheet = workbook.worksheets[0]

    if (!worksheet) {
      return res.status(400).json({ error: 'No worksheet found in the uploaded file' })
    }

    const data = worksheetToObjects(worksheet)

    const results = {
      success: 0,
      errors: [] as { row: number; error: string }[],
      skipped: 0
    }

    const seenEmails = new Set<string>()
    const linkedClientLookup = new Map<string, string>()
    const pendingLinks: Array<{ clientId: string; reference: string }> = []

    const existingClients = await prisma.client.findMany({
      select: {
        id: true,
        externalCode: true,
        email: true,
        phone: true,
        mobilePhone: true,
        landlinePhone: true,
        firstName: true,
        lastName: true
      }
    })

    for (const client of existingClients) {
      addClientReferenceToLookup(linkedClientLookup, client)
    }

    for (let i = 0; i < data.length; i++) {
      const row = buildNormalizedRow(data[i] || {})

      try {
        let firstName = textOrNull(getRowValue(row, ['Nombre', 'firstName'])) || ''
        let lastName = textOrNull(getRowValue(row, ['Apellidos', 'lastName'])) || ''

        if (!firstName && !lastName) {
          results.errors.push({ row: i + 2, error: 'Faltan Nombre y Apellidos' })
          results.skipped++
          continue
        }

        if (!firstName) firstName = 'SIN_NOMBRE'
        if (!lastName) lastName = 'SIN_APELLIDOS'

        const externalCode = textOrNull(
          getRowValue(row, ['Nº Cliente', 'NCliente', 'Numero cliente', 'externalCode', 'Codigo cliente'])
        )

        const phone = textOrNull(getRowValue(row, ['Teléfono principal', 'Telefono principal', 'Telefono', 'phone']))
          || textOrNull(getRowValue(row, ['Móvil', 'Movil', 'mobilePhone']))
          || textOrNull(getRowValue(row, ['Teléfono fijo', 'Telefono fijo', 'landlinePhone']))
          || `NO_PHONE_${externalCode || i}`

        const mobilePhone = textOrNull(getRowValue(row, ['Móvil', 'Movil', 'mobilePhone']))
        const landlinePhone = textOrNull(getRowValue(row, ['Teléfono fijo', 'Telefono fijo', 'landlinePhone']))

        let emailRaw = textOrNull(getRowValue(row, ['Email', 'eMail', 'Correo electrónico', 'correo', 'mail']))
        let email: string | null = null
        if (emailRaw && emailRaw.includes('@') && emailRaw.includes('.')) {
          const normalized = emailRaw.toLowerCase()
          if (!seenEmails.has(normalized)) {
            seenEmails.add(normalized)
            email = normalized
          }
        }

        const billedRaw = getRowValue(row, ['Importe facturado', 'billedAmount', 'Total facturado'])
        const pendingRaw = getRowValue(row, ['Importe pendiente', 'pendingAmount', 'Deuda'])
        const accountBalanceRaw = getRowValue(row, ['Saldo a cuenta', 'accountBalance', 'Abono'])
        const birthMetadata = resolveBirthMetadata(row)
        const linkedClientReference = textOrNull(
          getRowValue(row, ['Cliente vinculado', 'Enlazar cliente', 'Referencia cliente vinculado', 'linkedClientReference'])
        )
        const debtAlertEnabled = parseBooleanValue(
          getRowValue(row, ['Avisar deuda', 'Alerta deuda', 'debtAlertEnabled'])
        )
        const isActive = parseBooleanValue(getRowValue(row, ['Cliente activo', 'Activo', 'isActive']))

        const clientPayload = normalizeClientPayload({
          externalCode,
          dni: getRowValue(row, ['DNI', 'dni']),
          firstName,
          lastName,
          email,
          phone,
          mobilePhone,
          landlinePhone,
          gender: getRowValue(row, ['Sexo', 'gender']),
          birthDate: birthMetadata.birthDate,
          birthDay: birthMetadata.birthDay,
          birthMonthNumber: birthMetadata.birthMonthNumber,
          birthMonthName: birthMetadata.birthMonthName,
          birthYear: birthMetadata.birthYear,
          registrationDate: parseExcelDate(getRowValue(row, ['Fecha de alta', 'registrationDate'])),
          lastVisit: parseExcelDate(getRowValue(row, ['Última visita', 'Ultima visita', 'lastVisit'])),
          address: getRowValue(row, ['Dirección', 'Direccion', 'address']),
          city: getRowValue(row, ['Ciudad', 'city']),
          postalCode: getRowValue(row, ['CP', 'Código postal', 'Codigo postal', 'postalCode']),
          province: getRowValue(row, ['Provincia', 'province']),
          notes: getRowValue(row, ['Notas', 'Nota', 'Observaciones', 'notes']),
          allergies: getRowValue(row, ['Alergias', 'allergies']),
          gifts: getRowValue(row, ['Obsequios', 'gifts']),
          activeTreatmentCount: getRowValue(row, [
            'Nº tratamientos activos',
            'Numero tratamientos activos',
            'Número de Tratamientos activos',
            'Numero de tratamientos activos',
            'activeTreatmentCount'
          ]),
          activeTreatmentNames: getRowValue(row, [
            'Tratamientos activos',
            'Nombre de los tratamientos activos',
            'Nombre tratamientos activos',
            'activeTreatmentNames'
          ]),
          bondCount: getRowValue(row, [
            'Nº abonos',
            'Numero abonos',
            'Número de abonos',
            'Numero de abonos',
            'bondCount'
          ]),
          giftVoucher: getRowValue(row, ['Cheque regalo', 'giftVoucher']),
          serviceCount: getRowValue(row, ['Cantidad de servicios', 'Número de servicios', 'Numero de servicios', 'serviceCount']),
          accountBalance: accountBalanceRaw,
          billedAmount: billedRaw,
          totalSpent: billedRaw,
          pendingAmount: pendingRaw,
          debtAlertEnabled: debtAlertEnabled ?? undefined,
          linkedClientReference,
          relationshipType: getRowValue(row, ['Parentesco', 'Tipo de relación', 'Tipo de relacion', 'relationshipType']),
          isActive: isActive ?? true
        })

        const createdClient = await prisma.client.create({
          data: clientPayload as Prisma.ClientCreateInput
        })

        addClientReferenceToLookup(linkedClientLookup, createdClient)

        if (linkedClientReference) {
          pendingLinks.push({
            clientId: createdClient.id,
            reference: linkedClientReference
          })
        }

        results.success++
      } catch (error: any) {
        results.errors.push({ row: i + 2, error: error.message })
        results.skipped++
      }
    }

    for (const pendingLink of pendingLinks) {
      const linkedClientId = linkedClientLookup.get(normalizeColumnKey(pendingLink.reference))
      if (!linkedClientId || linkedClientId === pendingLink.clientId) continue

      await prisma.client.update({
        where: { id: pendingLink.clientId },
        data: { linkedClientId }
      })
    }

    res.json({ message: 'Import completed', results })
  } catch (error) {
    console.error('Import clients error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
