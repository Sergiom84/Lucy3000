import { Prisma } from '@prisma/client'
import { prisma } from '../../db'

export type ClientSortBy = 'lastVisit' | 'name' | 'clientNumber' | 'totalSpent' | 'pendingAmount'
export type ClientSortDirection = 'asc' | 'desc'

const DEFAULT_SORT_DIRECTION: Record<ClientSortBy, ClientSortDirection> = {
  lastVisit: 'desc',
  name: 'asc',
  clientNumber: 'asc',
  totalSpent: 'desc',
  pendingAmount: 'desc'
}

const buildClientNameOrderSql = (sortDirection: ClientSortDirection) =>
  sortDirection === 'asc'
    ? Prisma.sql`LOWER(TRIM(COALESCE(c."firstName", '') || ' ' || COALESCE(c."lastName", ''))) ASC, c."createdAt" DESC`
    : Prisma.sql`LOWER(TRIM(COALESCE(c."firstName", '') || ' ' || COALESCE(c."lastName", ''))) DESC, c."createdAt" DESC`

const clientNumberIsNumericSql = Prisma.sql`
  TRIM(COALESCE(c."externalCode", '')) <> ''
  AND TRIM(COALESCE(c."externalCode", '')) NOT GLOB '*[^0-9]*'
`

const clientNumberRankSql = Prisma.sql`
  CASE
    WHEN c."externalCode" IS NULL OR TRIM(c."externalCode") = '' THEN 2
    WHEN ${clientNumberIsNumericSql} THEN 0
    ELSE 1
  END
`

const clientNumberValueSql = Prisma.sql`
  CASE
    WHEN ${clientNumberIsNumericSql} THEN CAST(TRIM(c."externalCode") AS INTEGER)
    ELSE NULL
  END
`

const latestCompletedAppointmentDateSql = Prisma.sql`
  MAX(CASE WHEN a."status" = 'COMPLETED' THEN a."date" END)
`

export const buildSearchTerms = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)

export const normalizeClientSortBy = (value: unknown): ClientSortBy => {
  switch (value) {
    case 'name':
    case 'clientNumber':
    case 'totalSpent':
    case 'pendingAmount':
      return value
    case 'lastVisit':
    default:
      return 'lastVisit'
  }
}

export const normalizeClientSortDirection = (
  sortBy: ClientSortBy,
  value: unknown
): ClientSortDirection => (value === 'asc' || value === 'desc' ? value : DEFAULT_SORT_DIRECTION[sortBy])

const buildClientNumberOrderSql = (sortDirection: ClientSortDirection) =>
  sortDirection === 'asc'
    ? Prisma.sql`
        ${clientNumberRankSql} ASC,
        ${clientNumberValueSql} ASC,
        LOWER(COALESCE(c."externalCode", '')) ASC,
        ${buildClientNameOrderSql('asc')}
      `
    : Prisma.sql`
        ${clientNumberRankSql} ASC,
        ${clientNumberValueSql} DESC,
        LOWER(COALESCE(c."externalCode", '')) DESC,
        ${buildClientNameOrderSql('asc')}
      `

const buildClientLastVisitOrderSql = (sortDirection: ClientSortDirection) =>
  sortDirection === 'asc'
    ? Prisma.sql`
        CASE WHEN ${latestCompletedAppointmentDateSql} IS NULL THEN 1 ELSE 0 END ASC,
        ${latestCompletedAppointmentDateSql} ASC,
        c."createdAt" DESC
      `
    : Prisma.sql`
        CASE WHEN ${latestCompletedAppointmentDateSql} IS NULL THEN 1 ELSE 0 END ASC,
        ${latestCompletedAppointmentDateSql} DESC,
        c."createdAt" DESC
      `

const buildClientOrderSql = (sortBy: ClientSortBy, sortDirection: ClientSortDirection) => {
  switch (sortBy) {
    case 'name':
      return buildClientNameOrderSql(sortDirection)
    case 'clientNumber':
      return buildClientNumberOrderSql(sortDirection)
    case 'totalSpent':
      return sortDirection === 'asc'
        ? Prisma.sql`COALESCE(c."totalSpent", 0) ASC, ${buildClientNameOrderSql('asc')}`
        : Prisma.sql`COALESCE(c."totalSpent", 0) DESC, ${buildClientNameOrderSql('asc')}`
    case 'pendingAmount':
      return sortDirection === 'asc'
        ? Prisma.sql`COALESCE(c."pendingAmount", 0) ASC, ${buildClientNameOrderSql('asc')}`
        : Prisma.sql`COALESCE(c."pendingAmount", 0) DESC, ${buildClientNameOrderSql('asc')}`
    case 'lastVisit':
    default:
      return buildClientLastVisitOrderSql(sortDirection)
  }
}

