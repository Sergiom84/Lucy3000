import { Router } from 'express'
import { getClientRanking } from '../controllers/ranking.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', getClientRanking)

export default router
