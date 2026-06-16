import { randomBytes } from 'crypto'
import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { getServerNow, prisma } from '../db'
import { evaluateTenantLicense, getTrialEndDate } from '../tenant/license'
import { sendAccessCredentialsEmail } from '../services/accessCredentialsEmail.service'

const DASHBOARD_PIN = process.env.PLATFORM_DASHBOARD_PIN || '0852'
const TENANT_ROW_PREFIX = 'tenant-'
const REQUEST_ROW_PREFIX = 'request-'
const TENANT_LICENSE_STATUSES = new Set(['PENDING', 'TRIAL', 'ACTIVE', 'BLOCKED', 'CANCELLED'])
const TRIAL_REQUEST_STATUSES = new Set(['PENDING_REPLY', 'CONTACTED', 'CONVERTED', 'DISMISSED', 'EMAIL_FAILED'])
const REPLY_STATUSES = new Set([
  'PENDING_REPLY',
  'EMAIL_RECEIVED',
  'CONTACTED',
  'MEETING_SCHEDULED',
  'FOLLOW_UP',
  'NO_RESPONSE',
  'CLOSED',
  'EMAIL_FAILED'
])
const COMMERCIAL_PROCESS_STATUSES = new Set([
  'REQUEST_RECEIVED',
  'CONTACTED',
  'REGISTERED',
  'PENDING_TRIAL',
  'TRIAL_STARTED',
  'TRIAL_EXPIRED',
  'PAID',
  'NOT_CONTINUED',
  'BLOCKED'
])

const REPLY_STATUS_LABELS: Record<string, string> = {
  PENDING_REPLY: 'Pendiente de mi contestación',
  EMAIL_RECEIVED: 'Correo recibido',
  CONTACTED: 'Contactado',
  MEETING_SCHEDULED: 'Reunión agendada',
  FOLLOW_UP: 'Seguimiento pendiente',
  NO_RESPONSE: 'Sin respuesta',
  CLOSED: 'Cerrado',
  EMAIL_FAILED: 'Revisar envío'
}

const COMMERCIAL_PROCESS_STATUS_LABELS: Record<string, string> = {
  REQUEST_RECEIVED: 'Solicitud recibida',
  CONTACTED: 'Contactado',
  REGISTERED: 'Alta creada',
  PENDING_TRIAL: 'Pendiente de prueba',
  TRIAL_STARTED: 'En prueba',
  TRIAL_EXPIRED: 'Prueba finalizada',
  PAID: 'Ya ha pagado',
  NOT_CONTINUED: 'No siguió',
  BLOCKED: 'Bloqueado'
}

const tenantInclude = {
  license: true,
  users: {
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' as const }
  }
}

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

const normalizePhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || null
}

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

const generateTemporaryPassword = () => randomBytes(9).toString('base64url')

const assertDashboardPin = (req: Request, res: Response) => {
  if (String(req.body?.pin || '') !== DASHBOARD_PIN) {
    res.status(401).json({ error: 'PIN incorrecto' })
    return false
  }

  return true
}

const parseRowId = (rowId: string) => {
  if (rowId.startsWith(TENANT_ROW_PREFIX)) {
    return { source: 'tenant' as const, id: rowId.slice(TENANT_ROW_PREFIX.length) }
  }

  return { source: 'trialRequest' as const, id: rowId.slice(REQUEST_ROW_PREFIX.length) }
}

const getTenantCommercialStatusCode = (license: any) => {
  if (!license) return 'PENDING_TRIAL'
  const access = evaluateTenantLicense(license)
  if (access.status === 'ACTIVE') return 'PAID'
  if (access.status === 'TRIAL') return access.reason === 'trial-expired' ? 'TRIAL_EXPIRED' : 'TRIAL_STARTED'
  if (access.status === 'PENDING') return 'PENDING_TRIAL'
  if (access.status === 'CANCELLED') return 'NOT_CONTINUED'
  if (access.status === 'BLOCKED') return 'BLOCKED'
  return 'PENDING_TRIAL'
}

const getRequestCommercialStatusCode = (status: string, hasTenant: boolean) => {
  if (hasTenant || status === 'CONVERTED') return 'REGISTERED'
  if (status === 'CONTACTED') return 'CONTACTED'
  if (status === 'DISMISSED') return 'NOT_CONTINUED'
  return 'REQUEST_RECEIVED'
}

