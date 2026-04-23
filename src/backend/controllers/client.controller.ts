import { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth.middleware'
import { createClientRecord, deleteClientRecord, updateClientRecord } from '../modules/clients/crud'
import { toClientHttpError } from '../modules/clients/errors'
import { createClientHistoryEntry, listClientHistoryEntries } from '../modules/clients/history'
import { importClientsSpreadsheet } from '../modules/clients/importSpreadsheet'
import { getClientByIdOrThrow, listBirthdaysThisMonth, listClients } from '../modules/clients/queries'

const handleClientError = (res: Response, logMessage: string, error: unknown) => {
  const httpError = toClientHttpError(error)
  if (httpError) {
    return res.status(httpError.statusCode).json(httpError.body)
  }

  console.error(logMessage, error)
  return res.status(500).json({ error: 'Internal server error' })
}

export const getClients = async (req: Request, res: Response) => {
  try {
    const clients = await listClients(req.query)
    res.json(clients)
  } catch (error) {
    handleClientError(res, 'Get clients error:', error)
  }
}

export const getClientById = async (req: Request, res: Response) => {
  try {
    const client = await getClientByIdOrThrow(req.params.id)
    res.json(client)
  } catch (error) {
    handleClientError(res, 'Get client error:', error)
  }
}

export const createClient = async (req: AuthRequest, res: Response) => {
  try {
    const client = await createClientRecord(req.body, req.user)
    res.status(201).json(client)
  } catch (error) {
    handleClientError(res, 'Create client error:', error)
  }
}

export const updateClient = async (req: Request, res: Response) => {
  try {
    const client = await updateClientRecord(req.params.id, req.body)
    res.json(client)
  } catch (error) {
    handleClientError(res, 'Update client error:', error)
  }
}

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const result = await deleteClientRecord(req.params.id)
    res.json(result)
  } catch (error) {
    handleClientError(res, 'Delete client error:', error)
  }
}

export const getClientHistory = async (req: Request, res: Response) => {
  try {
    const history = await listClientHistoryEntries(req.params.id)
    res.json(history)
  } catch (error) {
    handleClientError(res, 'Get client history error:', error)
  }
}

export const addClientHistory = async (req: Request, res: Response) => {
  try {
    const history = await createClientHistoryEntry(req.params.id, req.body)
    res.status(201).json(history)
  } catch (error) {
    handleClientError(res, 'Add client history error:', error)
  }
}

export const getBirthdaysThisMonth = async (_req: Request, res: Response) => {
  try {
    const birthdays = await listBirthdaysThisMonth()
    res.json(birthdays)
  } catch (error) {
    handleClientError(res, 'Get birthdays error:', error)
  }
}

export const importClientsFromExcel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const result = await importClientsSpreadsheet({
      buffer: req.file.buffer,
      user: req.user
    })

    return res.json(result)
  } catch (error) {
    return handleClientError(res, 'Import clients error:', error)
  }
}
