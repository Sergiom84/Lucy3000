import { Request, Response } from 'express'
import { prisma } from '../server'
import { AuthRequest } from '../middleware/auth.middleware'

export const getCashRegisters = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status } = req.query

    const where: any = {}

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      }
    }

    if (status) {
      where.status = status
    }

    const cashRegisters = await prisma.cashRegister.findMany({
      where,
      include: {
        movements: true
      },
      orderBy: { date: 'desc' }
    })

    res.json(cashRegisters)
  } catch (error) {
    console.error('Get cash registers error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashRegisterById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const cashRegister = await prisma.cashRegister.findUnique({
      where: { id },
      include: {
        movements: {
          include: {
            user: {
              select: { name: true }
            }
          },
          orderBy: { date: 'desc' }
        }
      }
    })

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' })
    }

    res.json(cashRegister)
  } catch (error) {
    console.error('Get cash register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const openCashRegister = async (req: Request, res: Response) => {
  try {
    const { openingBalance, notes } = req.body

    // Verificar si ya hay una caja abierta
    const openCashRegister = await prisma.cashRegister.findFirst({
      where: { status: 'OPEN' }
    })

    if (openCashRegister) {
      return res.status(400).json({ error: 'There is already an open cash register' })
    }

    const cashRegister = await prisma.cashRegister.create({
      data: {
        openingBalance,
        notes
      }
    })

    res.status(201).json(cashRegister)
  } catch (error) {
    console.error('Open cash register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const closeCashRegister = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { closingBalance, notes } = req.body

    const cashRegister = await prisma.cashRegister.findUnique({
      where: { id },
      include: {
        movements: true
      }
    })

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' })
    }

    if (cashRegister.status === 'CLOSED') {
      return res.status(400).json({ error: 'Cash register is already closed' })
    }

    // Calcular balance esperado
    let expectedBalance = cashRegister.openingBalance

    for (const movement of cashRegister.movements) {
      if (movement.type === 'INCOME' || movement.type === 'DEPOSIT') {
        expectedBalance = expectedBalance.add(movement.amount)
      } else if (movement.type === 'EXPENSE' || movement.type === 'WITHDRAWAL') {
        expectedBalance = expectedBalance.sub(movement.amount)
      }
    }

    const difference = closingBalance - Number(expectedBalance)

    const updatedCashRegister = await prisma.cashRegister.update({
      where: { id },
      data: {
        closingBalance,
        expectedBalance,
        difference,
        status: 'CLOSED',
        closedAt: new Date(),
        notes
      }
    })

    res.json(updatedCashRegister)
  } catch (error) {
    console.error('Close cash register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const addCashMovement = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { type, amount, category, description, reference } = req.body

    const cashRegister = await prisma.cashRegister.findUnique({
      where: { id }
    })

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' })
    }

    if (cashRegister.status === 'CLOSED') {
      return res.status(400).json({ error: 'Cannot add movements to a closed cash register' })
    }

    const movement = await prisma.cashMovement.create({
      data: {
        cashRegisterId: id,
        userId: req.user!.id,
        type,
        amount,
        category,
        description,
        reference
      },
      include: {
        user: {
          select: { name: true }
        }
      }
    })

    res.status(201).json(movement)
  } catch (error) {
    console.error('Add cash movement error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashMovements = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const movements = await prisma.cashMovement.findMany({
      where: { cashRegisterId: id },
      include: {
        user: {
          select: { name: true }
        }
      },
      orderBy: { date: 'desc' }
    })

    res.json(movements)
  } catch (error) {
    console.error('Get cash movements error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

