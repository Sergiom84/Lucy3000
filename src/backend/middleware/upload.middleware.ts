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
export const MAX_SQL_DUMP_FILE_SIZE_BYTES = 30 * 1024 * 1024

const ALLOWED_SPREADSHEET_EXTENSIONS = new Set(['.xlsx'])
const ALLOWED_SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
])
const ALLOWED_SQL_EXTENSIONS = new Set(['.sql'])
const ALLOWED_SQL_MIME_TYPES = new Set([
  'application/sql',
  'text/plain',
  'application/octet-stream'
])
const ALLOWED_LEGACY_SPREADSHEET_EXTENSIONS = new Set(['.xls', '.xlsx'])
const ALLOWED_LEGACY_SPREADSHEET_MIME_TYPES = new Set([
  ...ALLOWED_SPREADSHEET_MIME_TYPES,
  'application/vnd.ms-excel'
])

export const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SPREADSHEET_FILE_SIZE_BYTES
  }
})

export const sqlDumpUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SQL_DUMP_FILE_SIZE_BYTES
  }
})

const createSpreadsheetValidator = (
  allowedExtensions: Set<string>,
  allowedMimeTypes: Set<string>,
  errorLabel: string,
  fieldName = 'file'
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const file = req.file

    if (!file) {
      next(new FileValidationError(`Spreadsheet file "${fieldName}" is required`))
      return
    }

    const extension = path.extname(file.originalname || '').toLowerCase()
    if (!allowedExtensions.has(extension)) {
      next(new FileValidationError(errorLabel))
      return
    }

    if (file.mimetype && !allowedMimeTypes.has(file.mimetype)) {
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

export const validateSpreadsheetUpload = (fieldName = 'file') =>
  createSpreadsheetValidator(
    ALLOWED_SPREADSHEET_EXTENSIONS,
    ALLOWED_SPREADSHEET_MIME_TYPES,
    'Only .xlsx spreadsheet files are supported',
    fieldName
  )

export const validateLegacySpreadsheetUpload = (fieldName = 'file') =>
  createSpreadsheetValidator(
    ALLOWED_LEGACY_SPREADSHEET_EXTENSIONS,
    ALLOWED_LEGACY_SPREADSHEET_MIME_TYPES,
    'Only .xls or .xlsx spreadsheet files are supported',
    fieldName
  )

export const validateSqlDumpUpload = (fieldName = 'file') =>
  createSpreadsheetValidator(
    ALLOWED_SQL_EXTENSIONS,
    ALLOWED_SQL_MIME_TYPES,
    'Only .sql dump files are supported',
    fieldName
  )