const buildClientSearchSql = (term: string) => {
  const likeTerm = `%${term}%`

  return Prisma.sql`(
    LOWER(COALESCE(c."firstName", '')) LIKE LOWER(${likeTerm})
    OR LOWER(COALESCE(c."lastName", '')) LIKE LOWER(${likeTerm})
    OR LOWER(COALESCE(c."externalCode", '')) LIKE LOWER(${likeTerm})
    OR LOWER(COALESCE(c."dni", '')) LIKE LOWER(${likeTerm})
    OR LOWER(COALESCE(c."email", '')) LIKE LOWER(${likeTerm})
    OR LOWER(COALESCE(c."phone", '')) LIKE LOWER(${likeTerm})
    OR LOWER(COALESCE(c."mobilePhone", '')) LIKE LOWER(${likeTerm})
    OR LOWER(COALESCE(c."landlinePhone", '')) LIKE LOWER(${likeTerm})
  )`
}

const parseDecimalValue = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const raw = String(value).trim().replace(/\s*€\s*/g, '').replace('%', '').replace(/\s/g, '')
  const normalized =
    raw.includes(',') && raw.includes('.')
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

export const getOrderedClientIds = async ({
  searchTerms,
  isActive,
  pendingOnly,
  sortBy,
  sortDirection,
  skip,
  take
}: {
  searchTerms: string[]
  isActive?: boolean
  pendingOnly?: boolean
  sortBy: ClientSortBy
  sortDirection: ClientSortDirection
  skip?: number
  take?: number
}) => {
  const whereClauses: Prisma.Sql[] = []

  for (const term of searchTerms) {
    whereClauses.push(buildClientSearchSql(term))
  }

  if (typeof isActive === 'boolean') {
    whereClauses.push(Prisma.sql`c."isActive" = ${isActive}`)
  }

  if (pendingOnly) {
    whereClauses.push(Prisma.sql`COALESCE(c."pendingAmount", 0) > 0`)
  }

  const whereSql =
    whereClauses.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}`
      : Prisma.empty

  const paginationSql =
    typeof take === 'number'
      ? Prisma.sql`LIMIT ${take} OFFSET ${skip ?? 0}`
      : Prisma.empty
  const orderBySql = buildClientOrderSql(sortBy, sortDirection)

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT c."id"
    FROM "clients" c
    LEFT JOIN "appointments" a ON a."clientId" = c."id"
    ${whereSql}
    GROUP BY c."id"
    ORDER BY ${orderBySql}
    ${paginationSql}
  `)

  return rows.map((row) => row.id)
}

export const loadClientsByOrderedIds = async ({
  clientIds,
  include
}: {
  clientIds: string[]
  include: Prisma.ClientInclude
}) => {
  if (clientIds.length === 0) return []

  const [clients, appointmentActivity] = await Promise.all([
    prisma.client.findMany({
      where: {
        id: {
          in: clientIds
        }
      },
      include
    }),
    prisma.appointment.groupBy({
      by: ['clientId'],
      where: {
        clientId: {
          in: clientIds
        },
        status: 'COMPLETED'
      },
      _max: {
        date: true
      }
    })
  ])

  const appointmentActivityByClient = new Map(
    appointmentActivity.map((item: { clientId: string | null; _max: { date: Date | null } }) => [
      item.clientId,
      item._max.date
    ])
  )
  const clientsById = new Map(
    clients.map((client) => [
      client.id,
      {
        ...client,
        effectiveLastVisit: appointmentActivityByClient.get(client.id) ?? null
      }
    ])
  )

  return clientIds
    .map((clientId) => clientsById.get(clientId))
    .filter((client): client is NonNullable<typeof client> => Boolean(client))
}

export const normalizeClientPayload = (payload: Record<string, any>, requireIdentityFields = true) => {
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
