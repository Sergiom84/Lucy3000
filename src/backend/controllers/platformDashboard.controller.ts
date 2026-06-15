import { Request, Response } from 'express'
import { prisma } from '../db'
import { evaluateTenantLicense } from '../tenant/license'

const DASHBOARD_PIN = process.env.PLATFORM_DASHBOARD_PIN || '0852'

const getCommercialStatus = (license: any) => {
  if (!license) return 'Sin licencia'

  const access = evaluateTenantLicense(license)
  if (access.status === 'ACTIVE') return 'Ya ha pagado'
  if (access.status === 'TRIAL') return access.reason === 'trial-expired' ? 'Realizó la prueba y no siguió' : 'En prueba'
  if (access.status === 'PENDING') return access.reason === 'pending-expired' ? 'No inició la prueba' : 'Pendiente de empezar prueba'
  if (access.status === 'CANCELLED') return 'Realizó la prueba y no siguió'
  if (access.status === 'BLOCKED') return 'Bloqueado'
  return access.status
}

export const getPlatformDashboard = async (req: Request, res: Response) => {
  try {
    if (String(req.body?.pin || '') !== DASHBOARD_PIN) {
      return res.status(401).json({ error: 'PIN incorrecto' })
    }

    const [tenants, trialRequests] = await Promise.all([
      prisma.tenant.findMany({
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
      }),
      prisma.trialRequest.findMany({
        orderBy: { createdAt: 'desc' }
      })
    ])

    const tenantRows = tenants.map((tenant) => {
      const admin = tenant.users.find((user) => user.role === 'ADMIN') || tenant.users[0] || null
      const license = tenant.license ? evaluateTenantLicense(tenant.license) : null

      return {
        id: `tenant-${tenant.id}`,
        source: 'tenant',
        tenantId: tenant.id,
        requestId: null,
        tenantName: tenant.name,
        tenantCode: tenant.tenantCode ?? null,
        userName: admin?.name || '-',
        email: admin?.email || '-',
        phone: admin?.phone || '',
        signedUpAt: admin?.createdAt || tenant.createdAt,
        requestedAt: null,
        tenantCreatedAt: tenant.createdAt,
        trialStartedAt: tenant.license?.status === 'TRIAL' ? tenant.license.updatedAt : null,
        trialEndsAt: license?.trialEndsAt || tenant.license?.trialEndsAt || null,
        paidAt: tenant.license?.activatedAt || null,
        licenseStatus: license?.status || tenant.license?.status || 'INACTIVE',
        licenseReason: license?.reason || 'inactive',
        commercialStatus: getCommercialStatus(tenant.license),
        emailStatus: 'Alta creada',
        replyStatus: 'Correo recibido',
        requestStatus: null
      }
    })

    const tenantEmails = new Set(
      tenantRows
        .map((row) => row.email)
        .filter((email) => email && email !== '-')
        .map((email) => String(email).trim().toLowerCase())
    )

    const requestRows = trialRequests.map((request) => {
      const hasTenant = tenantEmails.has(request.normalizedEmail)
      const requesterDelivered = Boolean(request.requesterEmailDeliveredAt)

      return {
        id: `request-${request.id}`,
        source: 'trialRequest',
        tenantId: null,
        requestId: request.id,
        tenantName: hasTenant ? 'Alta creada' : 'Solicitud web',
        tenantCode: null,
        userName: request.name,
        email: request.email,
        phone: request.phone || '',
        signedUpAt: request.createdAt,
        requestedAt: request.createdAt,
        tenantCreatedAt: null,
        trialStartedAt: null,
        trialEndsAt: null,
        paidAt: null,
        licenseStatus: request.status,
        licenseReason: request.status,
        commercialStatus: hasTenant ? 'Alta creada' : 'Solicitud recibida',
        emailStatus: requesterDelivered ? 'Correo recibido' : 'Pendiente de confirmación',
        replyStatus: hasTenant
          ? 'Alta creada'
          : request.status === 'EMAIL_FAILED'
            ? 'Revisar envío'
            : 'Pendiente de mi contestación',
        requestStatus: request.status
      }
    })

    const rows = [...requestRows, ...tenantRows].sort((a, b) => {
      const left = new Date(a.requestedAt || a.signedUpAt || 0).getTime()
      const right = new Date(b.requestedAt || b.signedUpAt || 0).getTime()
      return right - left
    })

    res.json({
      rows,
      totals: {
        total: rows.length,
        trial: tenantRows.filter((row) => row.licenseStatus === 'TRIAL' && row.licenseReason === 'active').length,
        paid: tenantRows.filter((row) => row.licenseStatus === 'ACTIVE').length,
        notContinued: tenantRows.filter((row) =>
          ['CANCELLED', 'BLOCKED', 'TRIAL_EXPIRED'].includes(row.licenseStatus)
        ).length,
        pending: requestRows.filter((row) => row.replyStatus === 'Pendiente de mi contestación').length
      }
    })
  } catch (error) {
    console.error('Get platform dashboard error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
