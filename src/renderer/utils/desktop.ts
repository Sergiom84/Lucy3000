import {
  DEFAULT_NETWORK_TICKET_PORT
} from '../../shared/ticketPrinter'
import type { TicketPrinterConfig } from '../../shared/ticketPrinter'

export type ClientAssetKind = 'photos' | 'consents'

export type ClientAsset = {
  id: string
  kind: ClientAssetKind
  fileName: string
  originalName: string
  addedAt: string
  absolutePath: string
  previewUrl: string
  isPrimaryPhoto: boolean
}

export type ClientAssetsResponse = {
  baseDir: string
  primaryPhotoUrl: string | null
  photos: ClientAsset[]
  consents: ClientAsset[]
}

export type TicketPrinter = {
  name: string
  displayName: string
  isDefault: boolean
}

export type { TicketPrinterConfig }

export type TicketPayload = {
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

const desktopUnavailableError = 'Disponible solo en la app de escritorio'

export const isDesktop = () => Boolean(window.electronAPI)

export const listClientAssets = async (clientId: string, clientName: string): Promise<ClientAssetsResponse> => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.list({ clientId, clientName })
}

export const importClientAssets = async (
  clientId: string,
  clientName: string,
  kind: ClientAssetKind
): Promise<ClientAssetsResponse> => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.import({ clientId, clientName, kind })
}

export const deleteClientAsset = async (
  clientId: string,
  clientName: string,
  assetId: string
): Promise<ClientAssetsResponse> => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.delete({ clientId, clientName, assetId })
}

export const setPrimaryClientPhoto = async (
  clientId: string,
  clientName: string,
  assetId: string
): Promise<ClientAssetsResponse> => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.setPrimaryPhoto({ clientId, clientName, assetId })
}

export const openClientFolder = async (clientId: string, clientName: string) => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.openFolder({ clientId, clientName })
}

export const listTicketPrinters = async (): Promise<TicketPrinter[]> => {
  if (!window.electronAPI) {
    return []
  }

  return window.electronAPI.ticket.listPrinters()
}

export const getConfiguredTicketPrinter = async (): Promise<string | null> => {
  if (!window.electronAPI) {
    return null
  }

  const response = await window.electronAPI.ticket.getPrinter()
  return response.ticketPrinterName
}

export const getTicketPrinterConfig = async (): Promise<TicketPrinterConfig> => {
  if (!window.electronAPI) {
    return {
      mode: 'system',
      ticketPrinterName: null,
      networkHost: '',
      networkPort: DEFAULT_NETWORK_TICKET_PORT
    }
  }

  return window.electronAPI.ticket.getConfig()
}

export const setConfiguredTicketPrinter = async (printerName: string | null) => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.ticket.setPrinter(printerName)
}

export const saveTicketPrinterConfig = async (config: TicketPrinterConfig) => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.ticket.setConfig(config)
}

export const printTicket = async (payload: TicketPayload) => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  const response = await window.electronAPI.ticket.print(payload)
  if (!response.success) {
    throw new Error(response.error || 'No se pudo imprimir el ticket')
  }
}
