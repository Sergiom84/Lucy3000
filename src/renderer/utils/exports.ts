import { format } from 'date-fns'
import {
  downloadWorkbook,
  markFirstRowAsHeader,
  setWorksheetColumnWidths,
  setWorksheetHeaderAutoFilter
} from './excel'
import { paymentMethodLabel } from './tickets'

type CashPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

type CashMovementExportRow = {
  saleId: string
  saleNumber: string
  date: Date | string
  clientName: string
  paymentMethod: string
  professionalName: string
  itemType: 'SERVICE' | 'PRODUCT'
  serviceId: string | null
  productId: string | null
  concept: string
  quantity: number
  amount: number
}

type CashMovementExportFilters = {
  period: CashPeriod
  clientLabel: string
  paymentMethodLabel: string
  serviceLabel: string
  productLabel: string
  typeLabel: string
}

type RawSalesReportExport = {
  startDate: string
  endDate: string
  totalSales: number
  collectedRevenue: number
  workPerformedRevenue: number
  paymentMethods: Record<string, number>
}

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR'
})

const formatCurrency = (value: number) => currencyFormatter.format(value)

const formatDateTime = (value: Date | string) => format(new Date(value), 'dd/MM/yyyy HH:mm')

const formatPeriodLabel = (period: CashPeriod) => {
  switch (period) {
    case 'DAY':
      return 'Día'
    case 'WEEK':
      return 'Semanal'
    case 'MONTH':
      return 'Mensual'
    case 'YEAR':
      return 'Anual'
    default:
      return period
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatQuantity = (value: number) => {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(3).replace(/\.?0+$/, '')
}

const buildCashFileBaseName = (period: CashPeriod) =>
  `caja_movimientos_${period.toLowerCase()}_${format(new Date(), 'yyyy-MM-dd')}`

const buildReportFileBaseName = (startDate: string, endDate: string) =>
  `reportes_ventas_${startDate}_${endDate}`

export const exportCashMovementsWorkbook = async (
  rows: CashMovementExportRow[],
  filters: CashMovementExportFilters
) => {
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)

  await downloadWorkbook(`${buildCashFileBaseName(filters.period)}.xlsx`, async (workbook) => {
    workbook.creator = 'Lucy3000'
    workbook.created = new Date()

    const movementsSheet = workbook.addWorksheet('Movimientos')
    setWorksheetColumnWidths(movementsSheet, [18, 28, 28, 14, 12, 14, 16, 18, 14])

    movementsSheet.addRow([
      'Fecha',
      'Cliente',
      'Concepto',
      'Tipo',
      'Cantidad',
      'Pago',
      'Importe',
      'Profesional',
      'Nº venta'
    ])

    rows.forEach((row) => {
      movementsSheet.addRow([
        formatDateTime(row.date),
        row.clientName,
        row.concept,
        row.itemType === 'SERVICE' ? 'Tratamiento' : 'Producto',
        formatQuantity(Number(row.quantity || 0)),
        paymentMethodLabel(row.paymentMethod),
        Number(row.amount || 0),
        row.professionalName,
        row.saleNumber
      ])
    })

    markFirstRowAsHeader(movementsSheet)
    setWorksheetHeaderAutoFilter(movementsSheet, 9)
    movementsSheet.views = [{ state: 'frozen', ySplit: 1 }]
    movementsSheet.getColumn(7).numFmt = '#,##0.00 [$€-es-ES]'

    const contextSheet = workbook.addWorksheet('Contexto')
    setWorksheetColumnWidths(contextSheet, [22, 40])

    contextSheet.addRows([
      ['Exportado el', formatDateTime(new Date())],
      ['Periodo', formatPeriodLabel(filters.period)],
      ['Cliente', filters.clientLabel],
      ['Pago', filters.paymentMethodLabel],
      ['Tratamiento', filters.serviceLabel],
      ['Producto', filters.productLabel],
      ['Tipo', filters.typeLabel],
      ['Total movimientos', rows.length],
      ['Importe total', totalAmount],
      ['Caja B', 'Excluida']
    ])

    contextSheet.getColumn(1).font = { bold: true }
    contextSheet.getCell('B9').numFmt = '#,##0.00 [$€-es-ES]'
  })
}

export const buildCashMovementsPdfHtml = (
  rows: CashMovementExportRow[],
  filters: CashMovementExportFilters
) => {
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const rowsHtml = rows
    .map((row) => {
      return `
        <tr>
          <td>${escapeHtml(formatDateTime(row.date))}</td>
          <td>${escapeHtml(row.clientName)}</td>
          <td>${escapeHtml(row.concept)}</td>
          <td>${escapeHtml(row.itemType === 'SERVICE' ? 'Tratamiento' : 'Producto')}</td>
          <td>${escapeHtml(formatQuantity(Number(row.quantity || 0)))}</td>
          <td>${escapeHtml(paymentMethodLabel(row.paymentMethod))}</td>
          <td class="amount">${escapeHtml(formatCurrency(Number(row.amount || 0)))}</td>
          <td>${escapeHtml(row.professionalName)}</td>
          <td>${escapeHtml(row.saleNumber)}</td>
        </tr>
      `
    })
    .join('')

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Movimientos de caja</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          body {
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 0;
            font-size: 11px;
          }

          h1 {
            margin: 0 0 6px;
            font-size: 20px;
          }

          .meta {
            margin-bottom: 16px;
            color: #4b5563;
          }

          .filters {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 16px;
          }

          .filter-card {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 8px 10px;
            background: #f9fafb;
          }

          .filter-card strong {
            display: block;
            margin-bottom: 2px;
            font-size: 10px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .summary {
            display: flex;
            gap: 24px;
            margin-bottom: 16px;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          thead {
            display: table-header-group;
          }

          th,
          td {
            border: 1px solid #d1d5db;
            padding: 6px 8px;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #eff6ff;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .amount {
            white-space: nowrap;
            font-weight: 700;
          }

          .note {
            margin-top: 12px;
            color: #6b7280;
            font-size: 10px;
          }
        </style>
      </head>
      <body>
        <h1>Movimientos unificados de caja</h1>
        <div class="meta">
          Exportado el ${escapeHtml(formatDateTime(new Date()))}
        </div>

        <div class="filters">
          <div class="filter-card"><strong>Periodo</strong>${escapeHtml(formatPeriodLabel(filters.period))}</div>
          <div class="filter-card"><strong>Cliente</strong>${escapeHtml(filters.clientLabel)}</div>
          <div class="filter-card"><strong>Pago</strong>${escapeHtml(filters.paymentMethodLabel)}</div>
          <div class="filter-card"><strong>Tratamiento</strong>${escapeHtml(filters.serviceLabel)}</div>
          <div class="filter-card"><strong>Producto</strong>${escapeHtml(filters.productLabel)}</div>
          <div class="filter-card"><strong>Tipo</strong>${escapeHtml(filters.typeLabel)}</div>
        </div>

        <div class="summary">
          <div>Total movimientos: ${escapeHtml(String(rows.length))}</div>
          <div>Importe total: ${escapeHtml(formatCurrency(totalAmount))}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Concepto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Pago</th>
              <th>Importe</th>
              <th>Profesional</th>
              <th>Nº venta</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="9">No hay movimientos para los filtros seleccionados.</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
  `
}

export const getCashMovementsPdfFileName = (period: CashPeriod) =>
  `${buildCashFileBaseName(period)}.pdf`

export const exportRawSalesReportWorkbook = async (report: RawSalesReportExport) => {
  await downloadWorkbook(
    `${buildReportFileBaseName(report.startDate, report.endDate)}.xlsx`,
    async (workbook) => {
      workbook.creator = 'Lucy3000'
      workbook.created = new Date()

      const sheet = workbook.addWorksheet('Resumen ventas')
      setWorksheetColumnWidths(sheet, [24, 20])

      sheet.addRows([
        ['Desde', report.startDate],
        ['Hasta', report.endDate],
        ['Número de ventas', report.totalSales],
        ['Trabajo realizado', report.workPerformedRevenue],
        ['Cobro real', report.collectedRevenue],
        ['Efectivo', Number(report.paymentMethods.CASH || 0)],
        ['Tarjeta', Number(report.paymentMethods.CARD || 0)],
        ['Bizum', Number(report.paymentMethods.BIZUM || 0)],
        ['Caja B', 'Excluida']
      ])

      sheet.getColumn(1).font = { bold: true }
      ;[4, 5, 6, 7, 8].forEach((rowIndex) => {
        sheet.getCell(`B${rowIndex}`).numFmt = '#,##0.00 [$€-es-ES]'
      })
    }
  )
}
