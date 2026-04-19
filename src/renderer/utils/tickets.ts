import { formatCurrency, formatDateTime } from './format'
import { TicketPayload } from './desktop'
import { TICKET_BUSINESS_NAME, TICKET_DEFAULT_FOOTER } from '../../shared/ticketIdentity'
import { getSaleDisplayName } from '../../shared/customerDisplay'

export const paymentMethodLabel = (paymentMethod?: string | null) => {
  switch (paymentMethod) {
    case 'CASH':
      return 'Efectivo'
    case 'CARD':
      return 'Tarjeta'
    case 'BIZUM':
      return 'Bizum'
    case 'ABONO':
      return 'Abono'
    case 'OTHER':
      return 'Otros'
    default:
      return paymentMethod || 'Sin definir'
  }
}

export const getSaleAccountBalanceMovement = (sale: any) => {
  if (!Array.isArray(sale?.accountBalanceMovements)) {
    return null
  }

  return (
    sale.accountBalanceMovements.find(
      (movement: any) => String(movement?.type || '').toUpperCase() === 'CONSUMPTION'
    ) || null
  )
}

export const salePaymentMethodLabel = (sale: any) => {
  if (String(sale?.status || '').toUpperCase() === 'PENDING') {
    return 'Pendiente de cobro'
  }

  const balanceMovement = getSaleAccountBalanceMovement(sale)
  const rawPaymentMethod = String(sale?.paymentMethod || '').toUpperCase()

  if (!balanceMovement) {
    return paymentMethodLabel(sale?.paymentMethod)
  }

  if (rawPaymentMethod === 'ABONO' || rawPaymentMethod === 'OTHER' || !rawPaymentMethod) {
    return 'Abono'
  }

  return `Abono + ${paymentMethodLabel(sale?.paymentMethod)}`
}

const resolveCustomerName = (sale: any) => {
  return getSaleDisplayName(sale)
}

const resolveItemLabel = (item: any) =>
  String(item?.service?.name || item?.product?.name || item?.description || 'Item').trim()

export const buildSaleTicketPayload = (sale: any): TicketPayload => ({
  title: TICKET_BUSINESS_NAME,
  subtitle: 'Ticket',
  saleNumber: sale.saleNumber,
  customer: resolveCustomerName(sale),
  createdAt: formatDateTime(sale.date),
  paymentMethod: salePaymentMethodLabel(sale),
  items: (sale.items || []).map((item: any) => ({
    description: resolveItemLabel(item),
    quantity: Number(item.quantity),
    unitPrice: Number(item.price),
    total: Number(item.subtotal ?? Number(item.price) * Number(item.quantity))
  })),
  totals: [
    { label: 'Subtotal', value: formatCurrency(Number(sale.subtotal)) },
    ...(Number(sale.discount || 0) > 0
      ? [{ label: 'Descuento', value: `-${formatCurrency(Number(sale.discount))}` }]
      : []),
    ...(getSaleAccountBalanceMovement(sale)
      ? [
          {
            label: 'Abono usado',
            value: formatCurrency(Number(getSaleAccountBalanceMovement(sale)?.amount || 0))
          }
        ]
      : []),
    { label: 'Total', value: formatCurrency(Number(sale.total)) },
    { label: 'Pagado', value: formatCurrency(Number(sale.total)) },
    ...(getSaleAccountBalanceMovement(sale)
      ? [
          {
            label: 'Saldo restante',
            value: formatCurrency(Number(getSaleAccountBalanceMovement(sale)?.balanceAfter || 0))
          }
        ]
      : [])
  ],
  footer: TICKET_DEFAULT_FOOTER
})

