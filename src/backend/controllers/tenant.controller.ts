import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { getServerNow, prisma } from '../db'
import type { AuthRequest } from '../middleware/auth.middleware'
import { evaluateTenantLicense, getTrialEndDate } from '../tenant/license'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeUsername = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}

const normalizeTenantSlug = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

const tenantInclude = {
  license: true,
  users: {
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      isPlatformAdmin: true
    },
    orderBy: { createdAt: 'asc' as const }
  }
}

const serializeTenant = (tenant: any) => {
  const licenseAccess = tenant.license ? evaluateTenantLicense(tenant.license) : null

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    tenantCode: tenant.tenantCode ?? null,
    status: tenant.status,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    license: tenant.license
      ? {
          id: tenant.license.id,
          status: licenseAccess?.status ?? tenant.license.status,
          reason: licenseAccess?.reason ?? 'inactive',
          plan: tenant.license.plan,
          trialEndsAt: tenant.license.trialEndsAt,
          activatedAt: tenant.license.activatedAt,
          blockedAt: tenant.license.blockedAt,
          cancelledAt: tenant.license.cancelledAt,
          notes: tenant.license.notes
        }
      : null,
    users: tenant.users
  }
}

export const getCurrentTenantLicense = async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user?.tenantId },
      include: {
        license: true
      }
    })

    if (!tenant?.license) {
      return res.status(404).json({ error: 'Tenant license not found' })
    }

    const license = evaluateTenantLicense(tenant.license, await getServerNow())
    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        tenantCode: tenant.tenantCode ?? null
      },
      license: {
        status: license.status,
        reason: license.reason,
        plan: tenant.license.plan,
        trialEndsAt: license.trialEndsAt,
        activatedAt: tenant.license.activatedAt,
        blockedAt: tenant.license.blockedAt,
        cancelledAt: tenant.license.cancelledAt,
        notes: tenant.license.notes
      }
    })
  } catch (error) {
    console.error('Get current tenant license error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
// El propio admin del tenant arranca su prueba de 7 dias (boton "Si" del
// pop-up). Solo permitido desde PENDING y dentro de la gracia; el reloj se
// fija con la hora de la base (Supabase), no la del PC.
export const startCurrentTenantTrial = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context is required' })
    }

    const license = await prisma.tenantLicense.findUnique({ where: { tenantId } })
    if (!license) {
      return res.status(404).json({ error: 'Tenant license not found' })
    }

    if (license.status !== 'PENDING') {
      return res.status(409).json({ error: 'Trial can only be started from a pending license' })
    }

    const now = await getServerNow()
    const access = evaluateTenantLicense(license, now)
    if (access.reason === 'pending-expired') {
      return res.status(403).json({ error: 'Trial grace period has expired', reason: 'pending-expired' })
    }

    const trialEndsAt = getTrialEndDate(now)
    const updated = await prisma.tenantLicense.update({
      where: { tenantId },
      data: {
        status: 'TRIAL',
        plan: 'trial',
        trialEndsAt,
        blockedAt: null,
        cancelledAt: null
      }
    })

    const updatedAccess = evaluateTenantLicense(updated, now)
    res.json({
      status: updatedAccess.status,
      reason: updatedAccess.reason,
      trialEndsAt: updated.trialEndsAt
    })
  } catch (error) {
    console.error('Start tenant trial error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getTenants = async (_req: AuthRequest, res: Response) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: tenantInclude,
      orderBy: { createdAt: 'desc' }
    })

    res.json(tenants.map(serializeTenant))
  } catch (error) {
    console.error('Get tenants error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createTenant = async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, adminEmail, adminUsername, adminPassword, adminName } = req.body
    const normalizedSlug = normalizeTenantSlug(slug || name)

    const createdTenant = await prisma.$transaction(async (tx) => {
      const existingTenant = await tx.tenant.findUnique({
        where: { slug: normalizedSlug },
        select: { id: true }
      })

      if (existingTenant) {
        return null
      }

      return tx.tenant.create({
        data: {
          name: String(name).trim(),
          slug: normalizedSlug,
          license: {
            create: {
              // El tenant nace PENDING: el trial no arranca hasta que el
              // platform admin da el OK (status TRIAL) desde el panel. Esto
              // evita gastar la prueba durante migracion/configuracion.
              status: 'PENDING',
              plan: 'pending',
              trialEndsAt: getTrialEndDate()
            }
          },
          users: {
            create: {
              email: normalizeEmail(adminEmail),
              username: normalizeUsername(adminUsername),
              password: await bcrypt.hash(adminPassword, 10),
              name: String(adminName).trim(),
              role: 'ADMIN',
              isPlatformAdmin: false
            }
          }
        },
        include: tenantInclude
      })
    })

    if (!createdTenant) {
      return res.status(409).json({ error: 'Business slug already exists' })
    }

    res.status(201).json(serializeTenant(createdTenant))
  } catch (error) {
    console.error('Create tenant error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateTenantLicense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { status, plan, trialEndsAt, blockedAt, cancelledAt, notes } = req.body

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' })
    }

    const license = await prisma.tenantLicense.upsert({
      where: { tenantId: id },
      create: {
        tenantId: id,
        status: status || 'TRIAL',
        plan: plan || 'trial',
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : getTrialEndDate(),
        blockedAt: blockedAt === undefined || blockedAt === null ? null : new Date(blockedAt),
        cancelledAt: cancelledAt === undefined || cancelledAt === null ? null : new Date(cancelledAt),
        activatedAt: status === 'ACTIVE' ? new Date() : null,
        notes: notes ?? null
      },
      update: {
        ...(status ? { status } : {}),
        ...(plan ? { plan } : {}),
        ...(trialEndsAt ? { trialEndsAt: new Date(trialEndsAt) } : {}),
        ...(blockedAt !== undefined ? { blockedAt: blockedAt ? new Date(blockedAt) : null } : {}),
        ...(cancelledAt !== undefined ? { cancelledAt: cancelledAt ? new Date(cancelledAt) : null } : {}),
        // Al dar el OK de prueba, el reloj de 7 dias arranca AHORA (no en la
        // instalacion), salvo que se pase un trialEndsAt explicito.
        ...(status === 'TRIAL'
          ? {
              trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : getTrialEndDate(),
              blockedAt: null,
              cancelledAt: null
            }
          : {}),
        ...(status === 'ACTIVE' ? { activatedAt: new Date(), blockedAt: null, cancelledAt: null } : {}),
        ...(notes !== undefined ? { notes } : {})
      }
    })

    const access = evaluateTenantLicense(license)
    res.json({
      ...license,
      status: access.status,
      reason: access.reason
    })
  } catch (error) {
    console.error('Update tenant license error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
