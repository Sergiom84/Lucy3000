import { Router } from 'express'
import { getDashboardStats } from '../controllers/dashboard.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/stats', getDashboardStats)

export default router

