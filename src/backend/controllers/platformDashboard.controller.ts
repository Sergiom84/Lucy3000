import { Request, Response } from 'express'
import { prisma } from '../db'
import { evaluateTenantLicense } from '../tenant/license'

const DASHBOARD_PIN = process.env.PLATFORM_DASHBOARD_PIN || '0852'

const getCommercialStatus = (license: any) => {
  if (!license) return 'Sin licencia'

  const access = evaluateTenantLicense(license)
  if (access.status === 'ACTIVE') return 'Ya ha pagado'
  if (access.status === 'TRIAL') return access.reason === 'trial-expired' ? 'Realizo la prueba y no siguio' : 'En prueba'
  if (access.status === 'PENDING') return access.reason === 'pending-expired' ? 'No inicio la prueba' : 'Pendiente de empezar prueba'
  if (access.status === 'CANCELLED') return 'Realizo la prueba y no siguio'
  if (access.status === 'BLOCKED') return 'Bloqueado'
  return access.status
}

export const getPlatformDashboard = async (req: Request, res: Response) => {
  try {
    if (String(req.body?.pin || '') !== DASHBOARD_PIN) {
      return res.status(401).json({ error: 'PIN incorrecto' })
    }

    const tenants = await prisma.tenant.findMany({
      include: {
        license: true,
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            createdAt: true
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const rows = tenants.map((tenant) => {
      const admin = tenant.users.find((user) => user.role === 'ADMIN') || tenant.users[0] || null
      const license = tenant.license ? evaluateTenantLicense(tenant.license) : null

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantCode: tenant.tenantCode ?? null,
        userName: admin?.name || '-',
        email: admin?.email || '-',
        phone: admin?.phone || '',
        signedUpAt: admin?.createdAt || tenant.createdAt,
        tenantCreatedAt: tenant.createdAt,
        trialStartedAt: tenant.license?.status === 'TRIAL' ? tenant.license.updatedAt : null,
        trialEndsAt: license?.trialEndsAt || tenant.license?.trialEndsAt || null,
        paidAt: tenant.license?.activatedAt || null,
        licenseStatus: license?.status || tenant.license?.status || 'INACTIVE',
        licenseReason: license?.reason || 'inactive',
        commercialStatus: getCommercialStatus(tenant.license)
      }
    })

    res.json({
      rows,
      totals: {
        total: rows.length,
        trial: rows.filter((row) => row.licenseStatus === 'TRIAL' && row.licenseReason === 'active').length,
        paid: rows.filter((row) => row.licenseStatus === 'ACTIVE').length,
        notContinued: rows.filter((row) =>
          ['CANCELLED', 'BLOCKED', 'TRIAL_EXPIRED'].includes(row.licenseStatus)
        ).length,
        pending: rows.filter((row) => row.licenseStatus === 'PENDING').length
      }
    })
  } catch (error) {
    console.error('Get platform dashboard error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
