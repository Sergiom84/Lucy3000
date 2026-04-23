import { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth.middleware'
import {
  importSqlAnalysisToDatabase,
  SqlImportConflictError,
  SqlImportValidationError
} from '../services/sqlImport.service'
import { SqlAnalysisValidationError, analyzeLegacySqlDump } from '../utils/sql-import'
import { appendSqlEvent, getSqlEventLogFilePath, listSqlEvents } from '../utils/sql-event-log'
import { logError, logWarn } from '../utils/logger'

export const analyzeSqlDump = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'El fichero SQL es obligatorio' })
    }

    const result = analyzeLegacySqlDump(req.file.buffer, req.file.originalname || 'legacy.sql')
    return res.json(result)
  } catch (error) {
    if (error instanceof SqlAnalysisValidationError) {
      logWarn('Analyze SQL dump rejected', {
        fileName: req.file?.originalname || null,
        fileSize: req.file?.size || null,
        error: error.message
      })

      return res.status(error.statusCode).json({
        error: error.message
      })
    }

    logError('Analyze SQL dump failed', error, {
      fileName: req.file?.originalname || null,
      fileSize: req.file?.size || null
    })

    return res.status(500).json({
      error: 'No se pudo analizar el archivo SQL'
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

export const importSqlDump = async (req: AuthRequest, res: Response) => {
  try {
    const result = await importSqlAnalysisToDatabase(req.body)

    await appendSqlEvent({
      sessionId: req.body.sessionId,
      userId: req.user?.id ?? null,
      type: 'import_committed',
      step: 'summary',
      message: `Restauración SQL completada para ${req.body.sourceName}`,
      payload: {
        created: result.created,
        omitted: result.omitted,
        warnings: result.warnings,
        unsupported: result.unsupported
      }
    })

    return res.json(result)
  } catch (error) {
    if (error instanceof SqlImportValidationError || error instanceof SqlImportConflictError) {
      logWarn('Import SQL dump rejected', {
        sessionId: req.body?.sessionId || null,
        sourceName: req.body?.sourceName || null,
        error: error.message,
        details: error.details
      })

      await appendSqlEvent({
        sessionId: req.body?.sessionId || 'unknown-session',
        userId: req.user?.id ?? null,
        type: 'import_failed',
        step: 'summary',
        message: error.message,
        payload: error.details
      }).catch(() => undefined)

      return res.status(error.statusCode).json({
        error: error.message,
        details: error.details
      })
    }

    logError('Import SQL dump failed', error, {
      sessionId: req.body?.sessionId || null,
      sourceName: req.body?.sourceName || null
    })

    return res.status(500).json({
      error: 'No se pudo completar la restauración SQL'
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
