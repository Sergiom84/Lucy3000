import { prisma } from '../../db'
import { AppointmentModuleError } from './errors'

const normalizeLegendName = (value: unknown) => String(value || '').trim()
const normalizeLegendColor = (value: unknown) => String(value || '').trim().toUpperCase()
const normalizeLegendMatch = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()

const mapAppointmentLegend = (legend: {
  id: string
  name: string
  color: string
  sortOrder: number
}) => ({
  id: legend.id,
  category: legend.name,
  color: legend.color,
  sortOrder: legend.sortOrder
})

const getAppointmentLegendCategoriesCatalog = async () => {
  const services = await prisma.service.findMany({
    select: {
      category: true
    },
    orderBy: {
      category: 'asc'
    }
  })

  const categoriesByKey = new Map<string, string>()

  for (const service of services) {
    const category = String(service.category || '').trim()
    const key = normalizeLegendMatch(category)
    if (!key || categoriesByKey.has(key)) continue
    categoriesByKey.set(key, category)
  }

  return [...categoriesByKey.values()].sort((left, right) =>
    left.localeCompare(right, 'es', { sensitivity: 'base' })
  )
}

export const listAppointmentLegends = async () => {
  const legends = await prisma.appointmentLegend.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })

  return legends.map(mapAppointmentLegend)
}

export const listAppointmentLegendCategories = async () => getAppointmentLegendCategoriesCatalog()

export const createAppointmentLegendEntry = async (payload: { category?: unknown; color?: unknown }) => {
  const requestedCategory = normalizeLegendName(payload.category)
  const requestedCategoryKey = normalizeLegendMatch(requestedCategory)
  const nextColor = normalizeLegendColor(payload.color)
  const availableCategories = await getAppointmentLegendCategoriesCatalog()
  const matchedCategory =
    availableCategories.find((category) => normalizeLegendMatch(category) === requestedCategoryKey) || null

  if (!matchedCategory) {
    throw new AppointmentModuleError(400, 'La categoría seleccionada no existe en tratamientos')
  }

  const existingLegends = await prisma.appointmentLegend.findMany({
    select: {
      id: true,
      name: true,
      sortOrder: true
    }
  })

  const duplicateLegend = existingLegends.find(
    (legend) => normalizeLegendMatch(legend.name) === requestedCategoryKey
  )

  if (duplicateLegend) {
    throw new AppointmentModuleError(409, 'Ya existe una leyenda para esa categoría')
  }

  const nextSortOrder =
    existingLegends.reduce((maxValue, legend) => Math.max(maxValue, Number(legend.sortOrder || 0)), -1) + 1

  const legend = await prisma.appointmentLegend.create({
    data: {
      name: matchedCategory,
      color: nextColor,
      sortOrder: nextSortOrder
    }
  })

  return mapAppointmentLegend(legend)
}

export const deleteAppointmentLegendById = async (id: string) => {
  const legend = await prisma.appointmentLegend.findUnique({
    where: { id }
  })

  if (!legend) {
    throw new AppointmentModuleError(404, 'Leyenda no encontrada')
  }

  await prisma.appointmentLegend.delete({
    where: { id }
  })

  return { message: 'Leyenda eliminada correctamente' }
}
