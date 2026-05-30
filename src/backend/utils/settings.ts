import { prisma } from '../db'
import { getTenantId } from '../tenant/context'

export const getSettingByKey = (key: string) => {
  const tenantId = getTenantId()

  if (tenantId) {
    return prisma.setting.findFirst({
      where: { key },
      select: { value: true }
    })
  }

  return (prisma.setting as any).findUnique({
    where: { key },
    select: { value: true }
  })
}

export const saveSettingByKey = async (payload: {
  key: string
  value: string
  description?: string | null
}) => {
  const tenantId = getTenantId()

  if (tenantId) {
    return prisma.setting.upsert({
      where: {
        tenantId_key: {
          tenantId,
          key: payload.key
        }
      },
      update: {
        value: payload.value,
        description: payload.description ?? null
      },
      create: {
        tenantId,
        key: payload.key,
        value: payload.value,
        description: payload.description ?? null
      }
    })
  }

  return (prisma.setting as any).upsert({
    where: { key: payload.key },
    update: {
      value: payload.value,
      description: payload.description ?? null
    },
    create: {
      key: payload.key,
      value: payload.value,
      description: payload.description ?? null
    }
  })
}
