import { Router } from 'express'
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} from '../controllers/notification.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', getNotifications)
router.put('/:id/read', markAsRead)
router.put('/read-all', markAllAsRead)
router.delete('/:id', deleteNotification)

export default router

