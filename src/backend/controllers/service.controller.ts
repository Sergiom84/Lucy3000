import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { loadWorkbookFromBuffer, worksheetToObjects } from '../utils/spreadsheet'

const buildSearchTerms = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)

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
    const { search, isActive, category } = req.query

    const where: any = {}

    if (typeof search === 'string' && search.trim()) {
      const searchTerms = buildSearchTerms(search)

      where.AND = searchTerms.map((term) => ({
        OR: [
          { name: { contains: term } },
          { serviceCode: { contains: term } },
          { category: { contains: term } },
          { description: { contains: term } }
        ]
      }))
    }

    if (isActive !== undefined) {
      where.isActive = typeof isActive === 'boolean' ? isActive : isActive === 'true'
    }

    if (category) {
      where.category = String(category)
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

const parseImportDecimal = (val: unknown): number => {
  if (val === null || val === undefined || String(val).trim() === '') return 0

  const raw = String(val).trim().replace(/\s*€\s*/g, '').replace('%', '').replace(/\s/g, '')
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.')
  const parsed = Number.parseFloat(normalized)

  return Number.isFinite(parsed) ? parsed : 0
}

const parseImportDuration = (val: unknown): number => {
  if (!val || String(val).trim() === '') return 30
  const first = String(val).split('-')[0].replace(/[^0-9]/g, '')
  const num = parseInt(first, 10)
  return isNaN(num) || num <= 0 ? 30 : num
}

const normalizeImportKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const buildNormalizedImportRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeImportKey(key)
    if (!normalizedKey || Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) continue
    normalized[normalizedKey] = value
  }

  return normalized
}

const getImportRowValue = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeImportKey(alias)
    if (!normalizedAlias || !Object.prototype.hasOwnProperty.call(row, normalizedAlias)) continue
    const value = row[normalizedAlias]
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }

  return null
}

export const importServicesFromExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const workbook = await loadWorkbookFromBuffer(req.file.buffer)
    const worksheet = workbook.worksheets[0]

    if (!worksheet) {
      return res.status(400).json({ error: 'No worksheet found in the uploaded file' })
    }

    const data = worksheetToObjects(worksheet)

    const results = {
      success: 0,
      errors: [] as { row: number; error: string }[],
      skipped: 0
    }

    let currentCategory = 'Sin categoria'

    for (let i = 0; i < data.length; i++) {
      const row = buildNormalizedImportRow(data[i] || {})

      try {
        const code = String(getImportRowValue(row, ['Codigo', 'Código', 'ID', 'Code']) || '').trim()
        const desc = String(
          getImportRowValue(row, ['Descripcion', 'Descripción', 'Nombre', 'Tratamiento', 'Servicio']) ??
            ''
        ).trim()
        const categoryRaw = getImportRowValue(row, ['Categoria', 'Categoría', 'Familia', 'Category'])
        const tarifaRaw = getImportRowValue(row, ['Tarifa 1', 'Tarifa1', 'Tarifa', 'Precio', 'Price', 'PVP'])
        const ivaRaw = getImportRowValue(row, ['IVA', 'Impuesto'])
        const tiempoRaw = getImportRowValue(row, ['Tiempo', 'Duracion', 'Duración', 'Minutos'])

        // Detect category header rows
        if (code === '\u02C4\u02C5' || code === '˄˅') {
          if (desc) currentCategory = desc
          continue
        }

        // Skip header-like rows
        if (!code || !desc) continue
        if (String(tarifaRaw).trim() === 'Tarifa 1' || String(tarifaRaw).trim() === 'Tarifa') continue

        const explicitCategory = String(categoryRaw ?? '').trim()
        const price = parseImportDecimal(tarifaRaw)
        const duration = parseImportDuration(tiempoRaw)
        const taxRate = ivaRaw !== undefined && ivaRaw !== null ? parseImportDecimal(ivaRaw) : null
        const category = explicitCategory || currentCategory

        if (price <= 0) {
          throw new Error(`Tarifa inválida o ausente: ${String(tarifaRaw ?? '').trim() || '(vacío)'}`)
        }

        const serviceData = {
          name: desc,
          description: code ? `Codigo: ${code}` : null,
          price,
          duration,
          category,
          serviceCode: code || null,
          taxRate,
          isActive: true
        }

        const matchingServices = await prisma.service.findMany({
          where: code
            ? {
                OR: [
                  { serviceCode: code },
                  { name: desc, category }
                ]
              }
            : {
                name: desc,
                category
              }
        })

        if (matchingServices.length > 0) {
          await Promise.all(
            matchingServices.map((service) =>
              prisma.service.update({
                where: { id: service.id },
                data: serviceData
              })
            )
          )
        } else {
          await prisma.service.create({
            data: serviceData
          })
        }

        results.success++
      } catch (error: any) {
        results.errors.push({
          row: i + 2,
          error: error.message
        })
        results.skipped++
      }
    }

    res.json({ message: 'Import completed', results })
  } catch (error) {
    console.error('Import services error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
