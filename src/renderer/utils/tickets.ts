import { formatCurrency, formatDateTime } from './format'
import { TicketPayload } from './desktop'

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

export const buildSaleTicketPayload = (sale: any): TicketPayload => ({
  title: 'Lucy3000',
  subtitle: 'Ticket de venta',
  saleNumber: sale.saleNumber,
  customer: sale.client ? `${sale.client.firstName} ${sale.client.lastName}`.trim() : 'Cliente general',
  createdAt: formatDateTime(sale.date),
  paymentMethod: paymentMethodLabel(sale.paymentMethod),
  items: (sale.items || []).map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.price),
    total: Number(item.subtotal ?? Number(item.price) * Number(item.quantity))
  })),
  totals: [
    { label: 'Subtotal', value: formatCurrency(Number(sale.subtotal)) },
    ...(Number(sale.discount || 0) > 0
      ? [{ label: 'Descuento', value: `-${formatCurrency(Number(sale.discount))}` }]
      : []),
    { label: 'Total', value: formatCurrency(Number(sale.total)) }
  ],
  footer: 'Gracias por confiar en Lucy3000'
})

export const buildTestTicketPayload = (): TicketPayload => ({
  title: 'Lucy3000',
  subtitle: 'Prueba de impresion',
  saleNumber: 'TEST-0001',
  customer: 'Cliente de prueba',
  createdAt: formatDateTime(new Date().toISOString()),
  paymentMethod: 'Efectivo',
  items: [
    {
      description: 'Conexion impresora ticket',
      quantity: 1,
      unitPrice: 0,
      total: 0
    }
  ],
  totals: [{ label: 'Total', value: formatCurrency(0) }],
  footer: 'Si ves este ticket, la conexion funciona'
})
