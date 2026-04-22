import { Router } from 'express'
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  renameServiceCategory,
  deleteServiceCategory,
  deleteServiceCategoryWithServices,
  importServicesFromExcel
} from '../controllers/service.controller'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import { spreadsheetUpload, validateSpreadsheetUpload } from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  createServiceBodySchema,
  deleteServiceCategoryBodySchema,
  deleteServiceCategoryWithServicesBodySchema,
  renameServiceCategoryBodySchema,
  serviceIdParamSchema,
  servicesQuerySchema,
  updateServiceBodySchema
} from '../validators/service.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: servicesQuerySchema }), getServices)
router.patch('/categories', validateRequest({ body: renameServiceCategoryBodySchema }), renameServiceCategory)
router.delete('/categories', validateRequest({ body: deleteServiceCategoryBodySchema }), deleteServiceCategory)
router.delete(
  '/categories/with-services',
  validateRequest({ body: deleteServiceCategoryWithServicesBodySchema }),
  deleteServiceCategoryWithServices
)
router.get('/:id', validateRequest({ params: serviceIdParamSchema }), getServiceById)
router.post('/', validateRequest({ body: createServiceBodySchema }), createService)
router.post(
  '/import',
  adminMiddleware,
  spreadsheetUpload.single('file'),
  validateSpreadsheetUpload(),
  importServicesFromExcel
)
router.put('/:id', validateRequest({ params: serviceIdParamSchema, body: updateServiceBodySchema }), updateService)
router.delete('/:id', validateRequest({ params: serviceIdParamSchema }), deleteService)

export default router
