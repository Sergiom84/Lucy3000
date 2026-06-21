import { Router } from 'express'
import {
  getClientBonos,
  getBonoTemplates,
  getGlobalAccountBalanceHistory,
  importBonoTemplatesFromExcel,
  importClientBonosFromSpreadsheet,
  importAccountBalanceFromSpreadsheet,
  createBonoTemplate,
  renameBonoTemplateCategory,
  deleteBonoTemplateCategory,
  deleteBonoTemplateCategoryWithTemplates,
  createBonoPack,
  createBonoAppointment,
  addSessionToBonoPack,
  consumeSession,
  deleteBonoPack,
  updateBonoPack,
  updateAccountBalance,
  getAccountBalanceHistory,
  createAccountBalanceTopUp,
  consumeAccountBalance
} from '../controllers/bono.controller'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import { requireSectionAccess } from '../middleware/permissions.middleware'
import {
  spreadsheetUpload,
  validateLegacySpreadsheetUpload,
  validateSpreadsheetUpload
} from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  accountBalanceConsumeBodySchema,
  accountBalanceHistoryQuerySchema,
  accountBalanceTopUpBodySchema,
  bonoPackIdParamSchema,
  clientIdParamSchema,
  createBonoPackBodySchema,
  createBonoTemplateBodySchema,
  createBonoAppointmentBodySchema,
  deleteBonoTemplateCategoryBodySchema,
  deleteBonoTemplateCategoryWithTemplatesBodySchema,
  renameBonoTemplateCategoryBodySchema,
  spreadsheetImportModeBodySchema,
  updateBonoPackBodySchema
} from '../validators/bono.schemas'

const router = Router()

router.use(authMiddleware)

router.post(
  '/import-client-packs',
  adminMiddleware,
  spreadsheetUpload.single('file'),
  validateLegacySpreadsheetUpload(),
  validateRequest({ body: spreadsheetImportModeBodySchema }),
  importClientBonosFromSpreadsheet
)
router.post(
  '/account-balance/import',
  adminMiddleware,
  spreadsheetUpload.single('file'),
  validateLegacySpreadsheetUpload(),
  validateRequest({ body: spreadsheetImportModeBodySchema }),
  importAccountBalanceFromSpreadsheet
)
router.get('/templates', requireSectionAccess('services', 'appointments', 'sales'), getBonoTemplates)
router.post(
  '/templates',
  requireSectionAccess('services'),
  validateRequest({ body: createBonoTemplateBodySchema }),
  createBonoTemplate
)
router.patch(
  '/templates/categories',
  requireSectionAccess('services'),
  validateRequest({ body: renameBonoTemplateCategoryBodySchema }),
  renameBonoTemplateCategory
)
router.delete(
  '/templates/categories',
  requireSectionAccess('services'),
  validateRequest({ body: deleteBonoTemplateCategoryBodySchema }),
  deleteBonoTemplateCategory
)
router.delete(
  '/templates/categories/with-templates',
  requireSectionAccess('services'),
  validateRequest({ body: deleteBonoTemplateCategoryWithTemplatesBodySchema }),
  deleteBonoTemplateCategoryWithTemplates
)
router.get(
  '/account-balance/history',
  requireSectionAccess('clients', 'sales', 'cash'),
  getGlobalAccountBalanceHistory
)
router.post(
  '/import-templates',
  requireSectionAccess('services'),
  spreadsheetUpload.single('file'),
  validateSpreadsheetUpload(),
  importBonoTemplatesFromExcel
)
router.get(
  '/client/:clientId',
  requireSectionAccess('clients', 'appointments', 'sales'),
  validateRequest({ params: clientIdParamSchema }),
  getClientBonos
)
router.post(
  '/',
  requireSectionAccess('clients', 'appointments', 'sales'),
  validateRequest({ body: createBonoPackBodySchema }),
  createBonoPack
)
router.put(
  '/:bonoPackId',
  requireSectionAccess('clients', 'appointments', 'sales'),
  validateRequest({ params: bonoPackIdParamSchema, body: updateBonoPackBodySchema }),
  updateBonoPack
)
router.post(
  '/:bonoPackId/appointments',
  requireSectionAccess('appointments'),
  validateRequest({ params: bonoPackIdParamSchema, body: createBonoAppointmentBodySchema }),
  createBonoAppointment
)
router.post(
  '/:bonoPackId/sessions',
  requireSectionAccess('clients', 'appointments', 'sales'),
  validateRequest({ params: bonoPackIdParamSchema }),
  addSessionToBonoPack
)
router.put(
  '/:bonoPackId/consume',
  requireSectionAccess('clients', 'appointments', 'sales'),
  validateRequest({ params: bonoPackIdParamSchema }),
  consumeSession
)
router.delete(
  '/:bonoPackId',
  requireSectionAccess('clients', 'appointments', 'sales'),
  validateRequest({ params: bonoPackIdParamSchema }),
  deleteBonoPack
)
router.get(
  '/account-balance/:clientId/history',
  requireSectionAccess('clients', 'sales', 'cash'),
  validateRequest({ params: clientIdParamSchema, query: accountBalanceHistoryQuerySchema }),
  getAccountBalanceHistory
)
router.post(
  '/account-balance/:clientId/top-up',
  requireSectionAccess('clients', 'sales', 'cash'),
  validateRequest({ params: clientIdParamSchema, body: accountBalanceTopUpBodySchema }),
  createAccountBalanceTopUp
)
router.post(
  '/account-balance/:clientId/consume',
  requireSectionAccess('clients', 'sales', 'cash'),
  validateRequest({ params: clientIdParamSchema, body: accountBalanceConsumeBodySchema }),
  consumeAccountBalance
)
router.put(
  '/account-balance/:clientId',
  requireSectionAccess('clients', 'sales', 'cash'),
  validateRequest({ params: clientIdParamSchema }),
  updateAccountBalance
)

export default router
