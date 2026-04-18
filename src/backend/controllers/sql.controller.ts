import { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth.middleware'
import { analyzeLegacySqlDump } from '../utils/sql-import'
import { appendSqlEvent, getSqlEventLogFilePath, listSqlEvents } from '../utils/sql-event-log'

export const analyzeSqlDump = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'El fichero SQL es obligatorio' })
    }

    const result = analyzeLegacySqlDump(req.file.buffer, req.file.originalname || 'legacy.sql')
    return res.json(result)
  } catch (error) {
    console.error('Analyze SQL dump error:', error)

    return res.status(400).json({
      error: error instanceof Error ? error.message : 'No se pudo analizar el archivo SQL'
    })
  }
}

export const createSqlEvent = async (req: AuthRequest, res: Response) => {
  try {
    const entry = await appendSqlEvent({
      sessionId: req.body.sessionId,
      userId: req.user?.id ?? null,
      type: req.body.type,
      step: req.body.step ?? null,
      message: req.body.message,
      payload: req.body.payload
    })

    return res.status(201).json(entry)
  } catch (error) {
    console.error('Create SQL event error:', error)

    return res.status(500).json({
      error: 'No se pudo registrar el evento SQL'
    })
  }
}

export const getSqlEvents = async (req: Request, res: Response) => {
  try {
    const query = req.query as { sessionId?: string; limit?: number }
    const entries = await listSqlEvents({
      sessionId: query.sessionId,
      limit: query.limit
    })

    return res.json({
      filePath: getSqlEventLogFilePath(),
      entries
    })
  } catch (error) {
    console.error('Get SQL events error:', error)

    return res.status(500).json({
      error: 'No se pudieron cargar los eventos SQL'
    })
  }
}
