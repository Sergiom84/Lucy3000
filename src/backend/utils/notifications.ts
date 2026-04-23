import { type Prisma } from '@prisma/client'
import { prisma } from '../db'
import type { AuthRequest } from '../middleware/auth.middleware'

export const ADMIN_ACTIVITY_NOTIFICATION_TYPE = 'ADMIN_ACTIVITY'
export const GOOGLE_CALENDAR_REVIEW_NOTIFICATION_TYPE = 'GOOGLE_CALENDAR_REVIEW'

type ResourceType = 'client' | 'product' | 'service'

const RESOURCE_COPY: Record<
  ResourceType,
  { title: string; singular: string; plural: string }
> = {
  client: {
    title: 'Actividad en clientes',
    singular: 'nuevo cliente',
    plural: 'nuevos clientes'
  },
  product: {
    title: 'Actividad en productos',
    singular: 'nuevo producto',
    plural: 'nuevos productos'
  },
  service: {
    title: 'Actividad en servicios',
    singular: 'nuevo servicio',
    plural: 'nuevos servicios'
  }
}

export const getNotificationVisibilityWhere = (
  role?: string
): Prisma.NotificationWhereInput => {
  if (role === 'ADMIN') {
    return {}
  }

  return {
    NOT: {
      type: ADMIN_ACTIVITY_NOTIFICATION_TYPE
    }
  }
}

const buildCountCopy = (count: number, singular: string, plural: string) => {
  if (count === 1) {
    return `un ${singular}`
  }

  return `${count} ${plural}`
}

export const notifyAdminsAboutResourceCreation = async (
  actor: AuthRequest['user'],
  resource: ResourceType,
  count: number
) => {
  if (!actor || actor.role === 'ADMIN' || count <= 0) {
    return
  }

  const actorRecord = await prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      name: true,
      email: true
    }
  })

  const actorLabel =
    actorRecord?.name?.trim() || actorRecord?.email || actor.email || 'Usuario desconocido'
  const copy = RESOURCE_COPY[resource]

  await prisma.notification.create({
    data: {
      type: ADMIN_ACTIVITY_NOTIFICATION_TYPE,
      title: copy.title,
      message: `El usuario ${actorLabel} ha añadido ${buildCountCopy(
        count,
        copy.singular,
        copy.plural
      )}.`,
      priority: 'NORMAL'
    }
  })
}

export const notifyGoogleCalendarLinkReviewNeeded = async (input: {
  ambiguousCount: number
  examples: string[]
}) => {
  if (input.ambiguousCount <= 0) {
    return
  }

  const exampleCopy = input.examples.filter(Boolean).slice(0, 3).join(' | ')
  const exampleSuffix = input.examples.length > 3 ? ' | ...' : ''

  await prisma.notification.create({
    data: {
      type: GOOGLE_CALENDAR_REVIEW_NOTIFICATION_TYPE,
      title: 'Google Calendar requiere revision manual',
      message: `La vinculacion manual ha dejado ${input.ambiguousCount} coincidencia${
        input.ambiguousCount === 1 ? '' : 's'
      } ambigua${input.ambiguousCount === 1 ? '' : 's'} sin enlazar. Revisa estas entradas en Configuracion > Google Calendar.${
        exampleCopy ? ` ${exampleCopy}${exampleSuffix}` : ''
      }`,
      priority: 'HIGH'
    }
  })
}
