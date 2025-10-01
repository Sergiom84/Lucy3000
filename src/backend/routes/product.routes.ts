import { Router } from 'express'
import multer from 'multer'
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
  addStockMovement,
  importProductsFromExcel
} from '../controllers/product.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

// Configurar multer para almacenar archivos en memoria
const upload = multer({ storage: multer.memoryStorage() })

router.use(authMiddleware)

router.get('/', getProducts)
router.get('/low-stock', getLowStockProducts)
router.get('/:id', getProductById)
router.post('/', createProduct)
router.post('/import', upload.single('file'), importProductsFromExcel)
router.put('/:id', updateProduct)
router.delete('/:id', deleteProduct)
router.post('/:id/stock-movements', addStockMovement)

export default router

