import { Request, Response } from 'express'
import { chargeAppointmentWithBonoPack } from '../modules/appointments/bonoCharge'
import {
  createAppointmentRecord,
  deleteAppointmentRecord,
  updateAppointmentRecord
} from '../modules/appointments/crud'
import { toAppointmentHttpError } from '../modules/appointments/errors'
import {
  createAppointmentLegendEntry,
  deleteAppointmentLegendById,
  listAppointmentLegendCategories,
  listAppointmentLegends
} from '../modules/appointments/legends'
import {
  exportAppointmentsBuffer,
  getAppointmentByIdOrThrow,
  listAppointments,
  listAppointmentsByDate
} from '../modules/appointments/queries'
import { importAppointmentsSpreadsheet } from '../modules/appointments/spreadsheet'
import { AuthRequest } from '../middleware/auth.middleware'
import { logError } from '../utils/logger'

const handleAppointmentError = (
  res: Response,
  logMessage: string,
  error: unknown,
  context?: Record<string, unknown>
) => {
  const httpError = toAppointmentHttpError(error)
  if (httpError) {
    return res.status(httpError.statusCode).json(httpError.body)
  }

  logError(logMessage, error, context)
  return res.status(500).json({ error: 'Internal server error' })
}

export const getAppointments = async (req: Request, res: Response) => {
  try {
    const appointments = await listAppointments(req.query)
    res.json(appointments)
  } catch (error) {
    handleAppointmentError(res, 'Get appointments error', error, { query: req.query })
  }
}

export const getAppointmentsByDate = async (req: Request, res: Response) => {
  try {
    const appointments = await listAppointmentsByDate(req.params.date)
    res.json(appointments)
  } catch (error) {
    handleAppointmentError(res, 'Get appointments by date error', error, { params: req.params })
  }
}

export const exportAppointments = async (req: Request, res: Response) => {
  try {
    const buffer = await exportAppointmentsBuffer(req.query)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="appointments.xlsx"')
    res.send(buffer)
  } catch (error) {
    handleAppointmentError(res, 'Export appointments error', error, { query: req.query })
  }
}

export const importAppointmentsFromExcel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const result = await importAppointmentsSpreadsheet({
      buffer: req.file.buffer,
      userId: req.user.id,
      mode: req.body?.mode,
      createMissingClients: req.body?.createMissingClients
    })

    return res.json(result)
  } catch (error) {
    return handleAppointmentError(res, 'Import appointments error', error, {
      userId: req.user?.id || null
    })
  }
}

export const getAppointmentById = async (req: Request, res: Response) => {
  try {
    const appointment = await getAppointmentByIdOrThrow(req.params.id)
    res.json(appointment)
  } catch (error) {
    handleAppointmentError(res, 'Get appointment error', error, { params: req.params })
  }
}

export const getAppointmentLegends = async (_req: Request, res: Response) => {
  try {
    const legends = await listAppointmentLegends()
    res.json(legends)
  } catch (error) {
    handleAppointmentError(res, 'Get appointment legends error', error)
  }
}

export const getAppointmentLegendCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await listAppointmentLegendCategories()
    res.json(categories)
  } catch (error) {
    handleAppointmentError(res, 'Get appointment legend categories error', error)
  }
}

export const createAppointmentLegend = async (req: Request, res: Response) => {
  try {
    const legend = await createAppointmentLegendEntry(req.body)
    res.status(201).json(legend)
  } catch (error) {
    handleAppointmentError(res, 'Create appointment legend error', error, { body: req.body })
  }
}

export const deleteAppointmentLegend = async (req: Request, res: Response) => {
  try {
    const result = await deleteAppointmentLegendById(req.params.id)
    res.json(result)
  } catch (error) {
    handleAppointmentError(res, 'Delete appointment legend error', error, { params: req.params })
  }
}

export const createAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const appointment = await createAppointmentRecord(req.body)
    res.status(201).json(appointment)
  } catch (error) {
    handleAppointmentError(res, 'Create appointment error', error, {
      userId: req.user?.id || null,
      body: req.body
    })
  }
}

export const updateAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const appointment = await updateAppointmentRecord(req.params.id, req.body)
    res.json(appointment)
  } catch (error) {
    handleAppointmentError(res, 'Update appointment error', error, {
      userId: req.user?.id || null,
      params: req.params,
      body: req.body
    })
  }
}

export const chargeAppointmentWithBono = async (req: AuthRequest, res: Response) => {
  try {
    const result = await chargeAppointmentWithBonoPack(req.params.id, req.body)
    res.json(result)
  } catch (error) {
    handleAppointmentError(res, 'Charge appointment with bono error', error, {
      userId: req.user?.id || null,
      params: req.params,
      body: req.body
    })
  }
}

export const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const result = await deleteAppointmentRecord(req.params.id)
    res.json(result)
  } catch (error) {
    handleAppointmentError(res, 'Delete appointment error', error, { params: req.params })
  }
}
