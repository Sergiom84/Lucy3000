import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  listClientAssets,
  uploadClientAsset,
  deleteClientAsset,
  setPrimaryClientAsset,
  setClientAssetCategory
} from '../controllers/clientAssets.controller'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
})

const router = Router({ mergeParams: true }) // access :id from parent

router.use(authMiddleware)

router.get('/', listClientAssets)
router.post('/', upload.single('file'), uploadClientAsset)
router.delete('/:assetId', deleteClientAsset)
router.patch('/:assetId/primary', setPrimaryClientAsset)
router.patch('/:assetId/category', setClientAssetCategory)

export default router
