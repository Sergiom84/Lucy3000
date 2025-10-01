import { Router } from 'express'
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService
} from '../controllers/service.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', getServices)
router.get('/:id', getServiceById)
router.post('/', createService)
router.put('/:id', updateService)
router.delete('/:id', deleteService)

export default router

