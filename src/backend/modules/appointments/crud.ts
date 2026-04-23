import { prisma } from '../../db'
import { calculateAppointmentEndTime, deriveAppointmentServiceIds } from '../../utils/appointment-services'
import { isActiveAppointmentStatus, validateAppointmentSlot } from '../../utils/appointment-validation'
import { getAppointmentDisplayName } from '../../utils/customer-display'
import {
  deleteAppointmentCalendarEvent,
  syncCreatedAppointmentCalendar,
  syncUpdatedAppointmentCalendar
} from './calendarSync'
import { AppointmentModuleError } from './errors'
import {
  appointmentInclude,
  buildAppointmentPayload,
  buildAppointmentServicesCreateData,
  buildAppointmentUpdatePayload,
  getAppointmentConsumedBonoSessions,
  getExistingAppointmentServiceIds,
  loadSelectedAppointmentServices,
  normalizeNullableId,
  releaseReservedBonoSessions,
  resolveProfessionalName,
  validateAppointmentPartyUpdate
} from './shared'

const toServiceSelectionError = (error: unknown) =>
  new AppointmentModuleError(400, error instanceof Error ? error.message : 'Servicios no válidos')

const buildSchedulingError = (validation: Awaited<ReturnType<typeof validateAppointmentSlot>>) => {
  const statusCode = validation.errors[0].code.includes('CONFLICT') ? 409 : 400

  return new AppointmentModuleError(statusCode, {
    error: validation.errors[0].message,
    code: validation.errors[0].code,
    allErrors: validation.errors,
    warnings: validation.warnings
  })
}

export const createAppointmentRecord = async (payload: Record<string, unknown>) => {
  const requestedServiceIds = deriveAppointmentServiceIds(payload)
  let selectedServices

  try {
    selectedServices = await loadSelectedAppointmentServices(requestedServiceIds)
  } catch (error) {
    throw toServiceSelectionError(error)
  }

  if (selectedServices.length === 0) {
    throw new AppointmentModuleError(400, 'Debe seleccionar al menos un servicio')
  }

  const selectedServiceIds = selectedServices.map((service) => service.id)
  const computedEndTime = calculateAppointmentEndTime(
    String(payload.startTime || ''),
    selectedServices.reduce((total, service) => total + Math.max(0, Number(service.duration || 0)), 0)
  )
  const data = buildAppointmentPayload(payload, {
    serviceId: selectedServiceIds[0],
    endTime: computedEndTime
  })
  const resolvedProfessional = await resolveProfessionalName(data.userId, data.professional)

  if (!resolvedProfessional) {
    throw new AppointmentModuleError(400, 'Debe indicar un profesional valido')
  }

  data.professional = resolvedProfessional

  const validation = await validateAppointmentSlot(
    {
      date: data.date as Date,
      startTime: data.startTime as string,
      endTime: data.endTime as string,
      professional: resolvedProfessional,
      cabin: data.cabin as string
    },
    prisma
  )

  if (validation.errors.length > 0) {
    throw buildSchedulingError(validation)
  }

  const createdAppointment = await prisma.appointment.create({
    data: {
      ...data,
      appointmentServices: {
        create: buildAppointmentServicesCreateData(selectedServiceIds)
      }
    },
    include: appointmentInclude
  })
  const appointment = await syncCreatedAppointmentCalendar(createdAppointment)

  if (data.reminder) {
    const appointmentName = getAppointmentDisplayName(appointment)
    await prisma.notification.create({
      data: {
        type: 'APPOINTMENT',
        title: 'Nueva cita programada',
        message: `Cita con ${appointmentName} el ${new Date(appointment.date).toLocaleDateString()}`,
        priority: 'NORMAL'
      }
    })
  }

  return appointment
}

