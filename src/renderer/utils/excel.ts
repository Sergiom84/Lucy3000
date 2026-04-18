import type { Workbook, Worksheet } from 'exceljs'

export const XLSX_FILE_ACCEPT = '.xlsx'
export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const XLSX_FILE_PATTERN = /\.xlsx$/i

const getExcelColumnName = (columnNumber: number): string => {
  let current = columnNumber
  let result = ''

  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }

  return result
}

const downloadBlob = (fileName: string, blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

export const isSupportedSpreadsheetFile = (file: File) => XLSX_FILE_PATTERN.test(file.name)

export const assertSupportedSpreadsheetFile = (file: File) => {
  if (!isSupportedSpreadsheetFile(file)) {
    throw new Error('Por favor selecciona un archivo Excel valido (.xlsx)')
  }
}

export const setWorksheetColumnWidths = (worksheet: Worksheet, widths: number[]) => {
  worksheet.columns = widths.map((width) => ({ width }))
}

export const setWorksheetHeaderAutoFilter = (worksheet: Worksheet, headerLength: number) => {
  worksheet.autoFilter = {
    from: 'A1',
    to: `${getExcelColumnName(headerLength)}1`
  }
}

export const markFirstRowAsHeader = (worksheet: Worksheet) => {
  worksheet.getRow(1).font = { bold: true }
}

export const downloadWorkbook = async (
  fileName: string,
  buildWorkbook: (workbook: Workbook) => Promise<void> | void
) => {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await buildWorkbook(workbook)
  const buffer = await workbook.xlsx.writeBuffer()

  downloadBlob(
    fileName,
    new Blob([buffer], {
      type: XLSX_MIME_TYPE
    })
  )
}
