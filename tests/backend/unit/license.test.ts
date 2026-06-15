import { describe, it, expect } from 'vitest'
import {
  evaluateTenantLicense,
  getTrialEndDate,
  PENDING_GRACE_DAYS,
  type TenantLicenseSnapshot
} from '../../../src/backend/tenant/license'

const baseLicense = (overrides: Partial<TenantLicenseSnapshot> = {}): TenantLicenseSnapshot => ({
  status: 'PENDING',
  plan: 'pending',
  trialEndsAt: new Date('2099-12-31T00:00:00.000Z'),
  blockedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides
})

const daysFrom = (base: Date, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

describe('evaluateTenantLicense', () => {
  it('blocks an ACTIVE/expired-trial check using the provided (server) now', () => {
    const license = baseLicense({ status: 'TRIAL', trialEndsAt: new Date('2026-01-05T00:00:00.000Z') })
    const beforeExpiry = evaluateTenantLicense(license, new Date('2026-01-04T00:00:00.000Z'))
    const afterExpiry = evaluateTenantLicense(license, new Date('2026-01-06T00:00:00.000Z'))

    expect(beforeExpiry.allowed).toBe(true)
    expect(beforeExpiry.reason).toBe('active')
    expect(afterExpiry.allowed).toBe(false)
    expect(afterExpiry.reason).toBe('trial-expired')
  })

  it('keeps PENDING within the grace window as reason "pending"', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const license = baseLicense({ createdAt })
    const now = daysFrom(createdAt, PENDING_GRACE_DAYS - 1)

    const access = evaluateTenantLicense(license, now)
    expect(access.allowed).toBe(false)
    expect(access.reason).toBe('pending')
  })

  it('marks PENDING past the grace window as reason "pending-expired"', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const license = baseLicense({ createdAt })
    const now = daysFrom(createdAt, PENDING_GRACE_DAYS + 1)

    const access = evaluateTenantLicense(license, now)
    expect(access.allowed).toBe(false)
    expect(access.reason).toBe('pending-expired')
  })

  it('treats BLOCKED and CANCELLED before pending grace', () => {
    expect(evaluateTenantLicense(baseLicense({ status: 'BLOCKED' })).reason).toBe('blocked')
    expect(evaluateTenantLicense(baseLicense({ status: 'CANCELLED' })).reason).toBe('cancelled')
  })

  it('allows ACTIVE licenses', () => {
    const access = evaluateTenantLicense(baseLicense({ status: 'ACTIVE' }))
    expect(access.allowed).toBe(true)
    expect(access.reason).toBe('active')
  })

  it('getTrialEndDate adds 10 days to the given start', () => {
    const start = new Date('2026-03-01T00:00:00.000Z')
    expect(getTrialEndDate(start).toISOString()).toBe('2026-03-11T00:00:00.000Z')
  })
})
