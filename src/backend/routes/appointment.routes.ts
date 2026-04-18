import { Router } from 'express'
import {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getAppointmentsByDate,
  getAppointmentLegends,
  getAppointmentLegendCategories,
  createAppointmentLegend,
  deleteAppointmentLegend
} from '../controllers/appointment.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  appointmentDateParamSchema,
  appointmentIdParamSchema,
  appointmentLegendIdParamSchema,
  appointmentsQuerySchema,
  createAppointmentBodySchema,
  createAppointmentLegendBodySchema,
  updateAppointmentBodySchema
} from '../validators/appointment.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/legend', getAppointmentLegends)
router.get('/legend/categories', getAppointmentLegendCategories)
router.post('/legend', validateRequest({ body: createAppointmentLegendBodySchema }), createAppointmentLegend)
router.delete('/legend/:id', validateRequest({ params: appointmentLegendIdParamSchema }), deleteAppointmentLegend)
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

