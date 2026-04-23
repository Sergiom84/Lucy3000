import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeSqlDump, importSqlDump } from '../../../src/backend/controllers/sql.controller'
import type { AuthRequest } from '../../../src/backend/middleware/auth.middleware'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { SqlImportConflictError, importSqlAnalysisToDatabase } from '../../../src/backend/services/sqlImport.service'
import { SqlAnalysisValidationError, analyzeLegacySqlDump } from '../../../src/backend/utils/sql-import'
import { appendSqlEvent } from '../../../src/backend/utils/sql-event-log'
import { logError, logWarn } from '../../../src/backend/utils/logger'

vi.mock('../../../src/backend/utils/sql-import', () => {
  class SqlAnalysisValidationError extends Error {
    statusCode: number

    constructor(message: string) {
      super(message)
      this.name = 'SqlAnalysisValidationError'
      this.statusCode = 400
    }
  }

  return {
    analyzeLegacySqlDump: vi.fn(),
    SqlAnalysisValidationError
  }
})

vi.mock('../../../src/backend/services/sqlImport.service', () => {
  class SqlImportValidationError extends Error {
    statusCode: number
    details?: unknown

    constructor(message: string, details?: unknown) {
      super(message)
      this.name = 'SqlImportValidationError'
      this.statusCode = 400
      this.details = details
    }
  }

  class SqlImportConflictError extends Error {
    statusCode: number
    details?: unknown

    constructor(message: string, details?: unknown) {
      super(message)
      this.name = 'SqlImportConflictError'
      this.statusCode = 409
      this.details = details
    }
  }

  return {
    importSqlAnalysisToDatabase: vi.fn(),
    SqlImportValidationError,
    SqlImportConflictError
  }
})

vi.mock('../../../src/backend/utils/sql-event-log', () => ({
  appendSqlEvent: vi.fn(),
  getSqlEventLogFilePath: vi.fn(),
  listSqlEvents: vi.fn()
}))

vi.mock('../../../src/backend/utils/logger', () => ({
  logWarn: vi.fn(),
  logError: vi.fn()
}))

describe('sql.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 without error stack logging for invalid SQL dumps', async () => {
    vi.mocked(analyzeLegacySqlDump).mockImplementation(() => {
      throw new SqlAnalysisValidationError('Dump inválido')
    })

    const req = createMockRequest({
      file: {
        buffer: Buffer.from('bad'),
        originalname: '01dat.sqlx',
        size: 123
      }
    })
    const res = createMockResponse()

    await analyzeSqlDump(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Dump inválido' })
    expect(logWarn).toHaveBeenCalledWith(
      'Analyze SQL dump rejected',
      expect.objectContaining({
        fileName: '01dat.sqlx',
        fileSize: 123,
        error: 'Dump inválido'
      })
    )
    expect(logError).not.toHaveBeenCalled()
  })

  it('returns 500 and logs unexpected analyze failures as server errors', async () => {
    vi.mocked(analyzeLegacySqlDump).mockImplementation(() => {
      throw new Error('Boom')
    })

    const req = createMockRequest({
      file: {
        buffer: Buffer.from('bad'),
        originalname: '01dat.sql',
        size: 45
      }
    })
    const res = createMockResponse()

    await analyzeSqlDump(req as any, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'No se pudo analizar el archivo SQL' })
    expect(logError).toHaveBeenCalledWith(
      'Analyze SQL dump failed',
      expect.any(Error),
      expect.objectContaining({
        fileName: '01dat.sql',
        fileSize: 45
      })
    )
  })

  it('logs import conflicts as warnings and returns 409', async () => {
    vi.mocked(importSqlAnalysisToDatabase).mockRejectedValue(
      new SqlImportConflictError('La BD no está vacía', { clients: 1 })
    )
    vi.mocked(appendSqlEvent).mockResolvedValue(undefined as never)

    const req = createMockRequest<AuthRequest>({
      body: {
        sessionId: 'sql-session-1',
        sourceName: '01dat.sql'
      },
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN'
      }
    })
    const res = createMockResponse()

    await importSqlDump(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      error: 'La BD no está vacía',
      details: { clients: 1 }
    })
    expect(logWarn).toHaveBeenCalledWith(
      'Import SQL dump rejected',
      expect.objectContaining({
        sessionId: 'sql-session-1',
        sourceName: '01dat.sql',
        error: 'La BD no está vacía',
        details: { clients: 1 }
      })
    )
    expect(logError).not.toHaveBeenCalled()
  })
})
