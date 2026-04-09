import { Router } from 'express'
import {
  createQuote,
  getQuotesByClient,
  getQuoteById,
  updateQuoteStatus,
  deleteQuote
} from '../controllers/quote.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.post('/', createQuote)
router.get('/client/:clientId', getQuotesByClient)
router.get('/:id', getQuoteById)
router.put('/:id/status', updateQuoteStatus)
router.delete('/:id', deleteQuote)

export default router
