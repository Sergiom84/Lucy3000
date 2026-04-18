import { Router } from 'express'
import {
  getCashSummary,
  getCashAnalytics,
  getCashRanking,
  getCashRegisters,
  getCashRegisterById,
  openCashRegister,
  closeCashRegister,
  addCashMovement,
  getCashMovements,
  updateOpeningBalance,
  getPrivateNoTicketCashSales
} from '../controllers/cash.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  addCashMovementBodySchema,
  cashAnalyticsQuerySchema,
  cashIdParamSchema,
  cashListQuerySchema,
  cashSummaryQuerySchema,
  closeCashRegisterBodySchema,
  openCashRegisterBodySchema,
  privateNoTicketCashQuerySchema,
  updateOpeningBalanceBodySchema
} from '../validators/cash.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: cashListQuerySchema }), getCashRegisters)
router.get('/summary', validateRequest({ query: cashSummaryQuerySchema }), getCashSummary)
router.get(
  '/private/no-ticket-cash',
  validateRequest({ query: privateNoTicketCashQuerySchema }),
  getPrivateNoTicketCashSales
)
router.get('/analytics', validateRequest({ query: cashAnalyticsQuerySchema }), getCashAnalytics)
router.get('/analytics/ranking', validateRequest({ query: cashAnalyticsQuerySchema }), getCashRanking)
router.get('/:id', validateRequest({ params: cashIdParamSchema }), getCashRegisterById)
router.post('/open', validateRequest({ body: openCashRegisterBodySchema }), openCashRegister)
router.post(
  '/:id/close',
  validateRequest({ params: cashIdParamSchema, body: closeCashRegisterBodySchema }),
  closeCashRegister
)
router.post(
  '/:id/movements',
  validateRequest({ params: cashIdParamSchema, body: addCashMovementBodySchema }),
  addCashMovement
)
router.get('/:id/movements', validateRequest({ params: cashIdParamSchema }), getCashMovements)
router.put(
  '/:id/opening-balance',
  validateRequest({ params: cashIdParamSchema, body: updateOpeningBalanceBodySchema }),
  updateOpeningBalance
)

export default router
