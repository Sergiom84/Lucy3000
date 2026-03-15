import { describe, expect, it } from 'vitest'
import { getTomorrowUtcRange } from '../../../src/backend/services/appointmentReminder.service'
import { normalizePhoneForWhatsApp } from '../../../src/backend/services/whatsapp.service'

describe('whatsapp reminder helpers', () => {
  it('normalizes local Spanish numbers to E.164 digits', () => {
    expect(normalizePhoneForWhatsApp('600 123 123', '34')).toBe('34600123123')
    expect(normalizePhoneForWhatsApp('+34 600 123 123', '34')).toBe('34600123123')
    expect(normalizePhoneForWhatsApp('0034 600 123 123', '34')).toBe('34600123123')
  })

  it('returns null for invalid phone numbers', () => {
    expect(normalizePhoneForWhatsApp('', '34')).toBeNull()
    expect(normalizePhoneForWhatsApp('abc', '34')).toBeNull()
    expect(normalizePhoneForWhatsApp('123', '34')).toBeNull()
  })

  it('calculates tomorrow UTC range correctly', () => {
    const { start, end } = getTomorrowUtcRange(new Date('2026-03-15T12:00:00.000Z'))

    expect(start.toISOString()).toBe('2026-03-16T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-03-17T00:00:00.000Z')
  })
})
