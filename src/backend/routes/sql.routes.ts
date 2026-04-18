import { Router } from 'express'
import { analyzeSqlDump, createSqlEvent, getSqlEvents } from '../controllers/sql.controller'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import { sqlDumpUpload, validateSqlDumpUpload } from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import { sqlAnalyzeBodySchema, sqlEventBodySchema, sqlEventQuerySchema } from '../validators/sql.schemas'

const router = Router()

router.use(authMiddleware)
router.use(adminMiddleware)

router.post(
  '/analyze',
  sqlDumpUpload.single('file'),
  validateSqlDumpUpload('file'),
  validateRequest({ body: sqlAnalyzeBodySchema }),
  analyzeSqlDump
)
router.get('/events', validateRequest({ query: sqlEventQuerySchema }), getSqlEvents)
router.post('/events', validateRequest({ body: sqlEventBodySchema }), createSqlEvent)

export default router
