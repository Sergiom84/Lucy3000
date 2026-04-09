let rendererLoggingInitialized = false

const MAX_DEPTH = 4

const serializeForConsole = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) {
    return '[Max depth reached]'
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: 'cause' in value ? serializeForConsole((value as Error & { cause?: unknown }).cause, depth + 1) : undefined
    }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeForConsole(entry, depth + 1))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serializeForConsole(entry, depth + 1)])
    )
  }

  return value
}

export const setupRendererLogging = () => {
  if (rendererLoggingInitialized || typeof window === 'undefined') {
    return
  }

  rendererLoggingInitialized = true

  window.addEventListener('error', (event) => {
    console.error('[renderer] Unhandled window error', {
      message: event.message,
      fileName: event.filename,
      line: event.lineno,
      column: event.colno,
      error: serializeForConsole(event.error)
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[renderer] Unhandled promise rejection', {
      reason: serializeForConsole(event.reason)
    })
  })
}
