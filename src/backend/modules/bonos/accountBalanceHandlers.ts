import { Response } from 'express'
import { AuthRequest } from '../../middleware/auth.middleware'
import {
  consumeAccountBalance as consumeAccountBalanceEntry,
  createAccountBalanceTopUp as createAccountBalanceTopUpEntry,
  getClientAccountBalanceHistory,
  getGlobalAccountBalanceHistory as getGlobalAccountBalanceHistoryEntry,
  updateAccountBalance as updateAccountBalanceEntry
} from './accountBalance'
import { toBonoHttpError } from './errors'

export const getAccountBalanceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const parsedLimit = Number.parseInt(String(req.query.limit ?? '50'), 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50

    const response = await getClientAccountBalanceHistory(clientId, limit)
    res.json(response)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Get account balance history error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const getGlobalAccountBalanceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit ?? '300'), 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 300

    const response = await getGlobalAccountBalanceHistoryEntry(limit)
    res.json(response)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Get global account balance history error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const createAccountBalanceTopUp = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { description, amount, paymentMethod, operationDate, notes } = req.body

    const response = await createAccountBalanceTopUpEntry({
      clientId,
      userId: req.user?.id,
      description,
      amount,
      paymentMethod,
      operationDate,
      notes
    })

    res.status(201).json(response)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Create account balance top-up error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const consumeAccountBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { operationDate, referenceItem, amount, notes, saleId, description } = req.body

    const response = await consumeAccountBalanceEntry({
      clientId,
      operationDate,
      referenceItem,
      amount,
      notes,
      saleId,
      description
    })

    res.status(201).json(response)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Consume account balance error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const updateAccountBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { accountBalance } = req.body

    const response = await updateAccountBalanceEntry({
      clientId,
      accountBalance
    })

    res.json(response)
  } catch (error) {
    const { statusCode, message } = toBonoHttpError(error)
    console.error('Update account balance error:', error)
    res.status(statusCode).json({ error: message })
  }
}
