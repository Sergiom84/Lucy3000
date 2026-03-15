import net from 'node:net'
import type { TicketPrintPayload } from '../shared/ticketPrinter'

const ESC = 0x1b
const GS = 0x1d
const RECEIPT_WIDTH = 42

const sanitizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/€/g, 'EUR')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const wrapText = (value: string, width: number) => {
  const text = sanitizeText(value)
  if (!text) {
    return ['']
  }

  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }

      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width))
      }

      continue
    }

    const next = current ? `${current} ${word}` : word
    if (next.length <= width) {
      current = next
      continue
    }

    lines.push(current)
    current = word
  }

  if (current) {
    lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
}

const padLine = (left: string, right: string, width = RECEIPT_WIDTH) => {
  const safeLeft = sanitizeText(left)
  const safeRight = sanitizeText(right)
  const space = Math.max(1, width - safeLeft.length - safeRight.length)
  return `${safeLeft}${' '.repeat(space)}${safeRight}`.slice(0, width)
}

const centerLine = (value: string, width = RECEIPT_WIDTH) => {
  const safe = sanitizeText(value)
  if (safe.length >= width) {
    return safe.slice(0, width)
  }

  const leftPad = Math.floor((width - safe.length) / 2)
  return `${' '.repeat(leftPad)}${safe}`
}

const separator = '-'.repeat(RECEIPT_WIDTH)

const command = (...bytes: number[]) => Buffer.from(bytes)
const text = (value = '') => Buffer.from(`${value}\n`, 'ascii')

export const buildEscPosTicketBuffer = (payload: TicketPrintPayload) => {
  const parts: Buffer[] = [command(ESC, 0x40)]
  const pushLine = (value = '') => {
    parts.push(text(value))
  }

  parts.push(command(ESC, 0x61, 0x01))
  parts.push(command(ESC, 0x45, 0x01))
  for (const line of wrapText(payload.title || 'Lucy3000', RECEIPT_WIDTH)) {
    pushLine(centerLine(line))
  }
  parts.push(command(ESC, 0x45, 0x00))

  for (const line of wrapText(payload.subtitle || 'Ticket', RECEIPT_WIDTH)) {
    pushLine(centerLine(line))
  }

  pushLine()
  parts.push(command(ESC, 0x61, 0x00))
  pushLine(separator)

  const metadata = [
    ['Ticket', payload.saleNumber],
    ['Cliente', payload.customer],
    ['Fecha', payload.createdAt],
    ['Pago', payload.paymentMethod]
  ] as const

  for (const [label, value] of metadata) {
    if (!value) continue
    for (const line of wrapText(`${label}: ${value}`, RECEIPT_WIDTH)) {
      pushLine(line)
    }
  }

  pushLine(separator)

  for (const item of payload.items || []) {
    for (const line of wrapText(item.description, RECEIPT_WIDTH)) {
      pushLine(line)
    }

    pushLine(
      padLine(
        `${Number(item.quantity).toFixed(2)} x ${Number(item.unitPrice).toFixed(2)}`,
        Number(item.total).toFixed(2)
      )
    )
  }

  if ((payload.totals || []).length > 0) {
    pushLine(separator)
  }

  for (const total of payload.totals || []) {
    pushLine(padLine(total.label, total.value))
  }

  pushLine()
  parts.push(command(ESC, 0x61, 0x01))
  for (const line of wrapText(payload.footer || 'Gracias por tu visita', RECEIPT_WIDTH)) {
    pushLine(centerLine(line))
  }

  pushLine()
  pushLine()
  pushLine()
  parts.push(command(GS, 0x56, 0x00))

  return Buffer.concat(parts)
}

type PrintNetworkTicketOptions = {
  host: string
  port: number
  payload: TicketPrintPayload
  timeoutMs?: number
}

export const printNetworkTicket = async ({
  host,
  port,
  payload,
  timeoutMs = 4000
}: PrintNetworkTicketOptions) => {
  const ticket = buildEscPosTicketBuffer(payload)

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const socket = net.createConnection({ host, port })

    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      socket.removeAllListeners()

      if (error) {
        socket.destroy()
        reject(error)
        return
      }

      resolve()
    }

    socket.setTimeout(timeoutMs)

    socket.on('connect', () => {
      socket.end(ticket, () => finish())
    })

    socket.on('timeout', () => {
      finish(new Error(`Timeout conectando con la impresora (${host}:${port})`))
    })

    socket.on('error', (error) => {
      finish(error)
    })
  })
}
