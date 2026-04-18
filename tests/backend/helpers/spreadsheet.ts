import ExcelJS from 'exceljs'

export const createWorkbookBuffer = async (
  rows: unknown[][],
  sheetName = 'Sheet1'
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)

  rows.forEach((row) => {
    worksheet.addRow(row)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
