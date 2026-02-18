import { Router } from 'express'
import { login, register, getCurrentUser } from '../controllers/auth.controller'
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import { loginBodySchema, registerBodySchema } from '../validators/auth.schemas'

const router = Router()

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

