import { Prisma } from '@prisma/client'
import { prisma } from '../../db'
import {
  appointmentCalendarSyncInclude
} from '../../utils/appointment-calendar'
import {
  deriveAppointmentServiceIds
} from '../../utils/appointment-services'
import {
  type ComparableBonoTemplate,
  doesAppointmentMatchBonoService
} from '../../utils/bonoServiceMatch'
import { getDefaultProfessionalName, normalizeProfessionalName } from '../../utils/professional-catalog'

export const appointmentInclude = {
  ...appointmentCalendarSyncInclude,
  bonoSessions: {
    orderBy: { sessionNumber: 'asc' as const },
    select: {
      id: true,
      bonoPackId: true,
      sessionNumber: true,
      status: true,
      consumedAt: true,
      appointmentId: true,
      bonoPack: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  sale: {
    select: {
      id: true,
      saleNumber: true,
      total: true,
      paymentMethod: true,
      paymentBreakdown: true,
      status: true,
      date: true,
      pendingPayment: {
        select: {
          collections: {
            select: {
              amount: true,
              paymentMethod: true,
              showInOfficialCash: true,
              operationDate: true,
              createdAt: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.AppointmentInclude

export type AppointmentRecord = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude
}>

export const appointmentChargeBonoPackInclude = {
  service: {
    select: {
      id: true,
      name: true,
      category: true,
      serviceCode: true
    }
  },
  sessions: {
    orderBy: { sessionNumber: 'asc' as const },
    select: {
      id: true,
      appointmentId: true,
      sessionNumber: true,
      status: true
    }
  }
} satisfies Prisma.BonoPackInclude

export type AppointmentChargeBonoPack = Prisma.BonoPackGetPayload<{
  include: typeof appointmentChargeBonoPackInclude
}>

const toDate = (value: string | Date) => new Date(value)

export const normalizeNullableText = (value: unknown) => {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

export const normalizeNullableId = (value: unknown) => {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

const hasText = (value: unknown) => Boolean(String(value ?? '').trim())

export const resolveProfessionalName = async (_userId: unknown, professional: unknown) => {
  const normalizedProfessional = normalizeProfessionalName(professional)
  if (normalizedProfessional) {
    return normalizedProfessional
  }

  const defaultProfessional = await getDefaultProfessionalName()
  if (defaultProfessional) {
    return defaultProfessional
  }

  return ''
}

const appointmentServiceSelection = {
  id: true,
  name: true,
  duration: true,
  category: true,
  serviceCode: true
} satisfies Prisma.ServiceSelect

export type SelectedAppointmentService = Prisma.ServiceGetPayload<{
  select: typeof appointmentServiceSelection
}>

export const getExistingAppointmentServiceIds = (appointment: {
  serviceId?: string | null
  appointmentServices?: Array<{ serviceId?: string | null }> | null
}) => {
  const nestedServiceIds = Array.isArray(appointment.appointmentServices)
    ? appointment.appointmentServices
        .map((item) => String(item.serviceId || '').trim())
        .filter(Boolean)
    : []

  if (nestedServiceIds.length > 0) {
    return nestedServiceIds
  }

  const fallbackServiceId = String(appointment.serviceId || '').trim()
  return fallbackServiceId ? [fallbackServiceId] : []
}

const getExistingAppointmentComparableServices = (appointment: {
  serviceId?: string | null
  service?: {
    id?: string | null
    name?: string | null
    category?: string | null
    serviceCode?: string | null
  } | null
  appointmentServices?:
    | Array<{
        serviceId?: string | null
        service?: {
          id?: string | null
          name?: string | null
          category?: string | null
          serviceCode?: string | null
        } | null
      }>
    | null
}) => {
  const nestedServices = Array.isArray(appointment.appointmentServices)
    ? appointment.appointmentServices
        .map((item) => ({
          id: String(item.serviceId || item.service?.id || '').trim() || null,
          name: item.service?.name || null,
          category: item.service?.category || null,
          serviceCode: item.service?.serviceCode || null
        }))
        .filter((service) => Boolean(service.id || service.name))
    : []

  if (nestedServices.length > 0) {
    return nestedServices
  }

  const fallbackServiceId = String(appointment.serviceId || appointment.service?.id || '').trim()
  const fallbackServiceName = appointment.service?.name || null
  return fallbackServiceId || fallbackServiceName
    ? [
        {
          id: fallbackServiceId || null,
          name: fallbackServiceName,
          category: appointment.service?.category || null,
          serviceCode: appointment.service?.serviceCode || null
        }
      ]
    : []
}

const getAvailableBonoSessionCount = (bonoPack: AppointmentChargeBonoPack) =>
  bonoPack.sessions.filter((session) => session.status === 'AVAILABLE').length

export const getAppointmentConsumedBonoSessions = (appointment: {
  bonoSessions?: Array<{ status?: string | null }> | null
}) =>
  Array.isArray(appointment.bonoSessions)
    ? appointment.bonoSessions.filter((session) => String(session.status || '').toUpperCase() === 'CONSUMED')
    : []

const resolveBonoPackComparableService = (
  bonoPack: AppointmentChargeBonoPack,
  bonoTemplates: ComparableBonoTemplate[]
) => {
  const explicitTemplateId = normalizeNullableId(bonoPack.bonoTemplateId)
  const explicitTemplate =
    explicitTemplateId
      ? bonoTemplates.find((template) => normalizeNullableId(template?.id) === explicitTemplateId) || null
      : null

  return {
    id: explicitTemplate?.serviceId || bonoPack.serviceId || bonoPack.service?.id || null,
    name: explicitTemplate?.serviceName || bonoPack.service?.name || null,
    category: explicitTemplate?.category || bonoPack.service?.category || null,
    serviceCode: explicitTemplate?.serviceLookup || bonoPack.service?.serviceCode || null
  }
}

export const buildAppointmentBonoOptions = (
  appointment: {
    id: string
    clientId?: string | null
    serviceId?: string | null
    service?: {
      id?: string | null
      name?: string | null
      category?: string | null
      serviceCode?: string | null
    } | null
    appointmentServices?:
      | Array<{
          serviceId?: string | null
          service?: {
            id?: string | null
            name?: string | null
            category?: string | null
            serviceCode?: string | null
          } | null
        }>
      | null
  },
  bonoPacks: AppointmentChargeBonoPack[],
  bonoTemplates: ComparableBonoTemplate[] = []
) => {
  const appointmentServices = getExistingAppointmentComparableServices(appointment)

  return bonoPacks
    .map((bonoPack) => {
      const linkedSessions = bonoPack.sessions.filter(
        (session) => session.status === 'AVAILABLE' && session.appointmentId === appointment.id
      )
      const freeSessions = bonoPack.sessions.filter(
        (session) => session.status === 'AVAILABLE' && session.appointmentId === null
      )
      const comparableBonoService = resolveBonoPackComparableService(bonoPack, bonoTemplates)
      const serviceMatches = doesAppointmentMatchBonoService(appointmentServices, comparableBonoService, {
        templates: bonoTemplates,
        allowGenericBono: false
      })
      const chargeableSessions = serviceMatches ? [...linkedSessions, ...freeSessions] : []

      return {
        bonoPack,
        linkedSessions,
        chargeableSessions,
        remainingSessions: getAvailableBonoSessionCount(bonoPack),
        serviceMatches,
        comparableBonoService
      }
    })
    .filter((item) => item.chargeableSessions.length > 0 && item.remainingSessions > 0)
    .sort((left, right) => {
      if (Boolean(left.linkedSessions.length) !== Boolean(right.linkedSessions.length)) {
        return left.linkedSessions.length > 0 ? -1 : 1
      }

      if (left.serviceMatches !== right.serviceMatches) {
        return left.serviceMatches ? -1 : 1
      }

      return left.bonoPack.name.localeCompare(right.bonoPack.name, 'es', { sensitivity: 'base' })
    })
}

export const loadSelectedAppointmentServices = async (serviceIds: string[]) => {
  const normalizedServiceIds = deriveAppointmentServiceIds({ serviceIds })
  if (normalizedServiceIds.length === 0) {
    return []
  }

  const services = await prisma.service.findMany({
    where: {
      id: {
        in: normalizedServiceIds
      }
    },
    select: appointmentServiceSelection
  })

  const servicesById = new Map(services.map((service) => [service.id, service]))
  const orderedServices = normalizedServiceIds
    .map((serviceId) => servicesById.get(serviceId) || null)
    .filter((service): service is SelectedAppointmentService => Boolean(service))

  if (orderedServices.length !== normalizedServiceIds.length) {
    throw new Error('Uno o más servicios seleccionados no existen')
  }

  return orderedServices
}

export const buildAppointmentServicesCreateData = (serviceIds: string[]) =>
  serviceIds.map((serviceId, index) => ({
    serviceId,
    sortOrder: index
  }))

export const buildAppointmentPayload = (
  payload: Record<string, unknown>,
  options: { serviceId: string; endTime: string }
): Prisma.AppointmentUncheckedCreateInput => {
  const clientId = normalizeNullableId(payload.clientId)

  return {
    clientId,
    guestName: clientId ? null : normalizeNullableText(payload.guestName),
    guestPhone: clientId ? null : normalizeNullableText(payload.guestPhone),
    userId: String(payload.userId),
    serviceId: options.serviceId,
    cabin: payload.cabin as string,
    professional: normalizeProfessionalName(payload.professional),
    date: toDate(String(payload.date)),
    startTime: String(payload.startTime),
    endTime: options.endTime,
    status: payload.status as string,
    notes: payload.notes ? String(payload.notes) : null,
    reminder: payload.reminder === undefined ? true : Boolean(payload.reminder)
  }
}

export const buildAppointmentUpdatePayload = (
  payload: Record<string, unknown>,
  options: { serviceId?: string; endTime?: string } = {}
): Prisma.AppointmentUncheckedUpdateInput => {
  const data: Prisma.AppointmentUncheckedUpdateInput = {}

  if (payload.clientId !== undefined) data.clientId = normalizeNullableId(payload.clientId)
  if (payload.guestName !== undefined) data.guestName = normalizeNullableText(payload.guestName)
  if (payload.guestPhone !== undefined) data.guestPhone = normalizeNullableText(payload.guestPhone)
  if (payload.userId !== undefined) data.userId = String(payload.userId)
  if (options.serviceId !== undefined) data.serviceId = options.serviceId
  if (payload.cabin !== undefined) data.cabin = payload.cabin as string
  if (payload.professional !== undefined) data.professional = normalizeProfessionalName(payload.professional)
  if (payload.date !== undefined) data.date = toDate(String(payload.date))
  if (payload.startTime !== undefined) data.startTime = String(payload.startTime)
  if (options.endTime !== undefined) data.endTime = options.endTime
  if (payload.status !== undefined) data.status = payload.status as string
  if (payload.notes !== undefined) data.notes = payload.notes ? String(payload.notes) : null
  if (payload.reminder !== undefined) data.reminder = Boolean(payload.reminder)

  return data
}

export const validateAppointmentPartyUpdate = (
  existing: {
    clientId?: string | null
    guestName?: string | null
    guestPhone?: string | null
  },
  updateData: Prisma.AppointmentUncheckedUpdateInput
) => {
  const existingIsGuest = !existing.clientId
  const nextClientId =
    updateData.clientId !== undefined ? (updateData.clientId as string | null) : existing.clientId || null
  const nextGuestName =
    updateData.guestName !== undefined ? (updateData.guestName as string | null) : existing.guestName || null
  const nextGuestPhone =
    updateData.guestPhone !== undefined ? (updateData.guestPhone as string | null) : existing.guestPhone || null
  const nextIsGuest = !nextClientId

  if (existingIsGuest !== nextIsGuest) {
    return 'No se puede cambiar una cita entre cliente registrado y cliente puntual'
  }

  if (!nextIsGuest && (hasText(nextGuestName) || hasText(nextGuestPhone))) {
    return 'Las citas de clientes registrados no pueden incluir datos de cliente puntual'
  }

  if (nextIsGuest && (!hasText(nextGuestName) || !hasText(nextGuestPhone))) {
    return 'Las citas puntuales deben conservar nombre y telefono'
  }

  return null
}

export const releaseReservedBonoSessions = async (appointmentId: string) => {
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

export const buildAppointmentsWhere = (query: {
  startDate?: unknown
  endDate?: unknown
  status?: unknown
  clientId?: unknown
  cabin?: unknown
}) => {
  const where: Prisma.AppointmentWhereInput = {}

  if (query.startDate && query.endDate) {
    where.date = {
      gte: new Date(String(query.startDate)),
      lte: new Date(String(query.endDate))
    }
  }

  if (query.status) where.status = String(query.status)
  if (query.clientId) where.clientId = String(query.clientId)
  if (query.cabin) where.cabin = String(query.cabin)

  return where
}
