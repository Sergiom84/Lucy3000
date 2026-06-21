import { Router } from 'express'
import { getDashboardStats } from '../controllers/dashboard.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { requireSectionAccess } from '../middleware/permissions.middleware'

const router = Router()

router.use(authMiddleware)
router.use(requireSectionAccess('dashboard'))

router.get('/stats', getDashboardStats)

export default router

