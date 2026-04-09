import { app } from 'electron'
import fs from 'fs'
import path from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_DEPTH = 4
const MAX_ARRAY_ITEMS = 20
const MAX_STRING_LENGTH = 4000
const SENSITIVE_KEY_PATTERN = /authorization|password|token|secret|cookie|apikey|apiKey|servicekey|refresh/i

let logFilePath: string | null = null

const truncateString = (value: string) => {
  if (value.length <= MAX_STRING_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`
}

export const sanitizeLogValue = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) {
    return '[Max depth reached]'
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: 'cause' in value ? sanitizeLogValue((value as Error & { cause?: unknown }).cause, depth + 1) : undefined
    }
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeLogValue(entry, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return items
  }

  if (value && typeof value === 'object') {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]']
      }

      return [key, sanitizeLogValue(entryValue, depth + 1)]
    })

    return Object.fromEntries(sanitizedEntries)
  }

  if (typeof value === 'string') {
    return truncateString(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  return value
}

const serializeContext = (context?: unknown) => {
  if (context === undefined) {
    return ''
  }

  try {
    return ` ${JSON.stringify(sanitizeLogValue(context))}`
  } catch (error) {
    return ` ${String(error instanceof Error ? error.message : error)}`
  }
}

const ensureLogFilePath = () => {
  if (logFilePath) {
    return logFilePath
  }

  const logsDir = app.getPath('logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const dateStamp = new Date().toISOString().slice(0, 10)
  logFilePath = path.join(logsDir, `lucy3000-debug-${dateStamp}.log`)
  return logFilePath
}

export const getMainLogFilePath = () => ensureLogFilePath()

export const writeMainLog = (level: LogLevel, message: string, context?: unknown) => {
  const targetFile = ensureLogFilePath()
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${serializeContext(context)}\n`

  try {
    fs.appendFileSync(targetFile, line, 'utf8')
  } catch (error) {
    const fallbackMessage = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[logger] Failed to write log file: ${fallbackMessage}\n`)
  }
}

export const initializeMainLogging = () => {
  const targetFile = ensureLogFilePath()
  writeMainLog('info', 'Application logging initialized', {
    logFilePath: targetFile,
    isPackaged: app.isPackaged,
    processId: process.pid
  })
}

let processLoggingInstalled = false

export const installMainProcessErrorLogging = () => {
  if (processLoggingInstalled) {
    return
  }

  processLoggingInstalled = true

  process.on('uncaughtException', (error) => {
    writeMainLog('error', 'Main process uncaught exception', error)
  })

  process.on('unhandledRejection', (reason) => {
    writeMainLog('error', 'Main process unhandled rejection', { reason })
  })
}

export const rendererConsoleLevelToLogLevel = (level: number): LogLevel => {
  if (level >= 3) {
    return 'error'
  }

  if (level === 2) {
    return 'warn'
  }

  if (level === 1) {
    return 'info'
  }

  return 'debug'
}
