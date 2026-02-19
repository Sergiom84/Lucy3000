import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'

const parseDecimal = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const raw = String(value).trim().replace(/\s*€\s*/g, '').replace('%', '').replace(/\s/g, '')
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const parseDuration = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const firstSegment = String(value).split('-')[0]
  const onlyDigits = firstSegment.replace(/[^0-9]/g, '')
  const parsed = Number.parseInt(onlyDigits, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const normalizeServicePayload = (payload: Record<string, any>, partial = false) => {
  const data: Record<string, any> = { ...payload }

  if (!partial || data.name !== undefined) {
    data.name = String(data.name || '').trim()
  }

  if (data.serviceCode !== undefined) {
    const code = String(data.serviceCode || '').trim()
    data.serviceCode = code || null
  }

  if (!partial || data.category !== undefined) {
    const category = String(data.category || '').trim()
    data.category = category || 'General'
  }

  if (data.description !== undefined) {
    const description = String(data.description || '').trim()
    data.description = description || null
  }

  if (!partial || data.price !== undefined) {
    data.price = parseDecimal(data.price)
  }

  if (data.taxRate !== undefined) {
    data.taxRate = parseDecimal(data.taxRate)
  }

  if (!partial || data.duration !== undefined) {
    data.duration = parseDuration(data.duration)
  }

  return data
}

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
    const data = normalizeServicePayload(req.body)

    if (!data.name) {
      return res.status(400).json({ error: 'Description is required' })
    }

    if (data.price === null || data.price <= 0) {
      return res.status(400).json({ error: 'Tariff must be greater than 0' })
    }

    if (data.duration === null || data.duration <= 0) {
      return res.status(400).json({ error: 'Duration must be greater than 0 minutes' })
    }

    const service = await prisma.service.create({
      data: data as Prisma.ServiceCreateInput
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
    const data = normalizeServicePayload(req.body, true)

    if (data.price !== undefined && (data.price === null || data.price <= 0)) {
      return res.status(400).json({ error: 'Tariff must be greater than 0' })
    }

    if (data.duration !== undefined && (data.duration === null || data.duration <= 0)) {
      return res.status(400).json({ error: 'Duration must be greater than 0 minutes' })
    }

    const service = await prisma.service.update({
      where: { id },
      data: data as Prisma.ServiceUpdateInput
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