export const buildQuoteHtml = (quote: any): string => {
  const clientName = quote.client
    ? `${String(quote.client.firstName || '').trim()} ${String(quote.client.lastName || '').trim()}`.trim()
    : 'Cliente general'

  const dateStr = formatDateTime(quote.date)
  const validUntilStr = formatDateTime(quote.validUntil)
  const professional = quote.professional || 'LUCY'

  const itemsHtml = (quote.items || [])
    .map((item: any) => {
      const desc = String(item.service?.name || item.product?.name || item.description || 'Item').trim()
      const qty = Number(item.quantity)
      const price = Number(item.price)
      const subtotal = Number(item.subtotal ?? qty * price)
      return `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb">${desc}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">${price.toFixed(2)} &euro;</td>
          <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:center">${qty}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">${subtotal.toFixed(2)} &euro;</td>
        </tr>`
    })
    .join('')

  const subtotal = Number(quote.subtotal || 0)
  const discount = Number(quote.discount || 0)
  const total = Number(quote.total || 0)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Presupuesto ${quote.quoteNumber}</title>
<style>
  @page { margin: 20mm; size: A4; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; margin: 0; padding: 20px; font-size: 13px; }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 16px; }
  .header h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.04em; color: #2563eb; }
  .header .subtitle { font-size: 16px; color: #4b5563; margin: 4px 0; }
  .fiscal { text-align: center; font-size: 11px; color: #6b7280; line-height: 1.4; margin-bottom: 16px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .meta-block { flex: 1; }
  .meta-block h3 { font-size: 12px; color: #6b7280; margin: 0 0 4px; text-transform: uppercase; }
  .meta-block p { margin: 2px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead th { background: #f3f4f6; padding: 8px 4px; text-align: left; font-size: 12px; border-bottom: 2px solid #d1d5db; }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-table { width: 240px; }
  .totals-table .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals-table .row.total { font-size: 16px; font-weight: bold; border-top: 2px solid #2563eb; padding-top: 8px; margin-top: 4px; color: #2563eb; }
  .validity { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 10px 16px; text-align: center; margin-bottom: 20px; font-size: 13px; color: #92400e; }
  .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <h1>${TICKET_BUSINESS_NAME}</h1>
    <div class="subtitle">PRESUPUESTO</div>
  </div>
  <div class="fiscal">
    MARIA LUCINIA LARA MANZANARES &middot; NIF 02196008Z<br/>
    C/ ALEGRIA DE LA HUERTA, 22 &middot; 28041 MADRID<br/>
    Tfno. 91 505 20 67 &middot; 684 20 36 33
  </div>
  <div class="meta">
    <div class="meta-block">
      <h3>Cliente</h3>
      <p><strong>${clientName}</strong></p>
      ${quote.client?.phone ? `<p>${quote.client.phone}</p>` : ''}
      ${quote.client?.email ? `<p>${quote.client.email}</p>` : ''}
    </div>
    <div class="meta-block" style="text-align:right">
      <h3>Presupuesto</h3>
      <p><strong>${quote.quoteNumber}</strong></p>
      <p>Fecha: ${dateStr}</p>
      <p>Profesional: ${professional}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Tratamiento / Producto</th>
        <th class="right">Precio</th>
        <th class="center">Ud.</th>
        <th class="right">Importe</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="totals">
    <div class="totals-table">
      <div class="row"><span>Subtotal</span><span>${subtotal.toFixed(2)} &euro;</span></div>
      ${discount > 0 ? `<div class="row"><span>Descuento</span><span>-${discount.toFixed(2)} &euro;</span></div>` : ''}
      <div class="row total"><span>TOTAL</span><span>${total.toFixed(2)} &euro;</span></div>
    </div>
  </div>
  <div class="validity">
    Este presupuesto tiene una validez de 3 meses.<br/>
    <strong>Válido hasta: ${validUntilStr}</strong>
  </div>
  <div class="footer">
    ${TICKET_BUSINESS_NAME} &middot; www.centroesteticalucylara.es<br/>
    Gracias por su confianza
  </div>
</body>
</html>`
}

export const buildTestTicketPayload = (): TicketPayload => ({
  title: TICKET_BUSINESS_NAME,
  subtitle: 'Ticket de prueba',
  saleNumber: 'TEST-0001',
  customer: 'Cliente de prueba',
  createdAt: formatDateTime(new Date().toISOString()),
  paymentMethod: 'Efectivo',
  items: [
    {
      description: 'Prueba de impresion',
      quantity: 1,
      unitPrice: 0,
      total: 0
    }
  ],
  totals: [
    { label: 'Total', value: formatCurrency(0) },
    { label: 'Pagado', value: formatCurrency(0) }
  ],
  footer: TICKET_DEFAULT_FOOTER
})
