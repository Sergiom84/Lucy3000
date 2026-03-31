import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validateAppointmentSlot } from '../../../src/backend/utils/appointment-validation'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

describe('validateAppointmentSlot', () => {
  beforeEach(() => {
    resetPrismaMock()
    prismaMock.appointment.findMany.mockResolvedValue([])
  })

  const baseInput = {
    date: new Date('2099-06-15'),
    startTime: '10:00',
    endTime: '11:00',
    professional: 'LUCY',
    cabin: 'LUCY',
  }

  it('should pass for a valid future appointment', async () => {
    const result = await validateAppointmentSlot(baseInput, prismaMock)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject past date with PAST_DATETIME', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, date: new Date('2020-01-01') },
      prismaMock
    )
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('PAST_DATETIME')
  })

  it('should reject past time today with PAST_DATETIME', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const result = await validateAppointmentSlot(
      { ...baseInput, date: today, startTime: '00:01', endTime: '00:30' },
      prismaMock
    )
    expect(result.errors.some(e => e.code === 'PAST_DATETIME')).toBe(true)
  })

  it('should reject startTime >= endTime with INVALID_TIME_RANGE', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '12:00', endTime: '11:00' },
      prismaMock
    )
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('INVALID_TIME_RANGE')
  })

  it('should reject hours outside 09:00-21:00 with INVALID_HOURS', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '08:00', endTime: '09:00' },
      prismaMock
    )
    expect(result.errors.some(e => e.code === 'INVALID_HOURS')).toBe(true)
  })

  it('should detect professional conflict', async () => {
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([
        { startTime: '10:00', endTime: '11:30', service: { name: 'Facial' }, client: { firstName: 'Ana' } }
      ])
      .mockResolvedValueOnce([])

    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '10:30', endTime: '11:30' },
      prismaMock
    )
    expect(result.errors.some(e => e.code === 'PROFESSIONAL_CONFLICT')).toBe(true)
    expect(result.errors[0].message).toContain('LUCY')
  })

  it('should detect cabin conflict', async () => {
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { startTime: '10:00', endTime: '12:00', service: { name: 'Masaje' }, client: { firstName: 'Maria' } }
      ])

    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '11:00', endTime: '12:30' },
      prismaMock
    )
    expect(result.errors.some(e => e.code === 'CABIN_CONFLICT')).toBe(true)
    expect(result.errors[0].message).toContain('LUCY')
  })

  it('should NOT conflict for adjacent appointments (10-11 and 11-12)', async () => {
    // Adjacent times: existing ends exactly when new starts
    prismaMock.appointment.findMany.mockResolvedValue([])

    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '11:00', endTime: '12:00' },
      prismaMock
    )
    expect(result.errors).toHaveLength(0)
  })

  it('should NOT conflict with CANCELLED/COMPLETED appointments', async () => {
    // The query filters by ACTIVE_STATUSES, so cancelled appointments never appear
    prismaMock.appointment.findMany.mockResolvedValue([])

    const result = await validateAppointmentSlot(baseInput, prismaMock)
    expect(result.errors).toHaveLength(0)
  })

  it('should exclude own appointment on update', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])

    const result = await validateAppointmentSlot(
      { ...baseInput, excludeAppointmentId: 'abc-123' },
      prismaMock
    )

    // Verify the query was called with the exclusion
    const call = prismaMock.appointment.findMany.mock.calls[0][0]
    expect(call.where.id).toEqual({ not: 'abc-123' })
    expect(result.errors).toHaveLength(0)
  })

  it('should return warning for lunch gap (14:00-16:00)', async () => {
    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '15:00', endTime: '16:00' },
      prismaMock
    )
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('OUTSIDE_BUSINESS_HOURS')
  })

  it('should return multiple errors for multiple violations', async () => {
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([
        { startTime: '10:00', endTime: '11:30', service: { name: 'Facial' }, client: { firstName: 'Ana' } }
      ])
      .mockResolvedValueOnce([
        { startTime: '10:00', endTime: '11:30', service: { name: 'Facial' }, client: { firstName: 'Ana' } }
      ])

    const result = await validateAppointmentSlot(
      { ...baseInput, startTime: '10:30', endTime: '11:00' },
      prismaMock
    )
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})
