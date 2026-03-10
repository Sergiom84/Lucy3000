import { Request, Response } from 'express'
import { prisma } from '../db'

export const getClientBonos = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params

    const bonoPacks = await prisma.bonoPack.findMany({
      where: { clientId },
      include: {
        service: { select: { id: true, name: true } },
        sessions: { orderBy: { sessionNumber: 'asc' } }
      },
      orderBy: { purchaseDate: 'desc' }
    })

    res.json(bonoPacks)
  } catch (error) {
    console.error('Get client bonos error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoPack = async (req: Request, res: Response) => {
  try {
    const { clientId, name, serviceId, totalSessions, price, expiryDate, notes } = req.body

    if (!clientId || !name || !totalSessions || totalSessions < 1) {
      return res.status(400).json({ error: 'clientId, name and totalSessions (>= 1) are required' })
    }

    const bonoPack = await prisma.bonoPack.create({
      data: {
        clientId,
        name,
        serviceId: serviceId || null,
        totalSessions,
        price: price || 0,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        notes: notes || null,
        sessions: {
          create: Array.from({ length: totalSessions }, (_, i) => ({
            sessionNumber: i + 1
          }))
        }
      },
      include: {
        service: { select: { id: true, name: true } },
        sessions: { orderBy: { sessionNumber: 'asc' } }
      }
    })

    res.status(201).json(bonoPack)
  } catch (error) {
    console.error('Create bono pack error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const consumeSession = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params

    const bonoPack = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        sessions: { orderBy: { sessionNumber: 'asc' } },
        client: { select: { id: true, firstName: true, lastName: true } }
      }
    })

    if (!bonoPack) {
      return res.status(404).json({ error: 'BonoPack not found' })
    }

    if (bonoPack.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'BonoPack is not active' })
    }

    const nextAvailable = bonoPack.sessions.find(s => s.status === 'AVAILABLE')
    if (!nextAvailable) {
      return res.status(400).json({ error: 'No available sessions' })
    }

    await prisma.bonoSession.update({
      where: { id: nextAvailable.id },
      data: { status: 'CONSUMED', consumedAt: new Date() }
    })

    // Check if all sessions consumed
    const remainingAvailable = bonoPack.sessions.filter(s => s.status === 'AVAILABLE').length - 1
    if (remainingAvailable === 0) {
      await prisma.bonoPack.update({
        where: { id: bonoPackId },
        data: { status: 'DEPLETED' }
      })

      await prisma.notification.create({
        data: {
          type: 'BONO_DEPLETED',
          title: `Bono agotado: ${bonoPack.name}`,
          message: `El bono "${bonoPack.name}" de ${bonoPack.client.firstName} ${bonoPack.client.lastName} se ha agotado.`,
          priority: 'NORMAL'
        }
      })
    }

    // Return updated pack
    const updated = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        service: { select: { id: true, name: true } },
        sessions: { orderBy: { sessionNumber: 'asc' } }
      }
    })

    res.json(updated)
  } catch (error) {
    console.error('Consume session error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteBonoPack = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params

    await prisma.bonoPack.delete({
      where: { id: bonoPackId }
    })

    res.json({ message: 'BonoPack deleted successfully' })
  } catch (error) {
    console.error('Delete bono pack error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAccountBalance = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const { accountBalance } = req.body

    const client = await prisma.client.update({
      where: { id: clientId },
      data: { accountBalance: accountBalance !== null && accountBalance !== undefined ? Number(accountBalance) : null }
    })

    res.json(client)
  } catch (error) {
    console.error('Update account balance error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
