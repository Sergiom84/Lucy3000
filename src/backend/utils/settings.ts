import { prisma } from '../db'
import { getTenantId } from '../tenant/context'

const isMissingUniqueConstraintError = (error: unknown) =>
  error instanceof Error && error.message.includes('ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint')

export const getSettingByKey = (key: string) => {
  const tenantId = getTenantId()

  if (tenantId) {
    return prisma.setting.findFirst({
      where: { tenantId, key },
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
  const data = {
    value: payload.value,
    description: payload.description ?? null
  }

  if (tenantId) {
    try {
      return await prisma.setting.upsert({
        where: {
          tenantId_key: {
            tenantId,
            key: payload.key
          }
        },
        update: data,
        create: {
          tenantId,
          key: payload.key,
          ...data
        }
      })
    } catch (error) {
      if (!isMissingUniqueConstraintError(error)) {
        throw error
      }

      const updated = await prisma.setting.updateMany({
        where: { tenantId, key: payload.key },
        data
      })

      if (updated.count > 0) {
        return prisma.setting.findFirst({
          where: { tenantId, key: payload.key }
        })
      }

      return prisma.setting.create({
        data: {
          tenantId,
          key: payload.key,
          ...data
        }
      })
    }
  }

  try {
    return await (prisma.setting as any).upsert({
      where: { key: payload.key },
      update: data,
      create: {
        key: payload.key,
        ...data
      }
    })
  } catch (error) {
    if (!isMissingUniqueConstraintError(error)) {
      throw error
    }

    const updated = await prisma.setting.updateMany({
      where: { key: payload.key },
      data
    })

    if (updated.count > 0) {
      return prisma.setting.findFirst({
        where: { key: payload.key }
      })
    }

    return prisma.setting.create({
      data: {
        key: payload.key,
        ...data
      }
    })
  }
}
