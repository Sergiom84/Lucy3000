import { Request, Response } from 'express'
import { prisma } from '../../db'
import {
  buildBonoTemplateIdentityKey,
  buildNormalizedTemplateRow,
  createStoredBonoTemplate,
  getTemplateRowValue,
  normalizeCategoryMatch,
  normalizeSearchText,
  parseTemplatePrice,
  parseTemplateSessions,
  readBonoTemplates,
  selectBonoTemplateSheet,
  sortBonoTemplates,
  writeBonoTemplates
} from './templateCatalog'
import { loadWorkbookFromBuffer } from '../../utils/spreadsheet'

const normalizeMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const getBonoTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await readBonoTemplates()
    res.json(sortBonoTemplates(templates.filter((template) => template.isActive !== false)))
  } catch (error) {
    console.error('Get bono templates error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoTemplate = async (req: Request, res: Response) => {
  try {
    const category = String(req.body.category || '').trim()
    const description = String(req.body.description || '').trim()
    const serviceId = String(req.body.serviceId || '').trim()
    const totalSessions = Number.parseInt(String(req.body.totalSessions), 10)
    const price = normalizeMoney(Number(req.body.price || 0))
    const isActive = req.body.isActive !== false

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        name: true,
        serviceCode: true,
        category: true
      }
    })

    if (!service) {
      return res.status(404).json({ error: 'No se encontró el tratamiento base seleccionado' })
    }

    const templates = await readBonoTemplates()
    const templateIdentityKey = buildBonoTemplateIdentityKey(service.id, description, totalSessions)
    const duplicateTemplate = templateIdentityKey
      ? templates.find((template) => {
          const currentKey = buildBonoTemplateIdentityKey(
            template.serviceId,
            template.description,
            Number(template.totalSessions || 0)
          )
          return currentKey === templateIdentityKey
        })
      : null

    if (duplicateTemplate) {
      return res.status(409).json({
        error: 'Ya existe un bono con ese tratamiento, descripción y número de sesiones'
      })
    }

    const nextTemplate = createStoredBonoTemplate({
      category,
      description,
      service,
      totalSessions,
      price,
      isActive
    })

    await writeBonoTemplates([...templates, nextTemplate])
    res.status(201).json(nextTemplate)
  } catch (error) {
    console.error('Create bono template error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const renameBonoTemplateCategory = async (req: Request, res: Response) => {
  try {
    const currentCategory = String(req.body.currentCategory || '').trim()
    const nextCategory = String(req.body.nextCategory || '').trim()
    const templates = await readBonoTemplates()

    const matchingCount = templates.filter(
      (template) => normalizeCategoryMatch(template.category) === normalizeCategoryMatch(currentCategory)
    ).length

    if (matchingCount === 0) {
      return res.status(404).json({ error: 'La familia de bonos seleccionada no existe' })
    }

    const nextTemplates = templates.map((template) =>
      normalizeCategoryMatch(template.category) === normalizeCategoryMatch(currentCategory)
        ? {
            ...template,
            category: nextCategory
          }
        : template
    )

    await writeBonoTemplates(nextTemplates)

    res.json({
      message: 'Familia de bonos actualizada correctamente',
      category: nextCategory,
      affectedTemplates: matchingCount
    })
  } catch (error) {
    console.error('Rename bono template category error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteBonoTemplateCategory = async (req: Request, res: Response) => {
  try {
    const category = String(req.body.category || '').trim()
    const replacementCategory = String(req.body.replacementCategory || '').trim()
    const templates = await readBonoTemplates()

    const matchingCount = templates.filter(
      (template) => normalizeCategoryMatch(template.category) === normalizeCategoryMatch(category)
    ).length

    if (matchingCount === 0) {
      return res.status(404).json({ error: 'La familia de bonos seleccionada no existe' })
    }

    const nextTemplates = templates.map((template) =>
      normalizeCategoryMatch(template.category) === normalizeCategoryMatch(category)
        ? {
            ...template,
            category: replacementCategory
          }
        : template
    )

    await writeBonoTemplates(nextTemplates)

    res.json({
      message: 'Familia de bonos eliminada correctamente',
      category: replacementCategory,
      affectedTemplates: matchingCount
    })
  } catch (error) {
    console.error('Delete bono template category error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteBonoTemplateCategoryWithTemplates = async (req: Request, res: Response) => {
  try {
    const category = String(req.body.category || '').trim()
    const templates = await readBonoTemplates()

    const matchingTemplates = templates.filter(
      (template) => normalizeCategoryMatch(template.category) === normalizeCategoryMatch(category)
    )

    if (matchingTemplates.length === 0) {
      return res.status(404).json({ error: 'La familia de bonos seleccionada no existe' })
    }

    const nextTemplates = templates.filter(
      (template) => normalizeCategoryMatch(template.category) !== normalizeCategoryMatch(category)
    )

    await writeBonoTemplates(nextTemplates)

    res.json({
      message: 'Familia y bonos eliminados correctamente',
      affectedTemplates: matchingTemplates.length
    })
  } catch (error) {
    console.error('Delete bono template category with templates error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const importBonoTemplatesFromExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const workbook = await loadWorkbookFromBuffer(req.file.buffer)
    const selectedSheet = selectBonoTemplateSheet(workbook)

    if (!selectedSheet || selectedSheet.rawRows.length === 0) {
      return res.status(400).json({ error: 'No se encontró una hoja válida para importar bonos' })
    }

    const { sheetName, rawRows } = selectedSheet

    const services = await prisma.service.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        serviceCode: true,
        category: true
      }
    })

    const resolveService = (lookupValue: string) => {
      const normalizedLookup = normalizeSearchText(lookupValue)
      if (!normalizedLookup) return null

      return (
        services.find((service) => normalizeSearchText(service.serviceCode) === normalizedLookup) ||
        services.find((service) => normalizeSearchText(service.name) === normalizedLookup) ||
        services.find(
          (service) => normalizeSearchText(`${service.name} ${service.category}`) === normalizedLookup
        ) ||
        services.find((service) => normalizeSearchText(service.name).includes(normalizedLookup))
      )
    }

    const results = {
      success: 0,
      created: 0,
      updated: 0,
      errors: [] as { row: number; error: string }[],
      skipped: 0
    }

    const existingTemplates = await readBonoTemplates()
    const mergedTemplates = [...existingTemplates]
    const templateIndexByKey = new Map<string, number>()
    const processedTemplateKeys = new Set<string>()

    mergedTemplates.forEach((template, index) => {
      const templateKey = buildBonoTemplateIdentityKey(
        template.serviceId,
        template.description,
        Number(template.totalSessions || 0)
      )
      if (templateKey && !templateIndexByKey.has(templateKey)) {
        templateIndexByKey.set(templateKey, index)
      }
    })

    for (let i = 0; i < rawRows.length; i += 1) {
      const row = buildNormalizedTemplateRow(rawRows[i] || {})

      try {
        const category = String(
          getTemplateRowValue(row, ['Categoria', 'Categoría', 'Familia', 'family']) || ''
        ).trim()
        const serviceLookup = String(
          getTemplateRowValue(row, ['Codigo', 'Código', 'Servicio', 'Tratamiento', 'service']) || ''
        ).trim()
        const description = String(
          getTemplateRowValue(row, ['Descripcion', 'Descripción', 'Nombre', 'Bono']) || ''
        ).trim()
        const price = parseTemplatePrice(getTemplateRowValue(row, ['Tarifa 1', 'Tarifa', 'Precio', 'PVP']))
        const totalSessions =
          parseTemplateSessions(getTemplateRowValue(row, ['Sesiones', 'Total sesiones', 'Numero sesiones'])) ||
          parseTemplateSessions(description)

        if (!serviceLookup || !description) {
          results.skipped += 1
          continue
        }

        if (!totalSessions) {
          throw new Error('No se pudo deducir el número de sesiones')
        }

        const resolvedService = resolveService(serviceLookup)
        if (!resolvedService) {
          throw new Error(`No se encontró el tratamiento base: ${serviceLookup}`)
        }

        const templateKey = buildBonoTemplateIdentityKey(resolvedService.id, description, totalSessions)
        if (!templateKey) {
          throw new Error('No se pudo construir la identidad del bono importado')
        }

        if (processedTemplateKeys.has(templateKey)) {
          results.skipped += 1
          continue
        }

        const existingTemplateIndex = templateIndexByKey.get(templateKey)
        const nextTemplate = createStoredBonoTemplate({
          id: existingTemplateIndex !== undefined ? mergedTemplates[existingTemplateIndex].id : null,
          category,
          description,
          service: resolvedService,
          totalSessions,
          price,
          isActive: true,
          createdAt: existingTemplateIndex !== undefined ? mergedTemplates[existingTemplateIndex].createdAt : null
        })

        if (existingTemplateIndex !== undefined) {
          mergedTemplates[existingTemplateIndex] = nextTemplate
          results.updated += 1
        } else {
          mergedTemplates.push(nextTemplate)
          templateIndexByKey.set(templateKey, mergedTemplates.length - 1)
          results.created += 1
        }

        processedTemplateKeys.add(templateKey)
        results.success += 1
      } catch (error: any) {
        results.errors.push({
          row: i + 2,
          error: error.message
        })
        results.skipped += 1
      }
    }

    if (results.success > 0) {
      await writeBonoTemplates(mergedTemplates)
    }

    res.json({
      message: `Bonus catalog imported from ${sheetName}`,
      results
    })
  } catch (error) {
    console.error('Import bono templates error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
