import { Router } from 'express'
import {
  createTenant,
  getCurrentTenantLicense,
  getTenants,
  startCurrentTenantTrial,
  updateTenantLicense
} from '../controllers/tenant.controller'
import { authMiddleware, platformAdminMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createTenantBodySchema,
  tenantIdParamSchema,
  updateTenantLicenseBodySchema
} from '../validators/tenant.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/current/license', getCurrentTenantLicense)
router.post('/current/start-trial', startCurrentTenantTrial)

router.use(platformAdminMiddleware)

router.get('/', getTenants)
router.post('/', validateRequest({ body: createTenantBodySchema }), createTenant)
router.put(
  '/:id/license',
  validateRequest({ params: tenantIdParamSchema, body: updateTenantLicenseBodySchema }),
  updateTenantLicense
)

export default router
