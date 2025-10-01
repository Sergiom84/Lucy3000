import { Router } from 'express'
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientHistory,
  addClientHistory,
  getBirthdaysThisMonth
} from '../controllers/client.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', getClients)
router.get('/birthdays', getBirthdaysThisMonth)
router.get('/:id', getClientById)
router.post('/', createClient)
router.put('/:id', updateClient)
router.delete('/:id', deleteClient)
router.get('/:id/history', getClientHistory)
router.post('/:id/history', addClientHistory)

export default router