const getRequestReplyStatusCode = (status: string, hasTenant: boolean) => {
  if (hasTenant || status === 'CONVERTED') return 'CLOSED'
  if (status === 'CONTACTED') return 'CONTACTED'
  if (status === 'DISMISSED') return 'CLOSED'
  if (status === 'EMAIL_FAILED') return 'EMAIL_FAILED'
  return 'PENDING_REPLY'
}

const getReplyStatusLabel = (status: string) => REPLY_STATUS_LABELS[status] || status
const getCommercialProcessStatusLabel = (status: string) => COMMERCIAL_PROCESS_STATUS_LABELS[status] || status

const getLicenseStatusFromCommercialProcess = (status: string) => {
  if (status === 'PAID') return 'ACTIVE'
  if (status === 'TRIAL_STARTED') return 'TRIAL'
  if (status === 'PENDING_TRIAL') return 'PENDING'
  if (status === 'NOT_CONTINUED') return 'CANCELLED'
  if (status === 'BLOCKED') return 'BLOCKED'
  return null
}

const getCommercialProcessFromLicenseStatus = (status: string) => {
  if (status === 'ACTIVE') return 'PAID'
  if (status === 'TRIAL') return 'TRIAL_STARTED'
  if (status === 'PENDING') return 'PENDING_TRIAL'
  if (status === 'CANCELLED') return 'NOT_CONTINUED'
  if (status === 'BLOCKED') return 'BLOCKED'
  return null
}

const resolveTenantCommercialStatusCode = (tenant: { commercialProcessStatus?: string | null; license?: any }) => {
  const licenseDrivenStatus = getTenantCommercialStatusCode(tenant.license)

  if (['PAID', 'TRIAL_STARTED', 'TRIAL_EXPIRED', 'NOT_CONTINUED', 'BLOCKED'].includes(licenseDrivenStatus)) {
    return licenseDrivenStatus
  }

  return tenant.commercialProcessStatus || licenseDrivenStatus
}

const getRequestStatusFromReplyStatus = (status: string) => {
  if (status === 'PENDING_REPLY') return 'PENDING_REPLY'
  if (status === 'EMAIL_FAILED') return 'EMAIL_FAILED'
  if (['CONTACTED', 'MEETING_SCHEDULED', 'FOLLOW_UP', 'NO_RESPONSE'].includes(status)) return 'CONTACTED'
  if (status === 'CLOSED') return 'DISMISSED'
  return null
}

const getRequestStatusFromCommercialProcess = (status: string) => {
  if (status === 'REQUEST_RECEIVED') return 'PENDING_REPLY'
  if (status === 'CONTACTED') return 'CONTACTED'
  if (status === 'REGISTERED') return 'CONVERTED'
  if (status === 'NOT_CONTINUED') return 'DISMISSED'
  return null
}

const getLicenseUpdateData = (status: string, now = new Date(), currentLicense?: any) => {
  if (status === 'ACTIVE') {
    return {
      status,
      plan: 'active',
      activatedAt: currentLicense?.activatedAt || now,
      blockedAt: null,
      cancelledAt: null
    }
  }

  const trialStartedAt = currentLicense?.trialStartedAt || now
  if (status === 'TRIAL') {
    return {
      status,
      plan: 'trial',
      trialStartedAt,
      trialEndsAt: currentLicense?.trialStartedAt ? currentLicense.trialEndsAt : getTrialEndDate(now),
      blockedAt: null,
      cancelledAt: null
    }
  }

  if (status === 'PENDING') {
    return {
      status,
      plan: 'pending',
      trialStartedAt: null,
      blockedAt: null,
      cancelledAt: null
    }
  }

  if (status === 'BLOCKED') {
    return {
      status,
      blockedAt: now,
      cancelledAt: null
    }
  }

  if (status === 'CANCELLED') {
    return {
      status,
      blockedAt: null,
      cancelledAt: now
    }
  }

  return { status }
}

