import { Router } from 'express'
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  renameProductCategory,
  deleteProductCategory,
  deleteProductCategoryWithProducts,
  getLowStockProducts,
  addStockMovement,
  importProductsFromExcel
} from '../controllers/product.controller'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import { spreadsheetUpload, validateSpreadsheetUpload } from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  addStockMovementBodySchema,
  createProductBodySchema,
  deleteProductCategoryBodySchema,
  deleteProductCategoryWithProductsBodySchema,
  productIdParamSchema,
  productsQuerySchema,
  renameProductCategoryBodySchema,
  updateProductBodySchema
} from '../validators/product.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: productsQuerySchema }), getProducts)
router.patch('/categories', validateRequest({ body: renameProductCategoryBodySchema }), renameProductCategory)
router.delete('/categories', validateRequest({ body: deleteProductCategoryBodySchema }), deleteProductCategory)
router.delete(
  '/categories/with-products',
  validateRequest({ body: deleteProductCategoryWithProductsBodySchema }),
  deleteProductCategoryWithProducts
)
router.get('/low-stock', getLowStockProducts)
router.get('/:id', validateRequest({ params: productIdParamSchema }), getProductById)
router.post('/', validateRequest({ body: createProductBodySchema }), createProduct)
router.post(
  '/import',
  adminMiddleware,
  spreadsheetUpload.single('file'),
  validateSpreadsheetUpload(),
  importProductsFromExcel
)
router.put(
  '/:id',
  validateRequest({ params: productIdParamSchema, body: updateProductBodySchema }),
  updateProduct
)
router.delete('/:id', validateRequest({ params: productIdParamSchema }), deleteProduct)
router.post(
  '/:id/stock-movements',
  validateRequest({ params: productIdParamSchema, body: addStockMovementBodySchema }),
  addStockMovement
)

export default router

