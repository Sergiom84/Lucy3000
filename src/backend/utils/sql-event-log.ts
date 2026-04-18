import { promises as fs } from 'fs'
import path from 'path'
import { sanitizeForLog } from './logger'

type SqlEventStep =
  | 'file'
  | 'clients'
  | 'services'
  | 'products'
  | 'bonoTemplates'
  | 'clientBonos'
  | 'accountBalances'
  | 'appointments'
  | 'summary'
  | null

export type SqlEventLogEntry = {
  id: string
  occurredAt: string
  sessionId: string
  userId: string | null
  type: string
  step: SqlEventStep
  message: string
  payload?: unknown
}

type AppendSqlEventInput = {
  sessionId: string
  userId?: string | null
  type: string
  step?: SqlEventStep
  message: string
  payload?: unknown
}

type ListSqlEventOptions = {
  sessionId?: string | null
  limit?: number
}

const LOG_DIR = path.resolve(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'sql-import-events.log')

const ensureLogDir = async () => {
  await fs.mkdir(LOG_DIR, { recursive: true })
}

const parseLogLine = (line: string): SqlEventLogEntry | null => {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as SqlEventLogEntry
  } catch {
    return null
  }
}

export const getSqlEventLogFilePath = () => LOG_FILE

export const appendSqlEvent = async (input: AppendSqlEventInput) => {
  await ensureLogDir()

  const entry: SqlEventLogEntry = {
    id: `sql-event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    occurredAt: new Date().toISOString(),
    sessionId: input.sessionId,
    userId: input.userId ?? null,
    type: input.type,
    step: input.step ?? null,
    message: input.message,
    payload: input.payload === undefined ? undefined : sanitizeForLog(input.payload)
  }

  await fs.appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8')
  return entry
}

export const listSqlEvents = async (options: ListSqlEventOptions = {}) => {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200))

  try {
    const content = await fs.readFile(LOG_FILE, 'utf8')
    const entries = content
      .split(/\r?\n/)
      .map(parseLogLine)
      .filter((entry): entry is SqlEventLogEntry => entry !== null)
      .filter((entry) => (options.sessionId ? entry.sessionId === options.sessionId : true))

    return entries.slice(-limit).reverse()
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return []
    }

    throw error
  }
}
