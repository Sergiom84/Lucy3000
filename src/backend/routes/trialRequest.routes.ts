import { Router } from 'express'
import { createTrialRequest } from '../controllers/trialRequest.controller'
import { validateRequest } from '../middleware/validation.middleware'
import { createTrialRequestBodySchema } from '../validators/trialRequest.schemas'

const router = Router()

router.post('/', validateRequest({ body: createTrialRequestBodySchema }), createTrialRequest)

export default router
