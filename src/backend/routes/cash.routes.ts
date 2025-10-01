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

const router = Router()

router.use(authMiddleware)

router.get('/', getCashRegisters)
router.get('/:id', getCashRegisterById)
router.post('/open', openCashRegister)
router.post('/:id/close', closeCashRegister)
router.post('/:id/movements', addCashMovement)
router.get('/:id/movements', getCashMovements)

export default router

