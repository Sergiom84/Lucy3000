export type TicketPrintPayload = {
  title?: string
  subtitle?: string
  saleNumber?: string
  customer?: string
  createdAt?: string
  paymentMethod?: string
  items?: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
  }>
  totals?: Array<{
    label: string
    value: string
  }>
  footer?: string
}

export type TicketPrinterMode = 'system' | 'network'

export type TicketPrinterConfig = {
  mode: TicketPrinterMode
  ticketPrinterName: string | null
  networkHost: string
  networkPort: number
}

export const DEFAULT_NETWORK_TICKET_PORT = 9100

export const DEFAULT_TICKET_PRINTER_CONFIG: TicketPrinterConfig = {
  mode: 'system',
  ticketPrinterName: null,
  networkHost: '',
  networkPort: DEFAULT_NETWORK_TICKET_PORT
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const cleanString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export const normalizeTicketPrinterConfig = (value: unknown): TicketPrinterConfig => {
  if (!isRecord(value)) {
    return { ...DEFAULT_TICKET_PRINTER_CONFIG }
  }

  const mode = value.mode === 'network' ? 'network' : 'system'
  const ticketPrinterName = cleanString(value.ticketPrinterName) || null
  const networkHost = cleanString(value.networkHost)
  const rawPort = typeof value.networkPort === 'number' ? value.networkPort : Number(value.networkPort)
  const networkPort = Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535
    ? rawPort
    : DEFAULT_NETWORK_TICKET_PORT

  return {
    mode,
    ticketPrinterName,
    networkHost,
    networkPort
  }
}

export const validateTicketPrinterConfig = (config: TicketPrinterConfig) => {
  if (config.mode === 'system') {
    if (!config.ticketPrinterName) {
      return { valid: false, error: 'No hay impresora de tickets configurada' }
    }

    return { valid: true as const }
  }

  if (!config.networkHost) {
    return { valid: false, error: 'Falta la IP o el host de la impresora ESC/POS' }
  }

  if (!Number.isInteger(config.networkPort) || config.networkPort <= 0 || config.networkPort > 65535) {
    return { valid: false, error: 'El puerto de la impresora debe estar entre 1 y 65535' }
  }

  return { valid: true as const }
}
