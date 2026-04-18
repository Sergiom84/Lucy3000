import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { getJwtSecret } from '../utils/jwt'

const USER_ROLES: string[] = ['ADMIN', 'MANAGER', 'EMPLOYEE']

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeUsername = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}
const normalizeLoginIdentifier = (value: unknown) => String(value || '').trim().toLowerCase()

const buildAuthResponse = (user: {
  id: string
  email: string
  username?: string | null
  name: string
  role: string
}) => {
  const token = jwt.sign(
    { id: user.id, email: user.email, username: user.username || null, role: user.role },
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
      role: user.role
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
    const { email, username, password, name } = req.body

    const createdUser = await prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count()
      if (userCount > 0) {
        return null
      }

      return tx.user.create({
        data: {
          email: normalizeEmail(email),
          username: normalizeUsername(username),
          password: await bcrypt.hash(password, 10),
          name: String(name).trim(),
          role: 'ADMIN'
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
    const { identifier, password } = req.body

    if (!identifier || !password) {
      return res.status(400).json({ error: 'User or email and password are required' })
    }

    const normalizedIdentifier = normalizeLoginIdentifier(identifier)

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedIdentifier },
          { username: normalizedIdentifier }
        ]
      }
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'User is inactive' })
    }

    res.json(buildAuthResponse(user))
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, password, name, role } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' })
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' })
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
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        name: String(name).trim(),
        role: sanitizedRole
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
        isActive: true,
        createdAt: true
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json(user)
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

