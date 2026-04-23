import { Prisma } from '@prisma/client'
import { prisma } from '../../db'
import { googleCalendarService } from '../../services/googleCalendar.service'
import { isActiveAppointmentStatus } from '../../utils/appointment-validation'
import { logWarn } from '../../utils/logger'
import { ClientModuleError } from './errors'
import {
  buildSearchTerms,
  getOrderedClientIds,
  loadClientsByOrderedIds,
  normalizeClientSortBy,
  normalizeClientSortDirection
} from './shared'

const reconcileCancelledAppointmentsFromGoogle = async (
  appointments: Array<{ id: string; status: string; googleCalendarEventId?: string | null }>
) => {
  const candidates = appointments.filter(
    (appointment) => isActiveAppointmentStatus(appointment.status) && Boolean(appointment.googleCalendarEventId)
  )

  if (candidates.length === 0) {
    return false
  }

  let changed = false

  for (const appointment of candidates) {
    const remoteState = await googleCalendarService.getAppointmentEventState(appointment.googleCalendarEventId || null)

    if (remoteState === 'CANCELLED' || remoteState === 'MISSING') {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'CANCELLED',
          googleCalendarEventId: remoteState === 'MISSING' ? null : appointment.googleCalendarEventId || null,
          googleCalendarSyncStatus: 'SYNCED',
          googleCalendarSyncError: null,
          googleCalendarSyncedAt: new Date()
        }
      })
      changed = true
      continue
    }

    if (remoteState === 'ERROR') {
      logWarn('Unable to reconcile appointment status from Google Calendar', {
        appointmentId: appointment.id
      })
    }
  }

  return changed
}

export const listClients = async (query: {
  search?: unknown
  isActive?: unknown
  pendingOnly?: unknown
  paginated?: unknown
  page?: unknown
  limit?: unknown
  includeCounts?: unknown
  sortBy?: unknown
  sortDirection?: unknown
}) => {
  const { search, isActive, pendingOnly, paginated, page, limit, includeCounts, sortBy, sortDirection } = query
  const normalizedSearch = typeof search === 'string' ? search.trim() : ''
  const searchTerms = normalizedSearch ? buildSearchTerms(normalizedSearch) : []
  const shouldPaginate = typeof paginated === 'boolean' ? paginated : paginated === 'true'
  const shouldIncludeCounts = typeof includeCounts === 'boolean' ? includeCounts : includeCounts !== 'false'
  const normalizedSortBy = normalizeClientSortBy(sortBy)
  const normalizedSortDirection = normalizeClientSortDirection(normalizedSortBy, sortDirection)
  const isActiveFilter =
    isActive !== undefined ? (typeof isActive === 'boolean' ? isActive : isActive === 'true') : undefined
  const pendingOnlyFilter =
    pendingOnly !== undefined
      ? (typeof pendingOnly === 'boolean' ? pendingOnly : pendingOnly === 'true')
      : false

  const baseWhere: Prisma.ClientWhereInput = {}

  if (normalizedSearch) {
    baseWhere.AND = searchTerms.map((term) => ({
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

  if (isActiveFilter !== undefined) {
    baseWhere.isActive = isActiveFilter
  }

  const listWhere: Prisma.ClientWhereInput = pendingOnlyFilter
    ? {
        AND: [baseWhere, { pendingAmount: { gt: 0 } }]
      }
    : baseWhere

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
    const pageSize = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(10, parsedLimit)) : 50
    const skip = (pageNumber - 1) * pageSize

    const [total, summaryTotal, activeCount, debtAlertCount, orderedClientIds] = await Promise.all([
      prisma.client.count({ where: listWhere }),
      prisma.client.count({ where: baseWhere }),
      prisma.client.count({
        where: {
          AND: [baseWhere, { isActive: true }]
        }
      }),
      prisma.client.count({
        where: {
          AND: [baseWhere, { pendingAmount: { gt: 0 } }]
        }
      }),
      getOrderedClientIds({
        searchTerms,
        isActive: isActiveFilter,
        pendingOnly: pendingOnlyFilter,
        sortBy: normalizedSortBy,
        sortDirection: normalizedSortDirection,
        skip,
        take: pageSize
      })
    ])
    const clients = await loadClientsByOrderedIds({
      clientIds: orderedClientIds,
      include
    })

    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return {
      data: clients,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages
      },
      summary: {
        total: summaryTotal,
        active: activeCount,
        debtAlerts: debtAlertCount
      }
    }
  }

  const orderedClientIds = await getOrderedClientIds({
    searchTerms,
    isActive: isActiveFilter,
    pendingOnly: pendingOnlyFilter,
    sortBy: normalizedSortBy,
    sortDirection: normalizedSortDirection
  })

  return loadClientsByOrderedIds({
    clientIds: orderedClientIds,
    include
  })
}

export const getClientByIdOrThrow = async (id: string) => {
  const clientDetailInclude = {
    appointments: {
      include: {
        service: true,
        user: {
          select: { name: true }
        },
        sale: {
          select: {
            id: true,
            status: true,
            paymentMethod: true
          }
        }
      },
      orderBy: { date: 'desc' as const },
      take: 50
    },
    sales: {
      include: {
        items: true,
        pendingPayment: {
          include: {
            collections: {
              orderBy: [{ operationDate: 'desc' as const }, { createdAt: 'desc' as const }],
              select: {
                id: true,
                amount: true,
                paymentMethod: true,
                showInOfficialCash: true,
                operationDate: true,
                createdAt: true
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' as const },
      take: 10
    },
    pendingPayments: {
      include: {
        collections: {
          orderBy: [{ operationDate: 'desc' as const }, { createdAt: 'desc' as const }],
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            showInOfficialCash: true,
            operationDate: true,
            createdAt: true
          }
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            date: true,
            total: true,
            status: true,
            paymentMethod: true,
            notes: true,
            items: {
              select: {
                description: true,
                quantity: true,
                product: {
                  select: {
                    name: true
                  }
                },
                service: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [{ createdAt: 'desc' as const }]
    },
    clientHistory: {
      orderBy: { date: 'desc' as const }
    },
    bonoPacks: {
      where: { clientId: id },
      include: {
        service: { select: { id: true, name: true } },
        sessions: {
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
      },
      orderBy: { purchaseDate: 'desc' as const }
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
  } satisfies Prisma.ClientInclude

  let client = await prisma.client.findUnique({
    where: { id },
    include: clientDetailInclude
  })

  if (!client) {
    throw new ClientModuleError(404, 'Client not found')
  }

  const refreshedFromGoogle = await reconcileCancelledAppointmentsFromGoogle(client.appointments)

  if (refreshedFromGoogle) {
    client = await prisma.client.findUnique({
      where: { id },
      include: clientDetailInclude
    })

    if (!client) {
      throw new ClientModuleError(404, 'Client not found')
    }
  }

  return client
}

export const listBirthdaysThisMonth = async (currentDate = new Date()) => {
  const currentMonth = currentDate.getMonth() + 1

  const clients = await prisma.client.findMany({
    where: {
      isActive: true,
      birthDate: {
        not: null
      }
    }
  })

  return clients.filter((client) => {
    if (!client.birthDate) return false
    const birthMonth = new Date(client.birthDate).getMonth() + 1
    return birthMonth === currentMonth
  })
}
