import { Router } from 'express'
import {
  bootstrapAdmin,
  getBootstrapStatus,
  login,
  register,
  getCurrentUser
} from '../controllers/auth.controller'
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  bootstrapAdminBodySchema,
  loginBodySchema,
  registerBodySchema
} from '../validators/auth.schemas'

const router = Router()

router.get('/bootstrap-status', getBootstrapStatus)
router.post('/bootstrap-admin', validateRequest({ body: bootstrapAdminBodySchema }), bootstrapAdmin)
router.post('/login', validateRequest({ body: loginBodySchema }), login)
router.post(
  '/register',
  authMiddleware,
  adminMiddleware,
  validateRequest({ body: registerBodySchema }),
  register
)
router.get('/me', authMiddleware, getCurrentUser)

export default router

