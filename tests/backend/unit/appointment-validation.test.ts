import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { validateAppointmentSlot } from '../../../src/backend/utils/appointment-validation'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

describe('validateAppointmentSlot', () => {
  const fixedNow = new Date('2026-03-31T12:00:00.000')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)
    resetPrismaMock()
    prismaMock.appointment.findMany.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const baseInput = {
    date: new Date('2026-04-01T00:00:00.000'),
    startTime: '10:00',
    endTime: '11:00',
    professional: 'LUCY',
    cabin: 'LUCY'
  }

  it('permite una cita futura valida', async () => {
    const result = await validateAppointmentSlot(baseInput, prismaMock)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('rechaza una fecha pasada con PAST_DATETIME', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, date: new Date('2026-03-30T00:00:00.000') },
      prismaMock
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({
      code: 'PAST_DATETIME',
      message: 'No se puede crear una cita en el pasado'
    })
  })

  it('rechaza una hora pasada en el mismo dia con PAST_DATETIME', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, date: new Date('2026-03-31T00:00:00.000'), startTime: '11:00', endTime: '12:00' },
      prismaMock
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('PAST_DATETIME')
  })

  it('rechaza startTime mayor o igual que endTime con INVALID_TIME_RANGE', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '12:00', endTime: '11:00' },
      prismaMock
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({
      code: 'INVALID_TIME_RANGE',
      message: 'La hora de inicio debe ser anterior a la hora de fin'
    })
  })

  it('rechaza horas fuera de 08:00-22:00 con INVALID_HOURS', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '07:59', endTime: '09:00' },
      prismaMock
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({
      code: 'INVALID_HOURS',
      message: 'El horario debe estar entre 08:00 y 22:00'
    })
  })

  it('detecta conflicto de profesional', async () => {
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([{ startTime: '10:00', endTime: '11:30' }])
      .mockResolvedValueOnce([])

    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '10:30', endTime: '11:30' },
      prismaMock
    )

    expect(result.errors).toEqual([
      {
        code: 'PROFESSIONAL_CONFLICT',
        message: 'Lucy ya tiene una cita de 10:00 a 11:30'
      }
    ])
  })

  it('detecta conflicto de cabina', async () => {
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ startTime: '10:00', endTime: '12:00' }])

    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '11:00', endTime: '12:30' },
      prismaMock
    )

    expect(result.errors).toEqual([
      {
        code: 'CABIN_CONFLICT',
        message: 'La cabina Lucy ya esta ocupada de 10:00 a 12:00'
      }
    ])
  })

  it('permite citas adyacentes sin conflicto', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '11:00', endTime: '12:00' },
      prismaMock
    )

    expect(result.errors).toHaveLength(0)
  })

  it('excluye la cita propia en updates', async () => {
    await validateAppointmentSlot(
      { ...baseInput, excludeAppointmentId: 'abc-123' },
      prismaMock
    )

    const [call] = prismaMock.appointment.findMany.mock.calls
    expect(call?.[0].where.id).toEqual({ not: 'abc-123' })
  })

  it('devuelve warning para la franja de descanso', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '15:00', endTime: '15:30' },
      prismaMock
    )

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toEqual([
      {
        code: 'OUTSIDE_BUSINESS_HOURS',
        message: 'La hora seleccionada coincide con la franja de descanso habitual (14:00-16:00)'
      }
    ])
  })

  it('aplica la busqueda de conflictos solo en estados activos', async () => {
    await validateAppointmentSlot(baseInput, prismaMock)

    const [professionalCall, cabinCall] = prismaMock.appointment.findMany.mock.calls
    expect(professionalCall?.[0].where.status).toEqual({ in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] })
    expect(cabinCall?.[0].where.status).toEqual({ in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] })
  })
})
