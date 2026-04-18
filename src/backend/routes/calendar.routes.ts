import { Router } from 'express'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import {
  getAuthUrl,
  handleCallback,
  getConfig,
  updateConfig,
  disconnect
} from '../controllers/calendar.controller'
import { validateRequest } from '../middleware/validation.middleware'
import { updateCalendarConfigBodySchema } from '../validators/calendar.schemas'

const router = Router()

// Callback de OAuth2 (público, Google llama a esta URL)
router.get('/callback', handleCallback)

router.use(authMiddleware, adminMiddleware)

// Obtener URL de autorización
router.get('/auth/url', getAuthUrl)

// Obtener configuración actual
router.get('/config', getConfig)

// Actualizar configuración
router.put('/config', validateRequest({ body: updateCalendarConfigBodySchema }), updateConfig)

// Desconectar Google Calendar
router.post('/disconnect', disconnect)

export default router
