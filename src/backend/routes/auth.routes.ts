import { Router } from 'express'
import { login, register, getCurrentUser } from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.post('/login', login)
router.post('/register', register)
router.get('/me', authMiddleware, getCurrentUser)

export default router

