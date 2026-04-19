import { Router } from 'express'
import {
  getSales,
  getSaleById,
  createSale,
  updateSale,
  collectPendingSale,
  deleteSale
} from '../controllers/sale.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createSaleBodySchema,
  collectPendingSaleBodySchema,
  saleIdParamSchema,
  salesQuerySchema,
  updateSaleBodySchema
} from '../validators/sale.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: salesQuerySchema }), getSales)
router.get('/:id', validateRequest({ params: saleIdParamSchema }), getSaleById)
router.post('/', validateRequest({ body: createSaleBodySchema }), createSale)
router.post(
  '/:id/collect-pending',
  validateRequest({ params: saleIdParamSchema, body: collectPendingSaleBodySchema }),
  collectPendingSale
)
router.put(
  '/:id',
  validateRequest({ params: saleIdParamSchema, body: updateSaleBodySchema }),
  updateSale
)
router.delete('/:id', validateRequest({ params: saleIdParamSchema }), deleteSale)

export default router

