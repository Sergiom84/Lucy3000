import { Router } from 'express'
import {
  createDashboardReminder,
  getDashboardReminders,
  toggleDashboardReminder
} from '../controllers/reminder.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createDashboardReminderBodySchema,
  dashboardReminderIdParamSchema,
  toggleDashboardReminderBodySchema
} from '../validators/reminder.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', getDashboardReminders)
router.post('/', validateRequest({ body: createDashboardReminderBodySchema }), createDashboardReminder)
router.patch(
  '/:id/toggle',
  validateRequest({ params: dashboardReminderIdParamSchema, body: toggleDashboardReminderBodySchema }),
  toggleDashboardReminder
)

export default router
