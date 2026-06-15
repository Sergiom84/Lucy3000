import { Router } from 'express'
import { getPlatformDashboard } from '../controllers/platformDashboard.controller'

const router = Router()

router.post('/', getPlatformDashboard)

export default router
