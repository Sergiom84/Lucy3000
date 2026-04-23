import { Request, Response } from 'express'
import { AuthRequest } from '../../middleware/auth.middleware'
import { getAnalyticsRows, getCashRankingData } from './analytics'
import { toCashHttpError } from './errors'
import { getPrivateNoTicketCashSalesData } from './privateCash'
import {
  addCashMovementData,
  closeCashRegisterData,
  createCashCountData,
  getCashMovementsData,
  getCashRegisterByIdData,
  getCashRegistersData,
  listCashCountsData,
  openCashRegisterData,
  updateOpeningBalanceData
} from './registers'
import { buildCashSummary } from './summary'

const handleCashError = (res: Response, label: string, error: unknown) => {
  const handledError = toCashHttpError(error)
  if (handledError) {
    return res.status(handledError.statusCode).json(handledError.body)
  }

  console.error(`${label}:`, error)
  return res.status(500).json({ error: 'Internal server error' })
}

export const getPrivateNoTicketCashSales = async (req: Request, res: Response) => {
  try {
    const payload = await getPrivateNoTicketCashSalesData(req.query)
    res.json(payload)
  } catch (error) {
    handleCashError(res, 'Get private no-ticket cash sales error', error)
  }
}

export const getCashRegisters = async (req: Request, res: Response) => {
  try {
    const cashRegisters = await getCashRegistersData(req.query)
    res.json(cashRegisters)
  } catch (error) {
    handleCashError(res, 'Get cash registers error', error)
  }
}

export const getCashRegisterById = async (req: Request, res: Response) => {
  try {
    const cashRegister = await getCashRegisterByIdData(req.params.id)
    res.json(cashRegister)
  } catch (error) {
    handleCashError(res, 'Get cash register error', error)
  }
}

export const getCashSummary = async (req: Request, res: Response) => {
  try {
    const referenceDate = req.query?.referenceDate ? new Date(req.query.referenceDate as string) : new Date()
    const summary = await buildCashSummary(referenceDate)
    res.json(summary)
  } catch (error) {
    handleCashError(res, 'Get cash summary error', error)
  }
}

export const getCashAnalytics = async (req: Request, res: Response) => {
  try {
    const rows = await getAnalyticsRows(req.query)
    res.json({ rows })
  } catch (error) {
    handleCashError(res, 'Get cash analytics error', error)
  }
}

export const getCashRanking = async (req: Request, res: Response) => {
  try {
    const ranking = await getCashRankingData(req.query)
    res.json(ranking)
  } catch (error) {
    handleCashError(res, 'Get cash ranking error', error)
  }
}

export const openCashRegister = async (req: Request, res: Response) => {
  try {
    const cashRegister = await openCashRegisterData(req.body)
    res.status(201).json(cashRegister)
  } catch (error) {
    handleCashError(res, 'Open cash register error', error)
  }
}

export const closeCashRegister = async (req: AuthRequest, res: Response) => {
  try {
    const updatedCashRegister = await closeCashRegisterData(req.params.id, req.body, req.user?.id)
    res.json(updatedCashRegister)
  } catch (error) {
    handleCashError(res, 'Close cash register error', error)
  }
}

export const addCashMovement = async (req: AuthRequest, res: Response) => {
  try {
    const movement = await addCashMovementData(req.params.id, req.user!.id, req.body)
    res.status(201).json(movement)
  } catch (error) {
    handleCashError(res, 'Add cash movement error', error)
  }
}

export const getCashMovements = async (req: Request, res: Response) => {
  try {
    const movements = await getCashMovementsData(req.params.id)
    res.json(movements)
  } catch (error) {
    handleCashError(res, 'Get cash movements error', error)
  }
}

export const updateOpeningBalance = async (req: AuthRequest, res: Response) => {
  try {
    const updatedCashRegister = await updateOpeningBalanceData(req.params.id, req.user!.id, req.body)
    res.json(updatedCashRegister)
  } catch (error) {
    handleCashError(res, 'Update opening balance error', error)
  }
}

export const createCashCount = async (req: AuthRequest, res: Response) => {
  try {
    const created = await createCashCountData(req.params.id, req.user!.id, req.body)
    res.status(201).json(created)
  } catch (error) {
    handleCashError(res, 'Create cash count error', error)
  }
}

export const listCashCounts = async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20
    const counts = await listCashCountsData(req.params.id, limit)
    res.json(counts)
  } catch (error) {
    handleCashError(res, 'List cash counts error', error)
  }
}
