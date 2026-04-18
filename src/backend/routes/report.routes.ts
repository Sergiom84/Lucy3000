import { Router } from 'express'
import {
  getSalesReport,
  getClientReport,
  getProductReport,
  getCashReport
} from '../controllers/report.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import { reportDateRangeQuerySchema } from '../validators/report.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/sales', validateRequest({ query: reportDateRangeQuerySchema }), getSalesReport)
router.get('/clients', getClientReport)
router.get('/products', getProductReport)
router.get('/cash', validateRequest({ query: reportDateRangeQuerySchema }), getCashReport)

export default router

