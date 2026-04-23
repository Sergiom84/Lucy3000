import { Prisma } from '@prisma/client'
import type { AuthRequest } from '../../middleware/auth.middleware'
import { prisma } from '../../db'
import { syncDebtNotification } from '../../utils/clientDebt'
import { notifyAdminsAboutResourceCreation } from '../../utils/notifications'
import { ClientModuleError } from './errors'
import { normalizeClientPayload } from './shared'

const ensureLinkedClientExists = async (linkedClientId: string) => {
  const linkedClient = await prisma.client.findUnique({
    where: { id: linkedClientId },
    select: { id: true }
  })

  if (!linkedClient) {
    throw new ClientModuleError(400, 'Linked client not found')
  }
}

export const createClientRecord = async (
  payload: Record<string, any>,
  user?: AuthRequest['user']
) => {
  const data = normalizeClientPayload(payload)

  if (!data.gender) {
    throw new ClientModuleError(400, 'Gender must be HOMBRE or MUJER')
  }

  if (data.linkedClientId && typeof data.linkedClientId === 'string') {
    await ensureLinkedClientExists(data.linkedClientId)
  }

  const client = await prisma.client.create({
    data: data as Prisma.ClientCreateInput
  })

  await syncDebtNotification(prisma, client)
  await notifyAdminsAboutResourceCreation(user, 'client', 1)

  return client
}

export const updateClientRecord = async (id: string, payload: Record<string, any>) => {
  const hasGenderInPayload = Object.prototype.hasOwnProperty.call(payload, 'gender')
  const data = normalizeClientPayload(payload, false)

  if (hasGenderInPayload && !data.gender) {
    throw new ClientModuleError(400, 'Gender must be HOMBRE or MUJER')
  }

  if (data.linkedClientId && data.linkedClientId === id) {
    throw new ClientModuleError(400, 'A client cannot be linked to itself')
  }

  if (data.linkedClientId && typeof data.linkedClientId === 'string') {
    await ensureLinkedClientExists(data.linkedClientId)
  }

  const client = await prisma.client.update({
    where: { id },
    data: data as Prisma.ClientUpdateInput
  })

  await syncDebtNotification(prisma, client)

  return client
}

export const deleteClientRecord = async (id: string) => {
  await prisma.client.delete({
    where: { id }
  })

  return { message: 'Client deleted successfully' }
}
