import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import * as xlrd from 'node-xlrd'
import { loadWorkbookFromBuffer, worksheetToObjects } from './spreadsheet'

type SpreadsheetRow = Record<string, unknown>

export type LegacySpreadsheetSheet = {
  name: string
  rows: SpreadsheetRow[]
}

const valueToHeader = (value: unknown) => String(value ?? '').trim()

const tableToObjects = (rows: unknown[][]): SpreadsheetRow[] => {
  if (rows.length === 0) return []

  const headers = rows[0].map((value) => valueToHeader(value))
  const dataRows: SpreadsheetRow[] = []

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const sourceRow = rows[rowIndex] || []
    const nextRow: SpreadsheetRow = {}
    let hasData = false

    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const header = headers[columnIndex]
      if (!header) continue

      const value = sourceRow[columnIndex]
      nextRow[header] = value

      if (value !== '' && value !== null && value !== undefined) {
        hasData = true
      }
    }

    if (hasData) {
      dataRows.push(nextRow)
    }
  }

  return dataRows
}

const loadXlsSheetFromBuffer = async (buffer: Buffer): Promise<LegacySpreadsheetSheet> => {
  const tempFilePath = path.join(os.tmpdir(), `lucy3000-import-${randomUUID()}.xls`)

  await fs.writeFile(tempFilePath, buffer)

  try {
    const workbook = await new Promise<xlrd.XlrdWorkbook>((resolve, reject) => {
      xlrd.open(tempFilePath, (error, loadedWorkbook) => {
        if (error) {
          reject(error)
          return
        }

        resolve(loadedWorkbook)
      })
    })

    if (!workbook.sheet.count) {
      throw new Error('No worksheet found in the uploaded file')
    }

    const worksheet = workbook.sheet.byIndex(0)
    const rows: unknown[][] = []

    for (let rowIndex = 0; rowIndex < worksheet.row.count; rowIndex += 1) {
      const rowValues: unknown[] = []

      for (let columnIndex = 0; columnIndex < worksheet.column.count; columnIndex += 1) {
        rowValues.push(worksheet.cell(rowIndex, columnIndex))
      }

      rows.push(rowValues)
    }

    return {
      name: worksheet.name,
      rows: tableToObjects(rows)
    }
  } finally {
    await fs.unlink(tempFilePath).catch(() => undefined)
  }
}

export const loadLegacySpreadsheetSheet = async (
  buffer: Buffer,
  originalName: string
): Promise<LegacySpreadsheetSheet> => {
  const extension = path.extname(originalName || '').toLowerCase()

  if (extension === '.xls') {
    return loadXlsSheetFromBuffer(buffer)
  }

  const workbook = await loadWorkbookFromBuffer(buffer)
  const worksheet = workbook.worksheets[0]

  if (!worksheet) {
    throw new Error('No worksheet found in the uploaded file')
  }

  return {
    name: worksheet.name,
    rows: worksheetToObjects(worksheet)
  }
}
