import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getServerNow, prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { evaluateTenantLicense, getTrialEndDate } from '../tenant/license'
import { getJwtSecret } from '../utils/jwt'

const USER_ROLES: string[] = ['ADMIN', 'MANAGER', 'EMPLOYEE']

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeUsername = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}
const normalizeLoginIdentifier = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeTenantSlug = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

const DEFAULT_TENANT_NAME = 'Lucy3000'
const isLocalSqliteMode = () => String(process.env.DATABASE_URL || '').startsWith('file:')

const buildTenantSlug = (name: unknown, fallback = 'lucy3000') =>
  normalizeTenantSlug(name) || normalizeTenantSlug(fallback) || 'lucy3000'

const buildAuthResponse = (user: {
  id: string
  email: string
  username?: string | null
  name: string
  role: string
  tenantId: string
  isPlatformAdmin?: boolean
  tenant?: {
    id: string
    name: string
    slug: string
    license?: {
      status: string
      plan: string
      trialEndsAt: Date
      blockedAt?: Date | null
      cancelledAt?: Date | null
      createdAt?: Date | null
    } | null
  }
}, now?: Date) => {
  const license = user.tenant?.license ? evaluateTenantLicense(user.tenant.license, now) : null
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username || null,
      role: user.role,
      tenantId: user.tenantId,
      isPlatformAdmin: Boolean(user.isPlatformAdmin)
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  )

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username || null,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug
          }
        : null,
      license: license
        ? {
            status: license.status,
            reason: license.reason,
            trialEndsAt: license.trialEndsAt
          }
        : null,
      isPlatformAdmin: Boolean(user.isPlatformAdmin)
    }
  }
}

const isBootstrapRequired = async () => {
  const userCount = await prisma.user.count()
  return userCount === 0
}

export const getBootstrapStatus = async (_req: Request, res: Response) => {
  try {
    res.json({ required: await isBootstrapRequired() })
  } catch (error) {
    console.error('Get bootstrap status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const bootstrapAdmin = async (req: Request, res: Response) => {
  try {
    // Gate de seguridad para la API central publica: si BOOTSTRAP_TOKEN esta
    // definido, solo quien lo conozca puede crear el primer platform admin.
    // Sin la variable (instalaciones locales/dev) el comportamiento no cambia.
    const requiredToken = process.env.BOOTSTRAP_TOKEN
    if (requiredToken && String(req.body.bootstrapToken || '') !== requiredToken) {
      return res.status(403).json({ error: 'Bootstrap token required' })
    }

    const { email, username, password, name, businessName, businessSlug } = req.body
    const tenantName = String(businessName || DEFAULT_TENANT_NAME).trim() || DEFAULT_TENANT_NAME
    const tenantSlug = buildTenantSlug(businessSlug || tenantName)

    const createdUser = await prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count()
      if (userCount > 0) {
        return null
      }

      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug: tenantSlug,
          license: {
            create: {
              // SQLite local = ACTIVE de por vida (sin control de trial).
              // Supabase = PENDING: la prueba no arranca en la instalacion;
              // el cliente la inicia con el pop-up "Empezar prueba" (start-trial)
              // y dispone de una gracia para configurar antes (PENDING_GRACE_DAYS).
              status: isLocalSqliteMode() ? 'ACTIVE' : 'PENDING',
              plan: isLocalSqliteMode() ? 'local' : 'pending',
              trialEndsAt: isLocalSqliteMode() ? new Date('2099-12-31T23:59:59.000Z') : getTrialEndDate(),
              activatedAt: isLocalSqliteMode() ? new Date() : undefined
            }
          }
        }
      })

      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email: normalizeEmail(email),
          username: normalizeUsername(username),
          password: await bcrypt.hash(password, 10),
          name: String(name).trim(),
          role: 'ADMIN',
          isPlatformAdmin: true
        },
        include: {
          tenant: {
            include: {
              license: true
            }
          }
        }
      })
    })

    if (!createdUser) {
      return res.status(409).json({ error: 'Bootstrap already completed' })
    }

    res.status(201).json(buildAuthResponse(createdUser))
  } catch (error) {
    console.error('Bootstrap admin error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { identifier, password, tenantSlug } = req.body

    if (!identifier || !password) {
      return res.status(400).json({ error: 'User or email and password are required' })
    }

    const normalizedIdentifier = normalizeLoginIdentifier(identifier)
    const normalizedTenantSlug = normalizeTenantSlug(tenantSlug)

    const users = await prisma.user.findMany({
      where: {
        ...(normalizedTenantSlug ? { tenant: { slug: normalizedTenantSlug } } : {}),
        OR: [
          { email: normalizedIdentifier },
          { username: normalizedIdentifier }
        ]
      },
      include: {
        tenant: {
          include: {
            license: true
          }
        }
      },
      take: 2
    })

    if (users.length > 1) {
      return res.status(409).json({
        error: 'This user exists in more than one business. Enter the business slug to continue.'
      })
    }

    const user = users[0]

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (!user.tenant || user.tenant.status !== 'ACTIVE' || !user.tenant.license) {
      return res.status(403).json({ error: 'Tenant is not active' })
    }

    const serverNow = await getServerNow()
    const licenseAccess = evaluateTenantLicense(user.tenant.license, serverNow)

    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'User is inactive' })
    }

    res.status(licenseAccess.allowed ? 200 : 402).json(buildAuthResponse(user, serverNow))
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const register = async (req: AuthRequest, res: Response) => {
  try {
    const { email, username, password, name, role } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' })
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' })
    }

    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context is required' })
    }

    const normalizedEmail = normalizeEmail(email)
    const normalizedUsername = normalizeUsername(username)
    const sanitizedRole: string =
      USER_ROLES.includes(role as string) ? (role as string) : 'EMPLOYEE'

    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: normalizedEmail },
          ...(normalizedUsername ? [{ username: normalizedUsername }] : [])
        ]
      },
      select: {
        email: true,
        username: true
      }
    })

    if (existingUsers.some((user) => user.email === normalizedEmail)) {
      return res.status(400).json({ error: 'Email already exists' })
    }

    if (normalizedUsername && existingUsers.some((user) => user.username === normalizedUsername)) {
      return res.status(400).json({ error: 'Username already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        name: String(name).trim(),
        role: sanitizedRole
      },
      include: {
        tenant: {
          include: {
            license: true
          }
        }
      }
    })

    res.status(201).json(buildAuthResponse(user))
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        tenantId: true,
        isPlatformAdmin: true,
        isActive: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            license: {
              select: {
                status: true,
                plan: true,
                trialEndsAt: true,
                blockedAt: true,
                cancelledAt: true,
                createdAt: true
              }
            }
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const license = user.tenant.license
      ? evaluateTenantLicense(user.tenant.license, await getServerNow())
      : null

    res.json({
      ...user,
      license: license
        ? {
            status: license.status,
            reason: license.reason,
            trialEndsAt: license.trialEndsAt
          }
        : null
    })
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

