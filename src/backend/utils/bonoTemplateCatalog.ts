import { prisma } from '../db'
import type { ComparableBonoTemplate } from './bonoServiceMatch'

const BONO_TEMPLATES_SETTING_KEY = 'bono_templates_catalog'

export const readAppointmentBonoTemplates = async (): Promise<ComparableBonoTemplate[]> => {
  const setting = await prisma.setting.findUnique({
    where: { key: BONO_TEMPLATES_SETTING_KEY }
  })

  if (!setting) {
    return []
  }

  try {
    const parsed = JSON.parse(setting.value)
    return Array.isArray(parsed) ? (parsed as ComparableBonoTemplate[]) : []
  } catch {
    return []
  }
}
