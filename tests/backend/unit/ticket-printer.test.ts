import { describe, expect, it } from 'vitest'
import { buildEscPosTicketBuffer } from '../../../src/main/escpos'
import {
  DEFAULT_NETWORK_TICKET_PORT,
  normalizeTicketPrinterConfig,
  validateTicketPrinterConfig
} from '../../../src/shared/ticketPrinter'

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
      title: 'Lucy3000',
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
      totals: [{ label: 'Total', value: '12,50 EUR' }],
      footer: 'Gracias por tu visita'
    })

    const ascii = buffer.toString('ascii')

    expect(buffer.at(0)).toBe(0x1b)
    expect(ascii).toContain('Prueba de impresion')
    expect(ascii).toContain('Maria Lopez')
    expect(ascii).toContain('Champu reparacion')
    expect(buffer.includes(Buffer.from([0x1d, 0x56, 0x00]))).toBe(true)
  })
})
