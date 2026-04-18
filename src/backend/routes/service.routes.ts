import { Router } from 'express'
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  importServicesFromExcel
} from '../controllers/service.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { spreadsheetUpload, validateSpreadsheetUpload } from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createServiceBodySchema,
  serviceIdParamSchema,
  servicesQuerySchema,
  updateServiceBodySchema
} from '../validators/service.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: servicesQuerySchema }), getServices)
router.get('/:id', validateRequest({ params: serviceIdParamSchema }), getServiceById)
router.post('/', validateRequest({ body: createServiceBodySchema }), createService)
router.post('/import', spreadsheetUpload.single('file'), validateSpreadsheetUpload(), importServicesFromExcel)
router.put('/:id', validateRequest({ params: serviceIdParamSchema, body: updateServiceBodySchema }), updateService)
router.delete('/:id', validateRequest({ params: serviceIdParamSchema }), deleteService)

export default router
