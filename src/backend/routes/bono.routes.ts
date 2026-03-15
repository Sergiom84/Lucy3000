import { Router } from 'express'
import {
  getClientBonos,
  createBonoPack,
  consumeSession,
  deleteBonoPack,
  updateAccountBalance,
  getAccountBalanceHistory,
  createAccountBalanceTopUp,
  consumeAccountBalance
} from '../controllers/bono.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  accountBalanceConsumeBodySchema,
  accountBalanceHistoryQuerySchema,
  accountBalanceTopUpBodySchema,
  bonoPackIdParamSchema,
  clientIdParamSchema
} from '../validators/bono.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/client/:clientId', validateRequest({ params: clientIdParamSchema }), getClientBonos)
router.post('/', createBonoPack)
router.put('/:bonoPackId/consume', validateRequest({ params: bonoPackIdParamSchema }), consumeSession)
router.delete('/:bonoPackId', validateRequest({ params: bonoPackIdParamSchema }), deleteBonoPack)
router.get(
  '/account-balance/:clientId/history',
  validateRequest({ params: clientIdParamSchema, query: accountBalanceHistoryQuerySchema }),
  getAccountBalanceHistory
)
router.post(
  '/account-balance/:clientId/top-up',
  validateRequest({ params: clientIdParamSchema, body: accountBalanceTopUpBodySchema }),
  createAccountBalanceTopUp
)
router.post(
  '/account-balance/:clientId/consume',
  validateRequest({ params: clientIdParamSchema, body: accountBalanceConsumeBodySchema }),
  consumeAccountBalance
)
router.put('/account-balance/:clientId', validateRequest({ params: clientIdParamSchema }), updateAccountBalance)

export default router
