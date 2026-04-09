import { Router } from 'express'
import multer from 'multer'
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  importServicesFromExcel
} from '../controllers/service.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

router.use(authMiddleware)

router.get('/', getServices)
router.get('/:id', getServiceById)
router.post('/', createService)
router.post('/import', upload.single('file'), importServicesFromExcel)
router.put('/:id', updateService)
router.delete('/:id', deleteService)

export default router
