import { Request, Response } from 'express'
import { prisma } from '../server'

export const getServices = async (req: Request, res: Response) => {
  try {
    const { isActive, category } = req.query

    const where: any = {}

    if (isActive !== undefined) {
      where.isActive = isActive === 'true'
    }

    if (category) {
      where.category = category
    }

    const services = await prisma.service.findMany({
      where,
      orderBy: { name: 'asc' }
    })

    res.json(services)
  } catch (error) {
    console.error('Get services error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getServiceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: { id }
    })

    if (!service) {
      return res.status(404).json({ error: 'Service not found' })
    }

    res.json(service)
  } catch (error) {
    console.error('Get service error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createService = async (req: Request, res: Response) => {
  try {
    const data = req.body

    const service = await prisma.service.create({
      data
    })

    res.status(201).json(service)
  } catch (error) {
    console.error('Create service error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = req.body

    const service = await prisma.service.update({
      where: { id },
      data
    })

    res.json(service)
  } catch (error) {
    console.error('Update service error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.service.delete({
      where: { id }
    })

    res.json({ message: 'Service deleted successfully' })
  } catch (error) {
    console.error('Delete service error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

