import { Router } from 'express'
import {
  bootstrapAdmin,
  forgotPassword,
  getBootstrapStatus,
  login,
  register,
  resetPassword,
  getCurrentUser
} from '../controllers/auth.controller'
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  bootstrapAdminBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema
} from '../validators/auth.schemas'

const router = Router()

router.get('/bootstrap-status', getBootstrapStatus)
router.post('/bootstrap-admin', validateRequest({ body: bootstrapAdminBodySchema }), bootstrapAdmin)
router.post('/login', validateRequest({ body: loginBodySchema }), login)
router.post('/forgot-password', validateRequest({ body: forgotPasswordBodySchema }), forgotPassword)
router.post('/reset-password', validateRequest({ body: resetPasswordBodySchema }), resetPassword)
router.post(
  '/register',
  authMiddleware,
  adminMiddleware,
  validateRequest({ body: registerBodySchema }),
  register
)
router.get('/me', authMiddleware, getCurrentUser)

export default router

