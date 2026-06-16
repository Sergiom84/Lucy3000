import { Router } from 'express'
import {
  createPlatformAccess,
  deletePlatformDashboardRow,
  getPlatformDashboard,
  updatePlatformDashboardRow
} from '../controllers/platformDashboard.controller'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createPlatformAccessBodySchema,
  deletePlatformDashboardRowBodySchema,
  platformDashboardBodySchema,
  platformDashboardRowParamsSchema,
  updatePlatformDashboardRowBodySchema
} from '../validators/platformDashboard.schemas'

const router = Router()

router.post('/', validateRequest({ body: platformDashboardBodySchema }), getPlatformDashboard)
router.post('/access', validateRequest({ body: createPlatformAccessBodySchema }), createPlatformAccess)
router.patch(
  '/rows/:rowId',
  validateRequest({ params: platformDashboardRowParamsSchema, body: updatePlatformDashboardRowBodySchema }),
  updatePlatformDashboardRow
)
router.delete(
  '/rows/:rowId',
  validateRequest({ params: platformDashboardRowParamsSchema, body: deletePlatformDashboardRowBodySchema }),
  deletePlatformDashboardRow
)

export default router
