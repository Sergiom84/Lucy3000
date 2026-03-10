import { Router } from 'express'
import {
  getClientBonos,
  createBonoPack,
  consumeSession,
  deleteBonoPack,
  updateAccountBalance
} from '../controllers/bono.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/client/:clientId', getClientBonos)
router.post('/', createBonoPack)
router.put('/:bonoPackId/consume', consumeSession)
router.delete('/:bonoPackId', deleteBonoPack)
router.put('/account-balance/:clientId', updateAccountBalance)

export default router
