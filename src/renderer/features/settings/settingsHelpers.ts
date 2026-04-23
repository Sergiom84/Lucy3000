import type { TicketPrinterConfig } from '../../utils/desktop'

export const resolveSettingsApiOrigin = (baseUrl: string | undefined, windowOrigin: string) => {
  const resolvedBaseUrl = typeof baseUrl === 'string' ? baseUrl : windowOrigin

  try {
    return new URL(resolvedBaseUrl, windowOrigin).origin
  } catch {
    return windowOrigin
  }
}

export const buildDesktopEnvPath = (desktopExePath: string) => {
  if (!desktopExePath) return ''

  const lastSeparatorIndex = Math.max(desktopExePath.lastIndexOf('\\'), desktopExePath.lastIndexOf('/'))
  if (lastSeparatorIndex < 0) return '.env'

  return `${desktopExePath.slice(0, lastSeparatorIndex + 1)}.env`
}

export const buildPrinterConfig = (
  printerMode: TicketPrinterConfig['mode'],
  selectedPrinter: string,
  networkHost: string,
  networkPort: string
): TicketPrinterConfig => ({
  mode: printerMode,
  ticketPrinterName: selectedPrinter || null,
  networkHost: networkHost.trim(),
  networkPort: Number(networkPort)
})

export const getPrinterConfigValidationError = (config: TicketPrinterConfig) => {
  if (config.mode === 'system' && !config.ticketPrinterName) {
    return 'Selecciona una impresora de Windows para el modo sistema'
  }

  if (config.mode === 'network' && !config.networkHost) {
    return 'Introduce la IP o el host de la impresora ESC/POS'
  }

  if (!Number.isInteger(config.networkPort) || config.networkPort <= 0 || config.networkPort > 65535) {
    return 'Introduce un puerto válido entre 1 y 65535'
  }

  return null
}
