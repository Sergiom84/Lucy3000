import { Router } from 'express'
import { getClientRanking } from '../controllers/ranking.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { requireSectionAccess } from '../middleware/permissions.middleware'

const router = Router()

router.use(authMiddleware)
router.use(requireSectionAccess('ranking'))

router.get('/', getClientRanking)

export default router
