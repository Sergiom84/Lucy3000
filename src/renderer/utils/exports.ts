import { format } from 'date-fns'
import {
  getAppointmentDisplayEmail,
  getAppointmentDisplayName,
  getAppointmentDisplayPhone
} from '../../shared/customerDisplay'
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

type ClientExportRow = {
  externalCode?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  mobilePhone?: string | null
  landlinePhone?: string | null
  email?: string | null
  gender?: string | null
  birthDate?: Date | string | null
  registrationDate?: Date | string | null
  lastVisit?: Date | string | null
  city?: string | null
  province?: string | null
  relationshipType?: string | null
  totalSpent?: number | null
  pendingAmount?: number | null
  accountBalance?: number | null
  isActive?: boolean | null
}

type ServiceExportRow = {
  serviceCode?: string | null
  category?: string | null
  name?: string | null
  price?: number | null
  taxRate?: number | null
  duration?: number | null
  description?: string | null
  isActive?: boolean | null
}

type ProductExportRow = {
  sku?: string | null
  brand?: string | null
  category?: string | null
  name?: string | null
  stock?: number | null
  price?: number | null
  cost?: number | null
  minStock?: number | null
  maxStock?: number | null
  unit?: string | null
  barcode?: string | null
  description?: string | null
  isActive?: boolean | null
}

type BonoTemplateExportRow = {
  category?: string | null
  serviceLookup?: string | null
  serviceName?: string | null
  description?: string | null
  totalSessions?: number | null
  price?: number | null
  isActive?: boolean | null
}

type AppointmentExportRow = {
  id?: string | null
  date?: Date | string | null
  startTime?: string | null
  endTime?: string | null
  status?: string | null
  notes?: string | null
  cabin?: string | null
  professional?: string | null
  googleCalendarEventId?: string | null
  clientId?: string | null
  client?: {
    externalCode?: string | null
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
    mobilePhone?: string | null
    landlinePhone?: string | null
  } | null
  guestName?: string | null
  guestPhone?: string | null
  serviceId?: string | null
  service?: {
    serviceCode?: string | null
    name?: string | null
    duration?: number | null
  } | null
  sale?: {
    status?: string | null
  } | null
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

const buildCatalogFileBaseName = (prefix: string) =>
  `${prefix}_${format(new Date(), 'yyyy-MM-dd')}`

const buildAppointmentFileBaseName = () => buildCatalogFileBaseName('citas')

const formatDateOnly = (value: Date | string | null | undefined) => {
  if (!value) return ''

  try {
    return format(new Date(value), 'dd/MM/yyyy')
  } catch {
    return ''
  }
}

const formatCatalogText = (value: unknown) => String(value ?? '').trim()

const formatCatalogBoolean = (value: boolean | null | undefined) => {
  if (value === null || value === undefined) return ''
  return value ? 'Sí' : 'No'
}

const formatAppointmentTime = (value: unknown) => {
  if (!value) return ''

  if (value instanceof Date) {
    return format(value, 'HH:mm')
  }

  const text = String(value).trim()
  if (!text) return ''

  const normalized = text.match(/^(\d{1,2}:\d{2})/)
  return normalized ? normalized[1] : text
}

const calculateAppointmentDuration = (startTime?: string | null, endTime?: string | null) => {
  if (!startTime || !endTime) return ''

  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)

  if ([startHours, startMinutes, endHours, endMinutes].some((value) => Number.isNaN(value))) {
    return ''
  }

  return Math.max(0, endHours * 60 + endMinutes - (startHours * 60 + startMinutes))
}

const getAppointmentClientCode = (row: AppointmentExportRow) =>
  formatCatalogText(row.client?.externalCode || row.clientId)

const getAppointmentServiceCode = (row: AppointmentExportRow) =>
  formatCatalogText(row.service?.serviceCode || row.serviceId)

const getAppointmentServiceName = (row: AppointmentExportRow) =>
  formatCatalogText(row.service?.name)

const getAppointmentServiceMinutes = (row: AppointmentExportRow) => {
  if (row.service?.duration !== null && row.service?.duration !== undefined) {
    return Number(row.service.duration)
  }

  return calculateAppointmentDuration(row.startTime || undefined, row.endTime || undefined)
}

