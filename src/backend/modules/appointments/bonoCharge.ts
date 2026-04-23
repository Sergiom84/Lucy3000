import { prisma } from '../../db'
import { getAppointmentServiceLabel } from '../../utils/appointment-services'
import { readAppointmentBonoTemplates } from '../../utils/bonoTemplateCatalog'
import { AppointmentModuleError } from './errors'
import {
  appointmentChargeBonoPackInclude,
  appointmentInclude,
  buildAppointmentBonoOptions,
  getAppointmentConsumedBonoSessions
} from './shared'

export const chargeAppointmentWithBonoPack = async (
  id: string,
  payload: { bonoPackId?: unknown; sessionsToConsume?: unknown }
) => {
  const requestedBonoPackId = String(payload.bonoPackId || '').trim() || null
  const requestedSessionsToConsume = Math.max(1, Number.parseInt(String(payload.sessionsToConsume ?? '1'), 10) || 1)

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude
  })

  if (!appointment) {
    throw new AppointmentModuleError(404, 'Appointment not found')
  }

  if (!appointment.clientId) {
    throw new AppointmentModuleError(400, 'Solo se pueden cobrar bonos en citas con cliente registrado')
  }

  if (appointment.sale) {
    throw new AppointmentModuleError(400, 'La cita ya está vinculada a una venta y no puede cobrarse con bono')
  }

  const appointmentStatus = String(appointment.status || '').toUpperCase()
  if (appointmentStatus === 'CANCELLED' || appointmentStatus === 'NO_SHOW') {
    throw new AppointmentModuleError(400, 'No se puede cobrar un bono en una cita cancelada o no acudida')
  }

  if (getAppointmentConsumedBonoSessions(appointment).length > 0) {
    throw new AppointmentModuleError(400, 'La cita ya está cobrada con bono')
  }

  const bonoPacks = await prisma.bonoPack.findMany({
    where: {
      clientId: appointment.clientId,
      status: 'ACTIVE'
    },
    include: appointmentChargeBonoPackInclude,
    orderBy: {
      purchaseDate: 'desc'
    }
  })

  const bonoTemplates = await readAppointmentBonoTemplates()
  const appointmentBonoOptions = buildAppointmentBonoOptions(appointment, bonoPacks, bonoTemplates)

  if (appointmentBonoOptions.length === 0) {
    throw new AppointmentModuleError(400, 'No hay bonos activos compatibles para esta cita')
  }

  const selectedOption = requestedBonoPackId
    ? appointmentBonoOptions.find((option) => option.bonoPack.id === requestedBonoPackId) || null
    : appointmentBonoOptions.length === 1
      ? appointmentBonoOptions[0]
      : null

  if (requestedBonoPackId && !selectedOption) {
    throw new AppointmentModuleError(400, 'El bono seleccionado no es compatible con esta cita')
  }

  if (!selectedOption) {
    throw new AppointmentModuleError(409, {
      error: 'Hay varios bonos compatibles para esta cita. Selecciona cuál quieres descontar.',
      bonoOptions: appointmentBonoOptions.map((option) => ({
        id: option.bonoPack.id,
        name: option.bonoPack.name,
        serviceName: option.bonoPack.service?.name || null,
        remainingSessions: option.remainingSessions,
        chargeableSessions: option.chargeableSessions.length,
        isReservedForAppointment: option.linkedSessions.length > 0,
        reservedSessionNumber: option.linkedSessions[0]?.sessionNumber || null
      }))
    })
  }

  if (selectedOption.chargeableSessions.length === 0) {
    throw new AppointmentModuleError(400, 'No hay sesiones disponibles para el bono seleccionado')
  }

  if (requestedSessionsToConsume > selectedOption.chargeableSessions.length) {
    throw new AppointmentModuleError(
      400,
      `No hay suficientes sesiones disponibles para descontar ${requestedSessionsToConsume}. Máximo disponible: ${selectedOption.chargeableSessions.length}.`
    )
  }

  const consumedAt = new Date()
  const serviceLabel = getAppointmentServiceLabel(appointment) || selectedOption.bonoPack.name
  const sessionsToConsume = selectedOption.chargeableSessions.slice(0, requestedSessionsToConsume)
  const consumedSessionNumbers = sessionsToConsume
    .map((session) => session.sessionNumber)
    .filter((sessionNumber): sessionNumber is number => Number.isFinite(sessionNumber))

  const consumedAppointment = await prisma.$transaction(async (tx) => {
    for (const session of sessionsToConsume) {
      const consumeResult = await tx.bonoSession.updateMany({
        where: {
          id: session.id,
          status: 'AVAILABLE',
          appointmentId: session.appointmentId ?? null
        },
        data: {
          appointmentId: appointment.id,
          status: 'CONSUMED',
          consumedAt
        }
      })

      if (consumeResult.count === 0) {
        throw new AppointmentModuleError(
          409,
          'Una de las sesiones del bono ya no está disponible. Recarga e inténtalo de nuevo.'
        )
      }
    }

    if (selectedOption.remainingSessions - sessionsToConsume.length === 0) {
      await tx.bonoPack.update({
        where: { id: selectedOption.bonoPack.id },
        data: { status: 'DEPLETED' }
      })

      await tx.notification.create({
        data: {
          type: 'BONO_DEPLETED',
          title: `Bono agotado: ${selectedOption.bonoPack.name}`,
          message: `El bono "${selectedOption.bonoPack.name}" de ${appointment.client?.firstName || ''} ${appointment.client?.lastName || ''}`.trim(),
          priority: 'NORMAL'
        }
      })
    }

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'COMPLETED'
      }
    })

    await tx.clientHistory.create({
      data: {
        clientId: appointment.clientId!,
        date: consumedAt,
        service: serviceLabel,
        notes:
          sessionsToConsume.length === 1
            ? `Sesion descontada del bono "${selectedOption.bonoPack.name}"`
            : `${sessionsToConsume.length} sesiones descontadas del bono "${selectedOption.bonoPack.name}"`,
        amount: 0
      }
    })

    return tx.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude
    })
  })

  if (!consumedAppointment) {
    throw new AppointmentModuleError(404, 'Appointment not found after bono charge')
  }

  return {
    ...consumedAppointment,
    bonoChargeSummary: {
      bonoPackId: selectedOption.bonoPack.id,
      bonoPackName: selectedOption.bonoPack.name,
      sessionsConsumed: sessionsToConsume.length,
      sessionNumbers: consumedSessionNumbers
    }
  }
}
