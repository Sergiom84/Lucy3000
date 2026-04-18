import { describe, expect, it } from 'vitest'
import {
  agendaDayNotesQuerySchema,
  appointmentImportBodySchema,
  createAgendaDayNoteBodySchema,
  createAppointmentBodySchema,
  toggleAgendaDayNoteBodySchema
} from '../../../src/backend/validators/appointment.schemas'
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

  it('accepts multiple services when the first one matches legacy serviceId', () => {
    const result = createAppointmentBodySchema.safeParse({
      ...baseAppointmentPayload,
      serviceIds: [
        baseAppointmentPayload.serviceId,
        '2c95c98f-bde0-4c9f-833d-a8fe46f43a42'
      ]
    })

    expect(result.success).toBe(true)
  })

  it('rejects multiple services when legacy serviceId does not match the first item', () => {
    const result = createAppointmentBodySchema.safeParse({
      ...baseAppointmentPayload,
      serviceId: '9c95c98f-bde0-4c9f-833d-a8fe46f43a49',
      serviceIds: [
        baseAppointmentPayload.serviceId,
        '2c95c98f-bde0-4c9f-833d-a8fe46f43a42'
      ]
    })

    expect(result.success).toBe(false)
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
      serviceIds: [baseAppointmentPayload.serviceId],
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

  it('accepts preview and commit modes for appointment import flags', () => {
    const preview = appointmentImportBodySchema.safeParse({
      mode: 'preview',
      createMissingClients: 'false'
    })
    const commit = appointmentImportBodySchema.safeParse({
      mode: 'commit',
      createMissingClients: 'true'
    })

    expect(preview.success).toBe(true)
    expect(preview.success && preview.data).toEqual({
      mode: 'preview',
      createMissingClients: false
    })
    expect(commit.success).toBe(true)
    expect(commit.success && commit.data).toEqual({
      mode: 'commit',
      createMissingClients: true
    })
  })

  it('accepts agenda day note payloads and exact day keys', () => {
    const query = agendaDayNotesQuerySchema.safeParse({
      dayKey: '2026-04-18'
    })
    const createPayload = createAgendaDayNoteBodySchema.safeParse({
      dayKey: '2026-04-18',
      text: 'Llamar a la clienta de las 18:00'
    })

    expect(query.success).toBe(true)
    expect(createPayload.success).toBe(true)
  })

  it('rejects invalid agenda day note toggle payloads', () => {
    const result = toggleAgendaDayNoteBodySchema.safeParse({
      isCompleted: 'true'
    })

    expect(result.success).toBe(false)
  })
})
