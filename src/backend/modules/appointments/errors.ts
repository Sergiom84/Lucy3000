export class AppointmentModuleError extends Error {
  statusCode: number
  body: Record<string, unknown>

  constructor(statusCode: number, body: string | Record<string, unknown>) {
    const normalizedBody = typeof body === 'string' ? { error: body } : body
    const message =
      typeof normalizedBody.error === 'string' && normalizedBody.error.trim()
        ? normalizedBody.error.trim()
        : 'Appointment operation failed'

    super(message)
    this.name = 'AppointmentModuleError'
    this.statusCode = statusCode
    this.body = normalizedBody
  }
}

export const toAppointmentHttpError = (error: unknown) => {
  if (!(error instanceof AppointmentModuleError)) {
    return null
  }

  return {
    statusCode: error.statusCode,
    body: error.body
  }
}