export const updateAppointmentRecord = async (id: string, payload: Record<string, unknown>) => {
  const existing = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude
  })

  if (!existing) {
    throw new AppointmentModuleError(404, 'Appointment not found')
  }

  const nextServiceIds = deriveAppointmentServiceIds(payload, getExistingAppointmentServiceIds(existing))
  let selectedServices

  try {
    selectedServices = await loadSelectedAppointmentServices(nextServiceIds)
  } catch (error) {
    throw toServiceSelectionError(error)
  }

  if (selectedServices.length === 0) {
    throw new AppointmentModuleError(400, 'Debe seleccionar al menos un servicio')
  }

  const serviceSelectionChanged = payload.serviceId !== undefined || payload.serviceIds !== undefined
  const shouldRecalculateEndTime = serviceSelectionChanged || payload.startTime !== undefined
  const updateData = buildAppointmentUpdatePayload(payload, {
    serviceId: selectedServices[0].id,
    endTime: shouldRecalculateEndTime
      ? calculateAppointmentEndTime(
          String(payload.startTime || existing.startTime),
          selectedServices.reduce((total, service) => total + Math.max(0, Number(service.duration || 0)), 0)
        )
      : undefined
  })
  const partyValidationError = validateAppointmentPartyUpdate(existing, updateData)

  if (partyValidationError) {
    throw new AppointmentModuleError(400, partyValidationError)
  }

  const schedulingFieldChanged =
    updateData.date !== undefined ||
    updateData.startTime !== undefined ||
    updateData.endTime !== undefined ||
    updateData.professional !== undefined ||
    updateData.cabin !== undefined
  const nextStatus = String(updateData.status ?? existing.status)
  const shouldValidateScheduling =
    schedulingFieldChanged ||
    (!isActiveAppointmentStatus(existing.status) && isActiveAppointmentStatus(nextStatus))

  if (shouldValidateScheduling) {
    const validation = await validateAppointmentSlot(
      {
        date: (updateData.date as Date) || existing.date,
        startTime: (updateData.startTime as string) || existing.startTime,
        endTime: (updateData.endTime as string) || existing.endTime,
        professional: (updateData.professional as string) || existing.professional,
        cabin: (updateData.cabin as string) || existing.cabin,
        excludeAppointmentId: id
      },
      prisma
    )

    if (validation.errors.length > 0) {
      throw buildSchedulingError(validation)
    }
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id },
    data: {
      ...updateData,
      ...(serviceSelectionChanged
        ? {
            appointmentServices: {
              deleteMany: {},
              create: buildAppointmentServicesCreateData(selectedServices.map((service) => service.id))
            }
          }
        : {})
    },
    include: appointmentInclude
  })

  const movedToCancelled =
    updatedAppointment.status === 'CANCELLED' || updatedAppointment.status === 'NO_SHOW'
  const registeredClientChanged =
    updateData.clientId !== undefined &&
    normalizeNullableId(updateData.clientId) !== normalizeNullableId(existing.clientId)

  if (movedToCancelled) {
    await releaseReservedBonoSessions(updatedAppointment.id)
  } else if (serviceSelectionChanged || registeredClientChanged) {
    await releaseReservedBonoSessions(updatedAppointment.id)
  }
  const appointment = await syncUpdatedAppointmentCalendar(updatedAppointment)

  return appointment
}

export const deleteAppointmentRecord = async (id: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      bonoSessions: { select: { id: true, status: true } },
      sale: { select: { id: true, status: true } },
      client: true,
      service: true
    }
  })

  if (!appointment) {
    throw new AppointmentModuleError(404, 'Appointment not found')
  }

  if (appointment.sale?.status === 'COMPLETED') {
    throw new AppointmentModuleError(400, 'Cannot delete an appointment with a completed sale linked')
  }

  if (getAppointmentConsumedBonoSessions(appointment).length > 0) {
    throw new AppointmentModuleError(400, 'Cannot delete an appointment with a consumed bono linked')
  }

  if (Array.isArray(appointment.bonoSessions) && appointment.bonoSessions.some((session) => session.status === 'AVAILABLE')) {
    await releaseReservedBonoSessions(appointment.id)
  }
  await deleteAppointmentCalendarEvent(appointment)

  await prisma.appointment.delete({
    where: { id }
  })

  return { message: 'Appointment deleted successfully' }
}
