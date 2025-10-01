import { Router } from 'express'
import {
  getSalesReport,
  getClientReport,
  getProductReport,
  getCashReport
} from '../controllers/report.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/sales', getSalesReport)
router.get('/clients', getClientReport)
router.get('/products', getProductReport)
router.get('/cash', getCashReport)

export default router

