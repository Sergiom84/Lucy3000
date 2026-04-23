export class CashModuleError extends Error {
  statusCode: number
  body: Record<string, unknown>

  constructor(statusCode: number, body: string | Record<string, unknown>) {
    const normalizedBody = typeof body === 'string' ? { error: body } : body
    const message =
      typeof normalizedBody.error === 'string' && normalizedBody.error.trim()
        ? normalizedBody.error.trim()
        : 'Cash operation failed'

    super(message)
    this.name = 'CashModuleError'
    this.statusCode = statusCode
    this.body = normalizedBody
  }
}

export const toCashHttpError = (error: unknown) => {
  if (!(error instanceof CashModuleError)) {
    return null
  }

  return {
    statusCode: error.statusCode,
    body: error.body
  }
}
