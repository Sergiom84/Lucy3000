import ExcelJS from 'exceljs'

type SpreadsheetRow = Record<string, unknown>

const extractCellValue = (value: ExcelJS.CellValue): unknown => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => extractCellValue(item as ExcelJS.CellValue)).join('')
  }
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return extractCellValue(value.result as ExcelJS.CellValue)
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join('')
    }
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return typeof value.text === 'string' && value.text.trim().length > 0
        ? value.text
        : value.hyperlink
    }
  }

  return String(value)
}

export const worksheetToObjects = (worksheet: ExcelJS.Worksheet): SpreadsheetRow[] => {
  const headerRow = worksheet.getRow(1)
  const headers: string[] = []

  headerRow.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
    headers[columnIndex] = String(extractCellValue(cell.value)).trim()
  })

  const rows: SpreadsheetRow[] = []

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return
    }

    const record: SpreadsheetRow = {}
    let hasData = false

    row.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
      const header = headers[columnIndex]
      if (!header) return

      const value = extractCellValue(cell.value)
      record[header] = value

      if (value !== '' && value !== null && value !== undefined) {
        hasData = true
      }
    })

    if (hasData) {
      rows.push(record)
    }
  })

  return rows
}

export const loadWorkbookFromBuffer = async (buffer: Buffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)
  return workbook
}
