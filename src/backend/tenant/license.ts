const ACTIVE_LICENSE_STATUSES = new Set(['ACTIVE', 'TRIAL'])

export type TenantLicenseSnapshot = {
  status: string
  plan: string
  trialEndsAt: Date
  blockedAt?: Date | null
  cancelledAt?: Date | null
}

export type TenantLicenseAccess = {
  allowed: boolean
  status: string
  reason: 'active' | 'trial-expired' | 'blocked' | 'cancelled' | 'inactive'
  trialEndsAt: Date
}

export const TRIAL_DAYS = 7

export const getTrialEndDate = (startedAt = new Date()) => {
  const trialEndsAt = new Date(startedAt)
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS)
  return trialEndsAt
}

export const evaluateTenantLicense = (
  license: TenantLicenseSnapshot,
  now = new Date()
): TenantLicenseAccess => {
  if (license.blockedAt || license.status === 'BLOCKED') {
    return {
      allowed: false,
      status: 'BLOCKED',
      reason: 'blocked',
      trialEndsAt: license.trialEndsAt
    }
  }

  if (license.cancelledAt || license.status === 'CANCELLED') {
    return {
      allowed: false,
      status: 'CANCELLED',
      reason: 'cancelled',
      trialEndsAt: license.trialEndsAt
    }
  }

  if (license.status === 'TRIAL' && license.trialEndsAt.getTime() < now.getTime()) {
    return {
      allowed: false,
      status: 'TRIAL_EXPIRED',
      reason: 'trial-expired',
      trialEndsAt: license.trialEndsAt
    }
  }

  if (!ACTIVE_LICENSE_STATUSES.has(license.status)) {
    return {
      allowed: false,
      status: license.status,
      reason: 'inactive',
      trialEndsAt: license.trialEndsAt
    }
  }

  return {
    allowed: true,
    status: license.status,
    reason: 'active',
    trialEndsAt: license.trialEndsAt
  }
}
