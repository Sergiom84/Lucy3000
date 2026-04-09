import { Router } from 'express'
import multer from 'multer'
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
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

router.use(authMiddleware)

router.get('/', getClients)
router.get('/birthdays', getBirthdaysThisMonth)
router.get('/:id', getClientById)
router.post('/', createClient)
router.post('/import', upload.single('file'), importClientsFromExcel)
router.put('/:id', updateClient)
router.delete('/:id', deleteClient)
router.get('/:id/history', getClientHistory)
router.post('/:id/history', addClientHistory)

export default router
