import { Router } from 'express'
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} from '../controllers/notification.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  notificationIdParamSchema,
  notificationsQuerySchema
} from '../validators/notification.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: notificationsQuerySchema }), getNotifications)
router.put('/:id/read', validateRequest({ params: notificationIdParamSchema }), markAsRead)
router.put('/read-all', markAllAsRead)
router.delete('/:id', validateRequest({ params: notificationIdParamSchema }), deleteNotification)

export default router

