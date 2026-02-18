import { Router } from 'express'
import {
  getSales,
  getSaleById,
  createSale,
  updateSale,
  deleteSale
} from '../controllers/sale.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createSaleBodySchema,
  saleIdParamSchema,
  salesQuerySchema,
  updateSaleBodySchema
} from '../validators/sale.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: salesQuerySchema }), getSales)
router.get('/:id', validateRequest({ params: saleIdParamSchema }), getSaleById)
router.post('/', validateRequest({ body: createSaleBodySchema }), createSale)
router.put(
  '/:id',
  validateRequest({ params: saleIdParamSchema, body: updateSaleBodySchema }),
  updateSale
)
router.delete('/:id', validateRequest({ params: saleIdParamSchema }), deleteSale)

export default router

