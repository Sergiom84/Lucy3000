const ACTIVE_LICENSE_STATUSES = new Set(['ACTIVE', 'TRIAL'])

export type TenantLicenseSnapshot = {
  status: string
  plan: string
  trialEndsAt: Date
  blockedAt?: Date | null
  cancelledAt?: Date | null
  createdAt?: Date | null
}

export type TenantLicenseAccess = {
  allowed: boolean
  status: string
  reason:
    | 'active'
    | 'trial-expired'
    | 'blocked'
    | 'cancelled'
    | 'pending'
    | 'pending-expired'
    | 'inactive'
  trialEndsAt: Date
}

export const TRIAL_DAYS = 10

// Dias que un tenant PENDING puede quedarse sin arrancar la prueba antes de
// bloquearse del todo. Permite instalar, configurar y posponer el "Si" del
// pop-up varios dias (peor caso: dia 9). El dia 10 ya no deja entrar.
export const PENDING_GRACE_DAYS = 9

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

  if (license.status === 'PENDING') {
    let pendingExpired = false
    if (license.createdAt) {
      const graceEnd = new Date(license.createdAt)
      graceEnd.setDate(graceEnd.getDate() + PENDING_GRACE_DAYS)
      pendingExpired = graceEnd.getTime() < now.getTime()
    }
    return {
      allowed: false,
      status: 'PENDING',
      reason: pendingExpired ? 'pending-expired' : 'pending',
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
