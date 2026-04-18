import { Router } from 'express'
import {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getAppointmentsByDate,
  getAppointmentLegends,
  getAppointmentLegendCategories,
  createAppointmentLegend,
  deleteAppointmentLegend,
  exportAppointments,
  importAppointmentsFromExcel
} from '../controllers/appointment.controller'
import {
  createAgendaDayNote,
  deleteAgendaDayNote,
  getAgendaDayNotes,
  toggleAgendaDayNote,
  updateAgendaDayNote
} from '../controllers/agendaDayNote.controller'
import {
  createAgendaBlock,
  deleteAgendaBlock,
  getAgendaBlockById,
  getAgendaBlockProfessionals,
  getAgendaBlocks,
  updateAgendaBlock
} from '../controllers/agendaBlock.controller'
import { adminMiddleware, authMiddleware } from '../middleware/auth.middleware'
import { spreadsheetUpload, validateSpreadsheetUpload } from '../middleware/upload.middleware'
import { validateRequest } from '../middleware/validation.middleware'
import {
  agendaBlockIdParamSchema,
  agendaDayNoteIdParamSchema,
  agendaDayNotesQuerySchema,
  agendaBlocksQuerySchema,
  appointmentDateParamSchema,
  appointmentImportBodySchema,
  appointmentIdParamSchema,
  appointmentLegendIdParamSchema,
  appointmentsQuerySchema,
  createAgendaDayNoteBodySchema,
  createAgendaBlockBodySchema,
  createAppointmentBodySchema,
  createAppointmentLegendBodySchema,
  toggleAgendaDayNoteBodySchema,
  updateAgendaDayNoteBodySchema,
  updateAgendaBlockBodySchema,
  updateAppointmentBodySchema
} from '../validators/appointment.schemas'

const router = Router()

router.use(authMiddleware)

router.get('/legend', getAppointmentLegends)
router.get('/legend/categories', getAppointmentLegendCategories)
router.post('/legend', validateRequest({ body: createAppointmentLegendBodySchema }), createAppointmentLegend)
router.delete('/legend/:id', validateRequest({ params: appointmentLegendIdParamSchema }), deleteAppointmentLegend)
router.get('/professionals', getAgendaBlockProfessionals)
router.get('/blocks', validateRequest({ query: agendaBlocksQuerySchema }), getAgendaBlocks)
router.get('/blocks/:id', validateRequest({ params: agendaBlockIdParamSchema }), getAgendaBlockById)
router.post('/blocks', validateRequest({ body: createAgendaBlockBodySchema }), createAgendaBlock)
router.put(
  '/blocks/:id',
  validateRequest({ params: agendaBlockIdParamSchema, body: updateAgendaBlockBodySchema }),
  updateAgendaBlock
)
router.delete('/blocks/:id', validateRequest({ params: agendaBlockIdParamSchema }), deleteAgendaBlock)
router.get('/day-notes', validateRequest({ query: agendaDayNotesQuerySchema }), getAgendaDayNotes)
router.post('/day-notes', validateRequest({ body: createAgendaDayNoteBodySchema }), createAgendaDayNote)
router.put(
  '/day-notes/:id',
  validateRequest({ params: agendaDayNoteIdParamSchema, body: updateAgendaDayNoteBodySchema }),
  updateAgendaDayNote
)
router.patch(
  '/day-notes/:id/toggle',
  validateRequest({ params: agendaDayNoteIdParamSchema, body: toggleAgendaDayNoteBodySchema }),
  toggleAgendaDayNote
)
router.delete('/day-notes/:id', validateRequest({ params: agendaDayNoteIdParamSchema }), deleteAgendaDayNote)
router.get('/', validateRequest({ query: appointmentsQuerySchema }), getAppointments)
router.get('/export', validateRequest({ query: appointmentsQuerySchema }), exportAppointments)
router.get('/date/:date', validateRequest({ params: appointmentDateParamSchema }), getAppointmentsByDate)
router.post(
  '/import',
  adminMiddleware,
  spreadsheetUpload.single('file'),
  validateSpreadsheetUpload(),
  validateRequest({ body: appointmentImportBodySchema }),
  importAppointmentsFromExcel
)
router.get('/:id', validateRequest({ params: appointmentIdParamSchema }), getAppointmentById)
router.post('/', validateRequest({ body: createAppointmentBodySchema }), createAppointment)
router.put(
  '/:id',
  validateRequest({ params: appointmentIdParamSchema, body: updateAppointmentBodySchema }),
  updateAppointment
)
router.delete('/:id', validateRequest({ params: appointmentIdParamSchema }), deleteAppointment)

export default router

