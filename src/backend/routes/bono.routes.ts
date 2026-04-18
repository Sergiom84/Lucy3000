import { Router } from 'express'
import {
  getClientBonos,
  getBonoTemplates,
  getGlobalAccountBalanceHistory,
  importBonoTemplatesFromExcel,
  createBonoTemplate,
  createBonoPack,
  createBonoAppointment,
  consumeSession,
  deleteBonoPack,
  updateAccountBalance,
  getAccountBalanceHistory,
  createAccountBalanceTopUp,
  consumeAccountBalance
} from '../controllers/bono.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { spreadsheetUpload, validateSpreadsheetUpload } from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  accountBalanceConsumeBodySchema,
  accountBalanceHistoryQuerySchema,
  accountBalanceTopUpBodySchema,
  bonoPackIdParamSchema,
  clientIdParamSchema,
  createBonoTemplateBodySchema,
  createBonoAppointmentBodySchema
} from '../validators/bono.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/templates', getBonoTemplates)
router.post('/templates', validateRequest({ body: createBonoTemplateBodySchema }), createBonoTemplate)
router.get('/account-balance/history', getGlobalAccountBalanceHistory)
router.post(
  '/import-templates',
  spreadsheetUpload.single('file'),
  validateSpreadsheetUpload(),
  importBonoTemplatesFromExcel
)
router.get('/client/:clientId', validateRequest({ params: clientIdParamSchema }), getClientBonos)
router.post('/', createBonoPack)
router.post(
  '/:bonoPackId/appointments',
  validateRequest({ params: bonoPackIdParamSchema, body: createBonoAppointmentBodySchema }),
  createBonoAppointment
)
router.put('/:bonoPackId/consume', validateRequest({ params: bonoPackIdParamSchema }), consumeSession)
router.delete('/:bonoPackId', validateRequest({ params: bonoPackIdParamSchema }), deleteBonoPack)
router.get(
  '/account-balance/:clientId/history',
  validateRequest({ params: clientIdParamSchema, query: accountBalanceHistoryQuerySchema }),
  getAccountBalanceHistory
)
router.post(
  '/account-balance/:clientId/top-up',
  validateRequest({ params: clientIdParamSchema, body: accountBalanceTopUpBodySchema }),
  createAccountBalanceTopUp
)
router.post(
  '/account-balance/:clientId/consume',
  validateRequest({ params: clientIdParamSchema, body: accountBalanceConsumeBodySchema }),
  consumeAccountBalance
)
router.put('/account-balance/:clientId', validateRequest({ params: clientIdParamSchema }), updateAccountBalance)

export default router
