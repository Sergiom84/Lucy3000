import path from 'path'
import multer from 'multer'
import { NextFunction, Request, Response } from 'express'

export class FileValidationError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'FileValidationError'
    this.statusCode = statusCode
  }
}

export const MAX_SPREADSHEET_FILE_SIZE_BYTES = 5 * 1024 * 1024

const ALLOWED_SPREADSHEET_EXTENSIONS = new Set(['.xlsx'])
const ALLOWED_SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
])

export const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SPREADSHEET_FILE_SIZE_BYTES
  }
})

export const validateSpreadsheetUpload = (fieldName = 'file') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const file = req.file

    if (!file) {
      next(new FileValidationError(`Spreadsheet file "${fieldName}" is required`))
      return
    }

    const extension = path.extname(file.originalname || '').toLowerCase()
    if (!ALLOWED_SPREADSHEET_EXTENSIONS.has(extension)) {
      next(new FileValidationError('Only .xlsx spreadsheet files are supported'))
      return
    }

    if (file.mimetype && !ALLOWED_SPREADSHEET_MIME_TYPES.has(file.mimetype)) {
      next(new FileValidationError('Invalid spreadsheet content type'))
      return
    }

    if (!file.size || file.size <= 0) {
      next(new FileValidationError('Uploaded spreadsheet is empty'))
      return
    }

    next()
  }
}
