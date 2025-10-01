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

const router = Router()

router.use(authMiddleware)

router.get('/', getAppointments)
router.get('/date/:date', getAppointmentsByDate)
router.get('/:id', getAppointmentById)
router.post('/', createAppointment)
router.put('/:id', updateAppointment)
router.delete('/:id', deleteAppointment)

export default router

