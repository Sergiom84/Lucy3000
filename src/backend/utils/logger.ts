type LogLevel = 'INFO' | 'WARN' | 'ERROR'

const MAX_DEPTH = 4
const MAX_ARRAY_ITEMS = 20
const MAX_STRING_LENGTH = 2000
const SENSITIVE_KEY_PATTERN = /authorization|password|token|secret|cookie|apikey|apiKey|servicekey|refresh/i

const truncateString = (value: string) => {
  if (value.length <= MAX_STRING_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`
}

export const sanitizeForLog = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) {
    return '[Max depth reached]'
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: 'cause' in value ? sanitizeForLog((value as Error & { cause?: unknown }).cause, depth + 1) : undefined
    }
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeForLog(entry, depth + 1))
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

      return [key, sanitizeForLog(entryValue, depth + 1)]
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
    return ` ${JSON.stringify(sanitizeForLog(context))}`
  } catch (error) {
    return ` ${String(error instanceof Error ? error.message : error)}`
  }
}

const writeLog = (level: LogLevel, message: string, context?: unknown) => {
  const line = `${new Date().toISOString()} [${level}] ${message}${serializeContext(context)}`

  if (level === 'ERROR') {
    console.error(line)
    return
  }

  if (level === 'WARN') {
    console.warn(line)
    return
  }

  console.log(line)
}

export const logInfo = (message: string, context?: unknown) => {
  writeLog('INFO', message, context)
}

export const logWarn = (message: string, context?: unknown) => {
  writeLog('WARN', message, context)
}

export const logError = (message: string, error?: unknown, context?: unknown) => {
  const payload: Record<string, unknown> = {}

  if (context !== undefined) {
    payload.context = context
  }

  if (error !== undefined) {
    payload.error = error
  }

  writeLog('ERROR', message, Object.keys(payload).length > 0 ? payload : undefined)
}
