import { PrismaClient } from '@prisma/client'
import { normalizeProfessionalName } from './professional-catalog'

export const ACTIVE_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const

const BUSINESS_DAY_START_MINUTES = 8 * 60
const BUSINESS_DAY_END_MINUTES = 22 * 60
const BREAK_START_MINUTES = 14 * 60
const BREAK_END_MINUTES = 16 * 60

const PROFESSIONAL_LABELS: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CHEMA: 'Chema',
  OTROS: 'Otros'
}

const CABIN_LABELS: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

interface AppointmentSlotInput {
  date: Date
  startTime: string
  endTime: string
  professional: string
  cabin: string
  excludeAppointmentId?: string
  excludeAgendaBlockId?: string
  allowPastDate?: boolean
}

interface ValidationIssue {
  code: string
  message: string
}

interface ValidationResult {
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const startOfDay = (value: Date) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const endOfDay = (value: Date) => {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

const formatProfessionalLabel = (professional: string) =>
  PROFESSIONAL_LABELS[professional] || normalizeProfessionalName(professional) || professional

const formatCabinLabel = (cabin: string) => CABIN_LABELS[cabin] || cabin

const buildProfessionalVariants = (professional: string) => {
  const variants = new Set([
    String(professional || '').trim(),
    normalizeProfessionalName(professional),
    String(professional || '').trim().toLocaleUpperCase('es-ES')
  ])

  return [...variants].filter(Boolean)
}

export const isActiveAppointmentStatus = (status: string | null | undefined) =>
  ACTIVE_APPOINTMENT_STATUSES.includes(
    String(status || '').toUpperCase() as (typeof ACTIVE_APPOINTMENT_STATUSES)[number]
  )

export async function validateAppointmentSlot(
  input: AppointmentSlotInput,
  prisma: PrismaClient
): Promise<ValidationResult> {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  const {
    date,
    startTime,
    endTime,
    professional,
    cabin,
    excludeAppointmentId,
    excludeAgendaBlockId,
    allowPastDate
  } = input
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)

  if (startMinutes >= endMinutes) {
    errors.push({
      code: 'INVALID_TIME_RANGE',
      message: 'La hora de inicio debe ser anterior a la hora de fin'
    })
    return { errors, warnings }
  }

  if (startMinutes < BUSINESS_DAY_START_MINUTES || endMinutes > BUSINESS_DAY_END_MINUTES) {
    errors.push({
      code: 'INVALID_HOURS',
      message: 'El horario debe estar entre 08:00 y 22:00'
    })
  }

  const now = new Date()
  const appointmentDate = startOfDay(date)
  const today = startOfDay(now)

  if (!allowPastDate) {
    if (appointmentDate < today) {
      errors.push({
        code: 'PAST_DATETIME',
        message: 'No se puede crear una cita en el pasado'
      })
    } else if (appointmentDate.getTime() === today.getTime()) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      if (startMinutes < nowMinutes) {
        errors.push({
          code: 'PAST_DATETIME',
          message: 'No se puede crear una cita en el pasado'
        })
      }
    }
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  if (startMinutes >= BREAK_START_MINUTES && startMinutes < BREAK_END_MINUTES) {
    warnings.push({
      code: 'OUTSIDE_BUSINESS_HOURS',
      message: 'La hora seleccionada coincide con la franja de descanso habitual (14:00-16:00)'
    })
  }

  const slotStart = startOfDay(date)
  const slotEnd = endOfDay(date)

  const baseWhere = {
    date: { gte: slotStart, lte: slotEnd },
    status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
    startTime: { lt: endTime },
    endTime: { gt: startTime },
    ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
  }

  const [professionalConflicts, cabinConflicts, professionalBlockConflicts, cabinBlockConflicts] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...baseWhere,
        professional: {
          in: buildProfessionalVariants(professional)
        }
      },
      select: { startTime: true, endTime: true }
    }),
    prisma.appointment.findMany({
      where: { ...baseWhere, cabin },
      select: { startTime: true, endTime: true }
    }),
    prisma.agendaBlock.findMany({
      where: {
        date: { gte: slotStart, lte: slotEnd },
        professional: {
          in: buildProfessionalVariants(professional)
        },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        ...(excludeAgendaBlockId ? { id: { not: excludeAgendaBlockId } } : {})
      },
      select: { startTime: true, endTime: true }
    }),
    prisma.agendaBlock.findMany({
      where: {
        date: { gte: slotStart, lte: slotEnd },
        cabin,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        ...(excludeAgendaBlockId ? { id: { not: excludeAgendaBlockId } } : {})
      },
      select: { startTime: true, endTime: true }
    })
  ])

  for (const conflict of professionalConflicts) {
    errors.push({
      code: 'PROFESSIONAL_CONFLICT',
      message: `${formatProfessionalLabel(professional)} ya tiene una cita de ${conflict.startTime} a ${conflict.endTime}`
    })
  }

  for (const conflict of cabinConflicts) {
    errors.push({
      code: 'CABIN_CONFLICT',
      message: `La cabina ${formatCabinLabel(cabin)} ya esta ocupada de ${conflict.startTime} a ${conflict.endTime}`
    })
  }

  for (const conflict of professionalBlockConflicts) {
    errors.push({
      code: 'PROFESSIONAL_CONFLICT',
      message: `${formatProfessionalLabel(professional)} tiene un bloqueo de ${conflict.startTime} a ${conflict.endTime}`
    })
  }

  for (const conflict of cabinBlockConflicts) {
    errors.push({
      code: 'CABIN_CONFLICT',
      message: `La cabina ${formatCabinLabel(cabin)} tiene un bloqueo de ${conflict.startTime} a ${conflict.endTime}`
    })
  }

  return { errors, warnings }
}
