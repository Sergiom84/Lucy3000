import { describe, expect, it } from 'vitest'
import { createAppointmentBodySchema } from '../../../src/backend/validators/appointment.schemas'
import { createBonoAppointmentBodySchema } from '../../../src/backend/validators/bono.schemas'

const baseAppointmentPayload = {
  clientId: '53f246c7-7f24-4edd-ba4e-741ce457b872',
  guestName: null,
  guestPhone: null,
  serviceId: '1c95c98f-bde0-4c9f-833d-a8fe46f43a41',
  userId: 'admin-001',
  cabin: 'LUCY' as const,
  professional: 'LUCY' as const,
  date: '2026-03-31T00:00:00.000Z',
  startTime: '12:24',
  endTime: '12:39',
  status: 'SCHEDULED' as const,
  notes: null,
  reminder: true
}

describe('appointment schemas', () => {
  it('accepts legacy non-UUID user ids when creating appointments', () => {
    const result = createAppointmentBodySchema.safeParse(baseAppointmentPayload)

    expect(result.success).toBe(true)
  })

  it('accepts guest appointments with guest name and phone', () => {
    const result = createAppointmentBodySchema.safeParse({
      ...baseAppointmentPayload,
      clientId: null,
      guestName: 'Cliente puntual',
      guestPhone: '600123123'
    })

    expect(result.success).toBe(true)
  })

  it('rejects mixed registered client and guest data', () => {
    const result = createAppointmentBodySchema.safeParse({
      ...baseAppointmentPayload,
      guestName: 'Cliente puntual',
      guestPhone: '600123123'
    })

    expect(result.success).toBe(false)
  })

  it('rejects guest appointments without phone or name', () => {
    const missingPhone = createAppointmentBodySchema.safeParse({
      ...baseAppointmentPayload,
      clientId: null,
      guestName: 'Cliente puntual',
      guestPhone: null
    })
    const missingName = createAppointmentBodySchema.safeParse({
      ...baseAppointmentPayload,
      clientId: null,
      guestName: null,
      guestPhone: '600123123'
    })

    expect(missingPhone.success).toBe(false)
    expect(missingName.success).toBe(false)
  })

  it('accepts legacy non-UUID user ids when creating bono appointments', () => {
    const result = createBonoAppointmentBodySchema.safeParse({
      serviceId: baseAppointmentPayload.serviceId,
      userId: 'admin-001',
      cabin: 'LUCY',
      date: baseAppointmentPayload.date,
      startTime: baseAppointmentPayload.startTime,
      endTime: baseAppointmentPayload.endTime,
      status: 'SCHEDULED',
      notes: null,
      reminder: true
    })

    expect(result.success).toBe(true)
  })
})
