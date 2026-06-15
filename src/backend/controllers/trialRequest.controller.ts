import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { sendTrialRequestEmail } from '../services/trialRequestEmail.service'

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const normalizePhone = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || null
}

export const createTrialRequest = async (req: Request, res: Response) => {
  let trialRequestId: string | null = null

  try {
    const normalizedEmail = normalizeEmail(req.body.email)
    const normalizedPhone = normalizePhone(req.body.phone)

    const trialRequest = await prisma.trialRequest.create({
      data: {
        name: String(req.body.name || '').trim(),
        email: String(req.body.email || '').trim(),
        normalizedEmail,
        phone: String(req.body.phone || '').trim() || null,
        normalizedPhone,
        status: 'PENDING_REPLY'
      }
    })
    trialRequestId = trialRequest.id

    const result = await sendTrialRequestEmail(req.body)

    await prisma.trialRequest.update({
      where: { id: trialRequest.id },
      data: {
        ownerEmailDeliveredAt: result.delivered ? new Date() : null,
        requesterEmailDeliveredAt: result.copiedToRequester ? new Date() : null,
        ownerEmailId: result.ownerEmailId || null,
        requesterEmailId: result.requesterEmailId || null,
        lastDeliveryError: null
      }
    })

    res.status(result.delivered ? 201 : 202).json({
      ok: true,
      delivered: result.delivered,
      copiedToRequester: result.copiedToRequester
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : String(error.meta?.target || '')
      const field = target.includes('normalizedPhone') ? 'telefono' : 'correo'

      return res.status(409).json({
        error: `Ya existe una solicitud con este ${field}. Te responderé en cuanto la revise.`
      })
    }

    if (trialRequestId) {
      await prisma.trialRequest.update({
        where: { id: trialRequestId },
        data: {
          status: 'EMAIL_FAILED',
          lastDeliveryError: error instanceof Error ? error.message : 'Unknown delivery error'
        }
      }).catch(() => undefined)
    }

    console.error('Create trial request error:', error)
    res.status(502).json({ error: 'No se pudo enviar la solicitud' })
  }
}
