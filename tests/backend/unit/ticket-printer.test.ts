import { describe, expect, it } from 'vitest'
import { buildEscPosTicketBuffer } from '../../../src/main/escpos'
import { buildTicketHtml } from '../../../src/shared/ticketHtml'
import {
  DEFAULT_NETWORK_TICKET_PORT,
  normalizeTicketPrinterConfig,
  validateTicketPrinterConfig
} from '../../../src/shared/ticketPrinter'
import { TICKET_BUSINESS_NAME } from '../../../src/shared/ticketIdentity'

describe('ticket printer config', () => {
  it('normalizes legacy system printer config', () => {
    const config = normalizeTicketPrinterConfig({
      ticketPrinterName: 'POS-80'
    })

    expect(config).toEqual({
      mode: 'system',
      ticketPrinterName: 'POS-80',
      networkHost: '',
      networkPort: DEFAULT_NETWORK_TICKET_PORT
    })
  })

  it('validates network printer host and port', () => {
    expect(
      validateTicketPrinterConfig({
        mode: 'network',
        ticketPrinterName: null,
        networkHost: '',
        networkPort: 9100
      })
    ).toEqual({
      valid: false,
      error: 'Falta la IP o el host de la impresora ESC/POS'
    })

    expect(
      validateTicketPrinterConfig({
        mode: 'network',
        ticketPrinterName: null,
        networkHost: '192.168.1.50',
        networkPort: 9100
      })
    ).toEqual({
      valid: true
    })
  })
})

describe('ESC/POS ticket buffer', () => {
  it('builds an ASCII-safe receipt with cut command', () => {
    const buffer = buildEscPosTicketBuffer({
      title: TICKET_BUSINESS_NAME,
      subtitle: 'Prueba de impresión',
      saleNumber: 'TEST-1',
      customer: 'María López',
      paymentMethod: 'Tarjeta',
      items: [
        {
          description: 'Champú reparación',
          quantity: 1,
          unitPrice: 12.5,
          total: 12.5
        }
      ],
      totals: [
        { label: 'Total', value: '12,50 EUR' },
        { label: 'Pagado', value: '12,50 EUR' }
      ],
      footer: 'Gracias por tu visita'
    })

    const ascii = buffer.toString('ascii')

    expect(buffer.at(0)).toBe(0x1b)
    expect(ascii).toContain(TICKET_BUSINESS_NAME)
    expect(ascii).toContain('NIF 02196008Z')
    expect(ascii).toContain('Prueba de impresion')
    expect(ascii).toContain('Maria Lopez')
    expect(ascii).toContain('Champu reparacion')
    expect(ascii).toContain('Pagado')
    expect(buffer.includes(Buffer.from([0x1d, 0x56, 0x00]))).toBe(true)
  })
})

describe('ticket html', () => {
  it('builds a printable document for browser and Electron', () => {
    const html = buildTicketHtml({
      title: TICKET_BUSINESS_NAME,
      subtitle: 'Ticket web',
      saleNumber: 'WEB-1',
      customer: 'Cliente Web',
      items: [
        {
          description: 'Producto prueba',
          quantity: 1,
          unitPrice: 10,
          total: 10
        }
      ],
      totals: [
        { label: 'Total', value: '10,00 EUR' },
        { label: 'Pagado', value: '10,00 EUR' }
      ]
    })

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('@page')
    expect(html).toContain(TICKET_BUSINESS_NAME)
    expect(html).toContain('NIF 02196008Z')
    expect(html).toContain('Ticket web')
    expect(html).toContain('Producto prueba')
    expect(html).toContain('Precio')
    expect(html).toContain('Pagado')
  })
})