const getTrialToggleUpdateData = (trialStarted: boolean, now: Date, currentLicense?: any) => {
  if (!trialStarted) {
    if (currentLicense?.status === 'ACTIVE') {
      throw new Error('ACTIVE_TRIAL_CANNOT_BE_RESET')
    }

    return {
      status: 'PENDING',
      plan: 'pending',
      trialStartedAt: null,
      blockedAt: null,
      cancelledAt: null
    }
  }

  const startedAt = currentLicense?.trialStartedAt || now
  if (currentLicense?.status === 'ACTIVE') {
    return {
      trialStartedAt: startedAt
    }
  }

  return {
    status: 'TRIAL',
    plan: 'trial',
    trialStartedAt: startedAt,
    trialEndsAt: currentLicense?.trialStartedAt ? currentLicense.trialEndsAt : getTrialEndDate(now),
    blockedAt: null,
    cancelledAt: null
  }
}

const buildPlatformDashboardPayload = async () => {
  const [tenants, trialRequests] = await Promise.all([
    prisma.tenant.findMany({
      include: tenantInclude,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.trialRequest.findMany({
      orderBy: { createdAt: 'desc' }
    })
  ])

  const requestsByEmail = new Map(
    trialRequests.map((request) => [request.normalizedEmail, request])
  )

  const tenantRows = tenants.map((tenant) => {
    const admin = tenant.users.find((user) => user.role === 'ADMIN') || tenant.users[0] || null
    const license = tenant.license ? evaluateTenantLicense(tenant.license) : null
    const adminEmail = admin?.email ? normalizeEmail(admin.email) : ''
    const matchingRequest = adminEmail ? requestsByEmail.get(adminEmail) : null
    const replyStatusCode = tenant.commercialReplyStatus || 'EMAIL_RECEIVED'
    const commercialStatusCode = resolveTenantCommercialStatusCode(tenant)

    return {
      id: `${TENANT_ROW_PREFIX}${tenant.id}`,
      source: 'tenant',
      tenantId: tenant.id,
      requestId: matchingRequest?.id || null,
      tenantName: tenant.name,
      tenantCode: tenant.tenantCode ?? null,
      userName: admin?.name || '-',
      email: admin?.email || '-',
      phone: admin?.phone || '',
      signedUpAt: admin?.createdAt || tenant.createdAt,
      requestedAt: matchingRequest?.createdAt || null,
      tenantCreatedAt: tenant.createdAt,
      trialStartedAt: tenant.license?.trialStartedAt || null,
      trialEndsAt: license?.trialEndsAt || tenant.license?.trialEndsAt || null,
      paidAt: tenant.license?.activatedAt || null,
      licenseStatus: license?.status || tenant.license?.status || 'INACTIVE',
      licenseReason: license?.reason || 'inactive',
      commercialStatusCode,
      commercialStatus: getCommercialProcessStatusLabel(commercialStatusCode),
      emailStatus: 'Alta creada',
      replyStatusCode,
      replyStatus: getReplyStatusLabel(replyStatusCode),
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
    const replyStatusCode = request.replyStatus || getRequestReplyStatusCode(request.status, hasTenant)
    const commercialStatusCode = request.commercialProcessStatus || getRequestCommercialStatusCode(request.status, hasTenant)

    return {
      id: `${REQUEST_ROW_PREFIX}${request.id}`,
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
      commercialStatusCode,
      commercialStatus: getCommercialProcessStatusLabel(commercialStatusCode),
      emailStatus: requesterDelivered ? 'Correo recibido' : 'Pendiente de confirmación',
      replyStatusCode,
      replyStatus: getReplyStatusLabel(replyStatusCode),
      requestStatus: request.status
    }
  })

  const rows = [...requestRows, ...tenantRows].sort((a, b) => {
    const left = new Date(a.requestedAt || a.signedUpAt || 0).getTime()
    const right = new Date(b.requestedAt || b.signedUpAt || 0).getTime()
    return right - left
  })

  return {
    rows,
    totals: {
      total: rows.length,
      trial: tenantRows.filter((row) => row.licenseStatus === 'TRIAL' && row.licenseReason === 'active').length,
      paid: tenantRows.filter((row) => row.licenseStatus === 'ACTIVE').length,
      notContinued: tenantRows.filter((row) =>
        ['CANCELLED', 'BLOCKED', 'TRIAL_EXPIRED'].includes(row.licenseStatus)
      ).length,
      pending: requestRows.filter((row) => row.replyStatusCode === 'PENDING_REPLY').length
    }
  }
}

const updateTenantDashboardRow = async (tenantId: string, body: any) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: tenantInclude
  })

  if (!tenant) return false

  const admin = tenant.users.find((user) => user.role === 'ADMIN') || tenant.users[0] || null
  const hasTenantNameUpdate = body.tenantName !== undefined
  const hasUserUpdate = body.name !== undefined || body.email !== undefined || body.phone !== undefined
  const hasLicenseUpdate = body.status !== undefined
  const hasTrialToggleUpdate = body.trialStarted !== undefined
  const hasReplyStatusUpdate = body.replyStatus !== undefined
  const hasCommercialProcessStatusUpdate = body.commercialProcessStatus !== undefined
  const now = await getServerNow()

  await prisma.$transaction(async (tx) => {
    const tenantData = {
      ...(hasTenantNameUpdate ? { name: body.tenantName } : {}),
      ...(hasReplyStatusUpdate ? { commercialReplyStatus: body.replyStatus } : {}),
      ...(hasCommercialProcessStatusUpdate ? { commercialProcessStatus: body.commercialProcessStatus } : {}),
      ...(hasLicenseUpdate && !hasCommercialProcessStatusUpdate
        ? { commercialProcessStatus: getCommercialProcessFromLicenseStatus(body.status) || undefined }
        : {}),
      ...(hasTrialToggleUpdate && !hasCommercialProcessStatusUpdate
        ? { commercialProcessStatus: body.trialStarted ? 'TRIAL_STARTED' : 'PENDING_TRIAL' }
        : {})
    }

    if (Object.keys(tenantData).length > 0) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: tenantData
      })
    }

    if (admin && hasUserUpdate) {
      await tx.user.update({
        where: { id: admin.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.email !== undefined ? { email: normalizeEmail(body.email) } : {}),
          ...(body.phone !== undefined ? { phone: String(body.phone || '').trim() || null } : {})
        }
      })
    }

    const commercialLicenseStatus = hasCommercialProcessStatusUpdate
      ? getLicenseStatusFromCommercialProcess(body.commercialProcessStatus)
      : null

    if (hasLicenseUpdate || hasTrialToggleUpdate || commercialLicenseStatus) {
      const licenseData = hasTrialToggleUpdate
        ? getTrialToggleUpdateData(body.trialStarted, now, tenant.license)
        : getLicenseUpdateData(commercialLicenseStatus || body.status, now, tenant.license)

      await tx.tenantLicense.upsert({
        where: { tenantId },
        create: {
          tenantId,
          trialEndsAt: getTrialEndDate(now),
          ...licenseData
        },
        update: licenseData
      })
    }
  })

  return true
}

