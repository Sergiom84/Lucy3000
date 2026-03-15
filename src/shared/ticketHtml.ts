import type { TicketPrintPayload } from './ticketPrinter'

export const buildTicketHtml = (payload: TicketPrintPayload) => {
  const itemsHtml = (payload.items || [])
    .map(
      (item) => `
        <tr>
          <td class="desc">${item.description}</td>
          <td class="qty">${item.quantity}</td>
          <td class="amount">${item.total.toFixed(2)} €</td>
        </tr>
      `
    )
    .join('')

  const totalsHtml = (payload.totals || [])
    .map(
      (total) => `
        <div class="total-row">
          <span>${total.label}</span>
          <strong>${total.value}</strong>
        </div>
      `
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${payload.title || 'Lucy3000'}</title>
        <style>
          @page {
            margin: 0;
            size: 58mm auto;
          }
          body {
            font-family: "Segoe UI", sans-serif;
            width: 58mm;
            margin: 0 auto;
            padding: 8px;
            color: #111827;
            font-size: 12px;
          }
          h1 {
            font-size: 18px;
            margin: 0 0 4px;
            text-align: center;
          }
          .muted {
            text-align: center;
            color: #4b5563;
            margin-bottom: 8px;
          }
          .meta {
            border-top: 1px dashed #9ca3af;
            border-bottom: 1px dashed #9ca3af;
            padding: 6px 0;
            margin-bottom: 8px;
          }
          .meta div,
          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 2px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
          }
          td {
            padding: 2px 0;
            vertical-align: top;
          }
          .qty,
          .amount {
            white-space: nowrap;
            text-align: right;
          }
          .desc {
            width: 100%;
            padding-right: 6px;
          }
          .footer {
            border-top: 1px dashed #9ca3af;
            padding-top: 8px;
            text-align: center;
            color: #4b5563;
          }
        </style>
      </head>
      <body>
        <h1>${payload.title || 'Lucy3000'}</h1>
        <div class="muted">${payload.subtitle || 'Ticket'}</div>
        <div class="meta">
          ${payload.saleNumber ? `<div><span>Ticket</span><strong>${payload.saleNumber}</strong></div>` : ''}
          ${payload.customer ? `<div><span>Cliente</span><strong>${payload.customer}</strong></div>` : ''}
          ${payload.createdAt ? `<div><span>Fecha</span><strong>${payload.createdAt}</strong></div>` : ''}
          ${payload.paymentMethod ? `<div><span>Pago</span><strong>${payload.paymentMethod}</strong></div>` : ''}
        </div>
        <table>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div>${totalsHtml}</div>
        <div class="footer">${payload.footer || 'Gracias por tu visita'}</div>
      </body>
    </html>
  `
}
