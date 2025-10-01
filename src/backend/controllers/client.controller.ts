import { Request, Response } from 'express'
import { prisma } from '../server'

export const getClients = async (req: Request, res: Response) => {
  try {
    const { search, isActive } = req.query

    const where: any = {}

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true'
    }

    const clients = await prisma.client.findMany({
      where,
      include: {
        _count: {
          select: {
            appointments: true,
            sales: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(clients)
  } catch (error) {
    console.error('Get clients error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getClientById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        appointments: {
          include: {
            service: true,
            user: {
              select: { name: true }
            }
          },
          orderBy: { date: 'desc' },
          take: 10
        },
        sales: {
          include: {
            items: true
          },
          orderBy: { date: 'desc' },
          take: 10
        },
        clientHistory: {
          orderBy: { date: 'desc' }
        }
      }
    })

    if (!client) {
      return res.status(404).json({ error: 'Client not found' })
    }

    res.json(client)
  } catch (error) {
    console.error('Get client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createClient = async (req: Request, res: Response) => {
  try {
    const data = req.body

    const client = await prisma.client.create({
      data
    })

    res.status(201).json(client)
  } catch (error) {
    console.error('Create client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = req.body

    const client = await prisma.client.update({
      where: { id },
      data
    })

    res.json(client)
  } catch (error) {
    console.error('Update client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.client.delete({
      where: { id }
    })

    res.json({ message: 'Client deleted successfully' })
  } catch (error) {
    console.error('Delete client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getClientHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const history = await prisma.clientHistory.findMany({
      where: { clientId: id },
      orderBy: { date: 'desc' }
    })

    res.json(history)
  } catch (error) {
    console.error('Get client history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const addClientHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = req.body

    const history = await prisma.clientHistory.create({
      data: {
        ...data,
        clientId: id
      }
    })

    // Actualizar total gastado del cliente
    await prisma.client.update({
      where: { id },
      data: {
        totalSpent: {
          increment: data.amount
        }
      }
    })

    res.status(201).json(history)
  } catch (error) {
    console.error('Add client history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getBirthdaysThisMonth = async (_req: Request, res: Response) => {
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1

    const clients = await prisma.client.findMany({
      where: {
        isActive: true,
        birthDate: {
          not: null
        }
      }
    })

    const birthdaysThisMonth = clients.filter(client => {
      if (!client.birthDate) return false
      const birthMonth = new Date(client.birthDate).getMonth() + 1
      return birthMonth === currentMonth
    })

    res.json(birthdaysThisMonth)
  } catch (error) {
    console.error('Get birthdays error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

