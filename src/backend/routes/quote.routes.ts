import { Router } from 'express'
import {
  createQuote,
  getQuotesByClient,
  getQuoteById,
  updateQuoteStatus,
  deleteQuote
} from '../controllers/quote.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createQuoteBodySchema,
  quoteClientIdParamSchema,
  quoteIdParamSchema,
  updateQuoteStatusBodySchema
} from '../validators/quote.schemas'

const router = Router()

router.use(authMiddleware)

router.post('/', validateRequest({ body: createQuoteBodySchema }), createQuote)
router.get('/client/:clientId', validateRequest({ params: quoteClientIdParamSchema }), getQuotesByClient)
router.get('/:id', validateRequest({ params: quoteIdParamSchema }), getQuoteById)
router.put(
  '/:id/status',
  validateRequest({ params: quoteIdParamSchema, body: updateQuoteStatusBodySchema }),
  updateQuoteStatus
)
router.delete('/:id', validateRequest({ params: quoteIdParamSchema }), deleteQuote)

export default router