export const downloadAppointmentImportTemplateWorkbook = async () => {
  await downloadWorkbook('plantilla_citas.xlsx', async (workbook) => {
    workbook.creator = 'Lucy3000'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Citas')
    setWorksheetColumnWidths(sheet, [14, 10, 10, 14, 28, 16, 30, 12, 14, 16, 24, 34])

    sheet.addRow([
      'Fecha',
      'Hora',
      'Minutos',
      'cliente',
      'Nombre',
      'Código',
      'Descripción',
      'Cabina',
      'Profesional',
      'Teléfono',
      'Mail',
      'Notas'
    ])

    sheet.addRow([
      '18/04/2026',
      '10:00',
      30,
      '143',
      'CLARA RUIZ CALCERRADA',
      'RECO',
      'Reconstruccion',
      'CABINA',
      'LUCY',
      '670312806',
      'clara@example.com',
      'Primera prueba'
    ])

    markFirstRowAsHeader(sheet)
    setWorksheetHeaderAutoFilter(sheet, 12)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getColumn(3).numFmt = '0'

    const guideSheet = workbook.addWorksheet('Guia')
    setWorksheetColumnWidths(guideSheet, [30, 72, 28])
    guideSheet.addRows([
      ['Columna', 'Qué espera Lucy3000', 'Ejemplo'],
      ['cliente', 'Código o Nº Cliente que ya existe en la base local', '143'],
      ['Código + Descripción + Minutos', 'Se usan juntos para localizar el tratamiento correcto', 'RECO / Reconstruccion / 30'],
      ['Fecha', 'Preferible dd/MM/aaaa', '18/04/2026'],
      ['Hora', 'Formato HH:mm', '10:00'],
    ['Cabina', 'Acepta CABINA, CABINA 1, CABINA 2, LUCY o TAMARA', 'CABINA'],
    ['Profesional', 'Escribe el nombre de la profesional tal y como trabaja en el centro', 'Lucy'],
      ['Notas', 'Opcional', 'Primera prueba']
    ])
    markFirstRowAsHeader(guideSheet)
  })
}

export const exportAppointmentsWorkbook = async (rows: AppointmentExportRow[]) => {
  await downloadWorkbook(`${buildAppointmentFileBaseName()}.xlsx`, async (workbook) => {
    workbook.creator = 'Lucy3000'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Citas')
    setWorksheetColumnWidths(sheet, [14, 10, 10, 14, 28, 16, 30, 12, 14, 16, 24, 34])

    sheet.addRow([
      'Fecha',
      'Hora',
      'Minutos',
      'cliente',
      'Nombre',
      'Código',
      'Descripción',
      'Cabina',
      'Profesional',
      'Teléfono',
      'Mail',
      'Notas'
    ])

    rows.forEach((row) => {
      const clientName = formatCatalogText(getAppointmentDisplayName(row)) || formatCatalogText(row.client?.firstName)
      const appointmentDate = formatDateOnly(row.date)
      const appointmentMinutes = getAppointmentServiceMinutes(row)

      sheet.addRow([
        appointmentDate,
        formatAppointmentTime(row.startTime),
        appointmentMinutes,
        getAppointmentClientCode(row),
        clientName,
        getAppointmentServiceCode(row),
        getAppointmentServiceName(row),
        formatCatalogText(row.cabin),
        formatCatalogText(row.professional),
        formatCatalogText(getAppointmentDisplayPhone(row)),
        formatCatalogText(getAppointmentDisplayEmail(row)),
        formatCatalogText(row.notes)
      ])
    })

    markFirstRowAsHeader(sheet)
    setWorksheetHeaderAutoFilter(sheet, 12)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getColumn(3).numFmt = '0'
  })
}

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

export const exportClientsWorkbook = async (rows: ClientExportRow[]) => {
  await downloadWorkbook(`${buildCatalogFileBaseName('clientes')}.xlsx`, async (workbook) => {
    workbook.creator = 'Lucy3000'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Clientes')
    setWorksheetColumnWidths(sheet, [14, 18, 24, 16, 16, 16, 28, 12, 14, 14, 14, 18, 18, 18, 14, 14, 16, 12])

    sheet.addRow([
      'Nº Cliente',
      'Nombre',
      'Apellidos',
      'Teléfono',
      'Móvil',
      'Teléfono fijo',
      'Email',
      'Sexo',
      'Nacimiento',
      'Alta',
      'Última visita',
      'Ciudad',
      'Provincia',
      'Parentesco',
      'Facturado',
      'Pendiente',
      'Saldo a cuenta',
      'Activo'
    ])

    rows.forEach((row) => {
      sheet.addRow([
        formatCatalogText(row.externalCode),
        formatCatalogText(row.firstName),
        formatCatalogText(row.lastName),
        formatCatalogText(row.phone),
        formatCatalogText(row.mobilePhone),
        formatCatalogText(row.landlinePhone),
        formatCatalogText(row.email),
        formatCatalogText(row.gender),
        formatDateOnly(row.birthDate),
        formatDateOnly(row.registrationDate),
        formatDateOnly(row.lastVisit),
        formatCatalogText(row.city),
        formatCatalogText(row.province),
        formatCatalogText(row.relationshipType),
        Number(row.totalSpent || 0),
        Number(row.pendingAmount || 0),
        Number(row.accountBalance || 0),
        formatCatalogBoolean(row.isActive)
      ])
    })

    markFirstRowAsHeader(sheet)
    setWorksheetHeaderAutoFilter(sheet, 18)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    ;[15, 16, 17].forEach((columnIndex) => {
      sheet.getColumn(columnIndex).numFmt = '#,##0.00 [$€-es-ES]'
    })
  })
}

