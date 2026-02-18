import { Router } from 'express'
import {
  getCashRegisters,
  getCashRegisterById,
  openCashRegister,
  closeCashRegister,
  addCashMovement,
  getCashMovements
} from '../controllers/cash.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  addCashMovementBodySchema,
  cashIdParamSchema,
  cashListQuerySchema,
  closeCashRegisterBodySchema,
  openCashRegisterBodySchema
} from '../validators/cash.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: cashListQuerySchema }), getCashRegisters)
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

export default router

