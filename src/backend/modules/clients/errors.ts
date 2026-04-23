export class ClientModuleError extends Error {
  statusCode: number
  body: Record<string, unknown>

  constructor(statusCode: number, body: string | Record<string, unknown>) {
    const normalizedBody = typeof body === 'string' ? { error: body } : body
    const message =
      typeof normalizedBody.error === 'string' && normalizedBody.error.trim()
        ? normalizedBody.error.trim()
        : 'Client operation failed'

    super(message)
    this.name = 'ClientModuleError'
    this.statusCode = statusCode
    this.body = normalizedBody
  }
}

export const toClientHttpError = (error: unknown) => {
  if (!(error instanceof ClientModuleError)) {
    return null
  }

  return {
    statusCode: error.statusCode,
    body: error.body
  }
}
