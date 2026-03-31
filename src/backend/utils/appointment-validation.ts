import { PrismaClient } from '@prisma/client'

const ACTIVE_STATUSES = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']

interface AppointmentSlotInput {
  date: Date
  startTime: string
  endTime: string
  professional: string
  cabin: string
  excludeAppointmentId?: string
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
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export async function validateAppointmentSlot(
  input: AppointmentSlotInput,
  prisma: PrismaClient
): Promise<ValidationResult> {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  const { date, startTime, endTime, professional, cabin, excludeAppointmentId } = input

  // 1. startTime must be before endTime
  if (startTime >= endTime) {
    errors.push({
      code: 'INVALID_TIME_RANGE',
      message: 'La hora de inicio debe ser anterior a la hora de fin'
    })
    return { errors, warnings }
  }

  // 2. Hours must be within 09:00 - 21:00
  if (startTime < '09:00' || endTime > '21:00') {
    errors.push({
      code: 'INVALID_HOURS',
      message: 'El horario debe estar entre las 09:00 y las 21:00'
    })
  }

  // 3. Past date/time check
  const now = new Date()
  const appointmentDate = new Date(date)
  appointmentDate.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (appointmentDate < today) {
    errors.push({
      code: 'PAST_DATETIME',
      message: 'No se puede crear una cita en el pasado'
    })
  } else if (appointmentDate.getTime() === today.getTime()) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const startMinutes = timeToMinutes(startTime)
    if (startMinutes < nowMinutes) {
      errors.push({
        code: 'PAST_DATETIME',
        message: 'No se puede crear una cita en una hora que ya ha pasado'
      })
    }
  }

  // If we already have hard errors, skip DB queries
  if (errors.length > 0) {
    return { errors, warnings }
  }

  // 4. Business hours warning (lunch gap 14:00-16:00)
  const startMinutes = timeToMinutes(startTime)
  if (startMinutes >= 840 && startMinutes < 960) {
    warnings.push({
      code: 'OUTSIDE_BUSINESS_HOURS',
      message: 'La hora seleccionada esta fuera del horario habitual (descanso 14:00-16:00)'
    })
  }

  // 5. Professional and cabin conflict checks
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const baseWhere = {
    date: { gte: startOfDay, lte: endOfDay },
    status: { in: ACTIVE_STATUSES },
    startTime: { lt: endTime },
    endTime: { gt: startTime },
    ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
  }

  const [professionalConflicts, cabinConflicts] = await Promise.all([
    prisma.appointment.findMany({
      where: { ...baseWhere, professional },
      select: { startTime: true, endTime: true, service: { select: { name: true } }, client: { select: { firstName: true } } }
    }),
    prisma.appointment.findMany({
      where: { ...baseWhere, cabin },
      select: { startTime: true, endTime: true, service: { select: { name: true } }, client: { select: { firstName: true } } }
    })
  ])

  for (const conflict of professionalConflicts) {
    errors.push({
      code: 'PROFESSIONAL_CONFLICT',
      message: `${professional} ya tiene una cita de ${conflict.startTime} a ${conflict.endTime} (${conflict.service?.name || 'servicio'})`
    })
  }

  for (const conflict of cabinConflicts) {
    errors.push({
      code: 'CABIN_CONFLICT',
      message: `La cabina ${cabin} ya esta ocupada de ${conflict.startTime} a ${conflict.endTime} (${conflict.client?.firstName || 'cliente'})`
    })
  }

  return { errors, warnings }
}
