import { Router } from 'express'
import {
  getSales,
  getSaleById,
  createSale,
  updateSale,
  deleteSale
} from '../controllers/sale.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', getSales)
router.get('/:id', getSaleById)
router.post('/', createSale)
router.put('/:id', updateSale)
router.delete('/:id', deleteSale)

export default router