const updateTrialRequestDashboardRow = async (requestId: string, body: any) => {
  const legacyStatus =
    body.status ||
    (body.commercialProcessStatus ? getRequestStatusFromCommercialProcess(body.commercialProcessStatus) : null) ||
    (body.replyStatus ? getRequestStatusFromReplyStatus(body.replyStatus) : null)

  const data = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.email !== undefined
      ? {
          email: String(body.email || '').trim(),
          normalizedEmail: normalizeEmail(body.email)
        }
      : {}),
    ...(body.phone !== undefined
      ? {
          phone: String(body.phone || '').trim() || null,
          normalizedPhone: normalizePhone(body.phone)
        }
      : {}),
    ...(body.replyStatus !== undefined ? { replyStatus: body.replyStatus } : {}),
    ...(body.commercialProcessStatus !== undefined ? { commercialProcessStatus: body.commercialProcessStatus } : {}),
    ...(legacyStatus ? { status: legacyStatus } : {})
  }

  const updated = await prisma.trialRequest.update({
    where: { id: requestId },
    data
  })

  return Boolean(updated)
}

export const getPlatformDashboard = async (req: Request, res: Response) => {
  try {
    if (!assertDashboardPin(req, res)) return
    res.json(await buildPlatformDashboardPayload())
  } catch (error) {
    console.error('Get platform dashboard error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updatePlatformDashboardRow = async (req: Request, res: Response) => {
  try {
    if (!assertDashboardPin(req, res)) return

    const row = parseRowId(req.params.rowId)
    if (row.source === 'tenant' && req.body.status && !TENANT_LICENSE_STATUSES.has(req.body.status)) {
      return res.status(400).json({ error: 'Estado de licencia no válido' })
    }

    if (row.source === 'trialRequest' && req.body.status && !TRIAL_REQUEST_STATUSES.has(req.body.status)) {
      return res.status(400).json({ error: 'Estado de solicitud no válido' })
    }

    if (req.body.replyStatus && !REPLY_STATUSES.has(req.body.replyStatus)) {
      return res.status(400).json({ error: 'Estado de contestación no válido' })
    }

    if (req.body.commercialProcessStatus && !COMMERCIAL_PROCESS_STATUSES.has(req.body.commercialProcessStatus)) {
      return res.status(400).json({ error: 'Estado comercial no válido' })
    }

    if (row.source === 'trialRequest' && req.body.trialStarted !== undefined) {
      return res.status(400).json({ error: 'La prueba solo puede gestionarse en clientes registrados' })
    }

    const updated =
      row.source === 'tenant'
        ? await updateTenantDashboardRow(row.id, req.body)
        : await updateTrialRequestDashboardRow(row.id, req.body)

    if (!updated) {
      return res.status(404).json({ error: 'Registro no encontrado' })
    }

    res.json(await buildPlatformDashboardPayload())
  } catch (error) {
    if (isPrismaError(error, 'P2002')) {
      return res.status(409).json({ error: 'Ya existe otro registro con ese correo o teléfono' })
    }

    if (isPrismaError(error, 'P2025')) {
      return res.status(404).json({ error: 'Registro no encontrado' })
    }

    if (error instanceof Error && error.message === 'ACTIVE_TRIAL_CANNOT_BE_RESET') {
      return res.status(409).json({ error: 'Un cliente pagado no puede volver a prueba sin iniciar' })
    }

    console.error('Update platform dashboard row error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deletePlatformDashboardRow = async (req: Request, res: Response) => {
  try {
    if (!assertDashboardPin(req, res)) return

    const row = parseRowId(req.params.rowId)
    if (row.source !== 'trialRequest') {
      return res.status(409).json({ error: 'Para borrar un centro hay que hacerlo desde administración interna' })
    }

    await prisma.trialRequest.delete({
      where: { id: row.id }
    })

    res.json(await buildPlatformDashboardPayload())
  } catch (error) {
    if (isPrismaError(error, 'P2025')) {
      return res.status(404).json({ error: 'Registro no encontrado' })
    }

    console.error('Delete platform dashboard row error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// Alta directa desde el dashboard comercial: ya se tiene el email del
// futuro cliente (solicitud de prueba), asi que se genera usuario/contraseña
// aqui mismo en vez de hacerlo a mano en el panel JWT de platform admin.
export const createPlatformAccess = async (req: Request, res: Response) => {
  try {
    if (!assertDashboardPin(req, res)) return

    const { requestId, businessName, businessSlug, adminName, adminEmail, adminPhone, adminUsername } = req.body
    const normalizedSlug = normalizeTenantSlug(businessSlug || businessName)
    const adminPassword = generateTemporaryPassword()

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
          name: String(businessName).trim(),
          slug: normalizedSlug,
          license: {
            create: {
              status: 'PENDING',
              plan: 'pending',
              trialEndsAt: getTrialEndDate()
            }
          },
          users: {
            create: {
              email: normalizeEmail(adminEmail),
              username: normalizeUsername(adminUsername),
              phone: String(adminPhone || '').trim() || null,
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
      return res.status(409).json({ error: 'Ya existe un negocio con ese nombre' })
    }

    if (requestId) {
      await prisma.trialRequest
        .update({
          where: { id: requestId },
          data: { status: 'CONVERTED', replyStatus: 'CLOSED', commercialProcessStatus: 'REGISTERED' }
        })
        .catch(() => undefined)
    }

    const username = createdTenant.users[0]?.username || adminEmail
    const emailResult = await sendAccessCredentialsEmail({
      email: adminEmail,
      name: adminName,
      tenantName: createdTenant.name,
      tenantCode: createdTenant.tenantCode,
      username,
      password: adminPassword
    }).catch((error) => {
      console.error('Send access credentials email error:', error)
      return { delivered: false, recipient: adminEmail }
    })

    res.status(201).json({
      tenant: {
        id: createdTenant.id,
        name: createdTenant.name,
        tenantCode: createdTenant.tenantCode
      },
      credentials: {
        username,
        password: adminPassword
      },
      emailDelivered: emailResult.delivered,
      dashboard: await buildPlatformDashboardPayload()
    })
  } catch (error) {
    console.error('Create platform access error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

const isPrismaError = (error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === code)
