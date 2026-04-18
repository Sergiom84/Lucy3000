declare module 'node-xlrd' {
  export type XlrdCellValue = string | number | boolean | Date | null | undefined

  export interface XlrdSheet {
    name: string
    row: { count: number }
    column: { count: number }
    cell(rowIndex: number, columnIndex: number): XlrdCellValue
  }

  export interface XlrdWorkbook {
    sheets: XlrdSheet[]
    sheet: {
      byIndex(index: number): XlrdSheet
      byName(name: string): XlrdSheet
      count: number
    }
  }

  export function open(
    fileName: string,
    callback: (error: Error | null, workbook: XlrdWorkbook) => void
  ): void

  export function open(
    fileName: string,
    options: Record<string, unknown>,
    callback: (error: Error | null, workbook: XlrdWorkbook) => void
  ): void
}
