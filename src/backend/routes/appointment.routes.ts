import { Router } from 'express'
import {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getAppointmentsByDate
} from '../controllers/appointment.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  appointmentDateParamSchema,
  appointmentIdParamSchema,
  appointmentsQuerySchema,
  createAppointmentBodySchema,
  updateAppointmentBodySchema
} from '../validators/appointment.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: appointmentsQuerySchema }), getAppointments)
router.get('/date/:date', validateRequest({ params: appointmentDateParamSchema }), getAppointmentsByDate)
router.get('/:id', validateRequest({ params: appointmentIdParamSchema }), getAppointmentById)
router.post('/', validateRequest({ body: createAppointmentBodySchema }), createAppointment)
router.put(
  '/:id',
  validateRequest({ params: appointmentIdParamSchema, body: updateAppointmentBodySchema }),
  updateAppointment
)
router.delete('/:id', validateRequest({ params: appointmentIdParamSchema }), deleteAppointment)

export default router

