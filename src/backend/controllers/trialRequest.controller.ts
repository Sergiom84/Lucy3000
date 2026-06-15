import { Request, Response } from 'express'
import { sendTrialRequestEmail } from '../services/trialRequestEmail.service'

export const createTrialRequest = async (req: Request, res: Response) => {
  try {
    const result = await sendTrialRequestEmail(req.body)

    res.status(result.delivered ? 201 : 202).json({
      ok: true,
      delivered: result.delivered,
      copiedToRequester: result.copiedToRequester
    })
  } catch (error) {
    console.error('Create trial request error:', error)
    res.status(502).json({ error: 'No se pudo enviar la solicitud' })
  }
}
