import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../db'
import type { AuthRequest } from '../middleware/auth.middleware'
import { getProfessionalCatalog, saveProfessionalCatalog } from '../utils/professional-catalog'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeUsername = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}

const userSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} as const

export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }]
    })

    res.json(users)
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAccountSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const professionalNames = await getProfessionalCatalog()

    res.json({
      ...user,
      professionalNames
    })
  } catch (error) {
    console.error('Get account settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { email, username, password, name, role } = req.body
    const normalizedEmail = normalizeEmail(email)
    const normalizedUsername = normalizeUsername(username)

    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: normalizedEmail },
          ...(normalizedUsername ? [{ username: normalizedUsername }] : [])
        ]
      },
      select: { id: true, email: true, username: true }
    })

    if (existingUsers.some((user) => user.email === normalizedEmail)) {
      return res.status(400).json({ error: 'Email already exists' })
    }

    if (normalizedUsername && existingUsers.some((user) => user.username === normalizedUsername)) {
      return res.status(400).json({ error: 'Username already exists' })
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedUsername,
        password: await bcrypt.hash(password, 10),
        name: String(name).trim(),
        role
      },
      select: userSelect
    })

    res.status(201).json(user)
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAccountSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { email, username, password, name, professionalNames } = req.body

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true
      }
    })

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    const normalizedEmail = email !== undefined ? normalizeEmail(email) : undefined
    const normalizedUsername = username !== undefined ? normalizeUsername(username) : undefined

    if (normalizedEmail !== undefined || normalizedUsername !== undefined) {
      const duplicateUsers = await prisma.user.findMany({
        where: {
          id: { not: id },
          OR: [
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            ...(normalizedUsername ? [{ username: normalizedUsername }] : [])
          ]
        },
        select: {
          id: true,
          email: true,
          username: true
        }
      })

      if (normalizedEmail && duplicateUsers.some((user) => user.email === normalizedEmail)) {
        return res.status(400).json({ error: 'Email already exists' })
      }

      if (normalizedUsername && duplicateUsers.some((user) => user.username === normalizedUsername)) {
        return res.status(400).json({ error: 'Username already exists' })
      }
    }

    const data: {
      email?: string
      username?: string | null
      password?: string
      name?: string
    } = {}

    if (normalizedEmail !== undefined) data.email = normalizedEmail
    if (normalizedUsername !== undefined) data.username = normalizedUsername
    if (name !== undefined) data.name = String(name).trim()
    if (password !== undefined) data.password = await bcrypt.hash(String(password), 10)

    const user =
      Object.keys(data).length > 0
        ? await prisma.user.update({
            where: { id },
            data,
            select: userSelect
          })
        : await prisma.user.findUnique({
            where: { id },
            select: userSelect
          })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const nextProfessionalNames =
      professionalNames !== undefined ? await saveProfessionalCatalog(professionalNames) : await getProfessionalCatalog()

    res.json({
      ...user,
      professionalNames: nextProfessionalNames
    })
  } catch (error) {
    console.error('Update account settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { isActive } = req.body

    if (req.user?.id === id && isActive === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: userSelect
    })

    res.json(user)
  } catch (error) {
    console.error('Update user status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
