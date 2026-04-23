export class AccountBalanceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'AccountBalanceError'
    this.statusCode = statusCode
  }
}

export class BonoOperationError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'BonoOperationError'
    this.statusCode = statusCode
  }
}

export const toBonoHttpError = (error: unknown) => {
  if (error instanceof AccountBalanceError || error instanceof BonoOperationError) {
    return { statusCode: error.statusCode, message: error.message }
  }

  return { statusCode: 500, message: 'Internal server error' }
}
