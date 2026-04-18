import { Router } from 'express'
import {
  createUser,
  getAccountSettings,
  getUsers,
  updateAccountSettings,
  updateUserStatus
} from '../controllers/user.controller'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createUserBodySchema,
  updateAccountSettingsBodySchema,
  updateUserStatusBodySchema,
  userIdParamSchema
} from '../validators/user.schemas'

const router = Router()

router.use(authMiddleware)
router.use(adminMiddleware)

router.get('/', getUsers)
router.post('/', validateRequest({ body: createUserBodySchema }), createUser)
router.get('/:id/account-settings', validateRequest({ params: userIdParamSchema }), getAccountSettings)
router.patch(
  '/:id/account-settings',
  validateRequest({ params: userIdParamSchema, body: updateAccountSettingsBodySchema }),
  updateAccountSettings
)
router.patch(
  '/:id/status',
  validateRequest({ params: userIdParamSchema, body: updateUserStatusBodySchema }),
  updateUserStatus
)

export default router
