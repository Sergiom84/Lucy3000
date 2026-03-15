import { formatCurrency, formatDateTime } from './format'
import { TicketPayload } from './desktop'
import { TICKET_BUSINESS_NAME, TICKET_DEFAULT_FOOTER } from '../../shared/ticketIdentity'

export const paymentMethodLabel = (paymentMethod?: string | null) => {
  switch (paymentMethod) {
    case 'CASH':
      return 'Efectivo'
    case 'CARD':
      return 'Tarjeta'
    case 'BIZUM':
      return 'Bizum'
    case 'OTHER':
      return 'Otros'
    default:
      return paymentMethod || 'Sin definir'
  }
}

const resolveCustomerName = (sale: any) => {
  const firstName = String(sale?.client?.firstName || '').trim()
  const lastName = String(sale?.client?.lastName || '').trim()
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || 'Cliente general'
}

const resolveItemLabel = (item: any) =>
  String(item?.service?.name || item?.product?.name || item?.description || 'Item').trim()

export const buildSaleTicketPayload = (sale: any): TicketPayload => ({
  title: TICKET_BUSINESS_NAME,
  subtitle: 'Ticket',
  saleNumber: sale.saleNumber,
  customer: resolveCustomerName(sale),
  createdAt: formatDateTime(sale.date),
  paymentMethod: paymentMethodLabel(sale.paymentMethod),
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
    { label: 'Total', value: formatCurrency(Number(sale.total)) },
    { label: 'Pagado', value: formatCurrency(Number(sale.total)) }
  ],
  footer: TICKET_DEFAULT_FOOTER
})

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
