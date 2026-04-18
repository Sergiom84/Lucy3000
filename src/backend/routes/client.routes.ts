import { Router } from 'express'
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientHistory,
  addClientHistory,
  getBirthdaysThisMonth,
  importClientsFromExcel
} from '../controllers/client.controller'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import { spreadsheetUpload, validateSpreadsheetUpload } from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  clientHistoryBodySchema,
  clientIdParamSchema,
  clientsQuerySchema,
  createClientBodySchema,
  updateClientBodySchema
} from '../validators/client.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/', validateRequest({ query: clientsQuerySchema }), getClients)
router.get('/birthdays', getBirthdaysThisMonth)
router.get('/:id', validateRequest({ params: clientIdParamSchema }), getClientById)
router.post('/', validateRequest({ body: createClientBodySchema }), createClient)
router.post(
  '/import',
  adminMiddleware,
  spreadsheetUpload.single('file'),
  validateSpreadsheetUpload(),
  importClientsFromExcel
)
router.put('/:id', validateRequest({ params: clientIdParamSchema, body: updateClientBodySchema }), updateClient)
router.delete('/:id', validateRequest({ params: clientIdParamSchema }), deleteClient)
router.get('/:id/history', validateRequest({ params: clientIdParamSchema }), getClientHistory)
router.post(
  '/:id/history',
  validateRequest({ params: clientIdParamSchema, body: clientHistoryBodySchema }),
  addClientHistory
)

export default router