export const exportServicesWorkbook = async (rows: ServiceExportRow[]) => {
  await downloadWorkbook(`${buildCatalogFileBaseName('tratamientos')}.xlsx`, async (workbook) => {
    workbook.creator = 'Lucy3000'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Tratamientos')
    setWorksheetColumnWidths(sheet, [16, 20, 34, 12, 10, 12, 36, 12])

    sheet.addRow([
      'Código',
      'Familia',
      'Descripción',
      'Tarifa',
      'IVA',
      'Tiempo (min)',
      'Notas',
      'Activo'
    ])

    rows.forEach((row) => {
      sheet.addRow([
        formatCatalogText(row.serviceCode),
        formatCatalogText(row.category),
        formatCatalogText(row.name),
        Number(row.price || 0),
        row.taxRate === null || row.taxRate === undefined ? '' : Number(row.taxRate),
        row.duration === null || row.duration === undefined ? '' : Number(row.duration),
        formatCatalogText(row.description),
        formatCatalogBoolean(row.isActive)
      ])
    })

    markFirstRowAsHeader(sheet)
    setWorksheetHeaderAutoFilter(sheet, 8)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getColumn(4).numFmt = '#,##0.00 [$€-es-ES]'
    sheet.getColumn(5).numFmt = '0.00'
  })
}

export const exportProductsWorkbook = async (rows: ProductExportRow[]) => {
  await downloadWorkbook(`${buildCatalogFileBaseName('productos')}.xlsx`, async (workbook) => {
    workbook.creator = 'Lucy3000'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Productos')
    setWorksheetColumnWidths(sheet, [16, 20, 22, 34, 10, 12, 12, 12, 12, 12, 18, 36, 12])

    sheet.addRow([
      'SKU',
      'Marca',
      'Familia',
      'Descripción',
      'Stock',
      'PVP',
      'Costo',
      'Stock mín.',
      'Stock máx.',
      'Unidad',
      'Código barras',
      'Notas',
      'Activo'
    ])

    rows.forEach((row) => {
      sheet.addRow([
        formatCatalogText(row.sku),
        formatCatalogText(row.brand),
        formatCatalogText(row.category),
        formatCatalogText(row.name),
        row.stock === null || row.stock === undefined ? '' : Number(row.stock),
        Number(row.price || 0),
        Number(row.cost || 0),
        row.minStock === null || row.minStock === undefined ? '' : Number(row.minStock),
        row.maxStock === null || row.maxStock === undefined ? '' : Number(row.maxStock),
        formatCatalogText(row.unit),
        formatCatalogText(row.barcode),
        formatCatalogText(row.description),
        formatCatalogBoolean(row.isActive)
      ])
    })

    markFirstRowAsHeader(sheet)
    setWorksheetHeaderAutoFilter(sheet, 13)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getColumn(6).numFmt = '#,##0.00 [$€-es-ES]'
    sheet.getColumn(7).numFmt = '#,##0.00 [$€-es-ES]'
  })
}

export const exportBonoTemplatesWorkbook = async (rows: BonoTemplateExportRow[]) => {
  await downloadWorkbook(`${buildCatalogFileBaseName('bonos')}.xlsx`, async (workbook) => {
    workbook.creator = 'Lucy3000'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Bonos')
    setWorksheetColumnWidths(sheet, [20, 24, 34, 14, 14, 12])

    sheet.addRow([
      'Categoria',
      'Codigo',
      'Descripcion',
      'Sesiones',
      'Tarifa 1',
      'Activo'
    ])

    rows.forEach((row) => {
      sheet.addRow([
        formatCatalogText(row.category) || 'Bonos',
        formatCatalogText(row.serviceLookup || row.serviceName),
        formatCatalogText(row.description),
        row.totalSessions === null || row.totalSessions === undefined ? '' : Number(row.totalSessions),
        Number(row.price || 0),
        formatCatalogBoolean(row.isActive)
      ])
    })

    markFirstRowAsHeader(sheet)
    setWorksheetHeaderAutoFilter(sheet, 6)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getColumn(5).numFmt = '#,##0.00 [$€-es-ES]'
  })
}
