import {
  DEFAULT_NETWORK_TICKET_PORT
} from '../../shared/ticketPrinter'
import { buildTicketHtml } from '../../shared/ticketHtml'
import type { TicketPrintPayload, TicketPrinterConfig } from '../../shared/ticketPrinter'

export type PhotoCategoryId = 'before' | 'after' | 'treatments' | 'unclassified'
export type ClientAssetKind = 'photos' | 'consents' | 'documents'
export type ClientAssetPreviewType = 'image' | 'pdf' | 'file'

export type ClientAsset = {
  id: string
  kind: ClientAssetKind
  fileName: string
  originalName: string
  addedAt: string
  takenAt?: string | null
  photoCategory?: PhotoCategoryId | null
  absolutePath: string
  previewUrl: string
  previewType: ClientAssetPreviewType
  isPrimaryPhoto: boolean
}

export type ClientPhotoCategorySummary = {
  id: PhotoCategoryId
  label: string
  photoCount: number
  coverUrl: string | null
}

export type ClientAssetsResponse = {
  baseDir: string
  primaryPhotoUrl: string | null
  photoCategories: ClientPhotoCategorySummary[]
  photos: ClientAsset[]
  consents: ClientAsset[]
  documents: ClientAsset[]
}

export type TicketPrinter = {
  name: string
  displayName: string
  isDefault: boolean
}

export type { TicketPrinterConfig }
export type TicketPayload = TicketPrintPayload
export type TicketPrintResult = {
  mode: 'desktop' | 'browser'
}

const desktopUnavailableError = 'Disponible solo en la app de escritorio'
const CLIENT_ASSET_PROTOCOL = 'lucyasset://asset/'
let browserPrintFrame: HTMLIFrameElement | null = null

const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const normalizeDesktopAssetUrl = (value: string | null | undefined): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith(CLIENT_ASSET_PROTOCOL)) return trimmed
  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) return trimmed
  if (!window.electronAPI) return trimmed

  let absolutePath = trimmed
  if (/^file:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      absolutePath = decodeURIComponent(parsed.pathname)
    } catch {
      return trimmed
    }
  }

  if (/^\/[a-zA-Z]:\//.test(absolutePath)) {
    absolutePath = absolutePath.slice(1)
  }

  if (/^[a-zA-Z]:[\\/]/.test(absolutePath)) {
    const normalizedPath = absolutePath.replace(/\//g, '\\')
    return `${CLIENT_ASSET_PROTOCOL}${encodeBase64Url(normalizedPath)}`
  }

  return trimmed
}

const removeBrowserPrintFrame = () => {
  if (!browserPrintFrame) {
    return
  }

  browserPrintFrame.remove()
  browserPrintFrame = null
}

const printTicketInBrowser = async (payload: TicketPayload): Promise<TicketPrintResult> => {
  if (typeof document === 'undefined') {
    throw new Error('La impresión web no está disponible en este entorno')
  }

  removeBrowserPrintFrame()

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)
  browserPrintFrame = iframe

  return new Promise((resolve, reject) => {
    let settled = false
    let fallbackTimer = 0

    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(fallbackTimer)
      if (browserPrintFrame === iframe) {
        browserPrintFrame = null
      }
      iframe.remove()

      if (error) {
        reject(error)
        return
      }

      resolve({ mode: 'browser' })
    }

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow
      if (!frameWindow) {
        finish(new Error('No se pudo abrir la vista previa de impresión'))
        return
      }

      const handleAfterPrint = () => {
        frameWindow.removeEventListener('afterprint', handleAfterPrint)
        finish()
      }

      frameWindow.addEventListener('afterprint', handleAfterPrint)
      fallbackTimer = window.setTimeout(() => finish(), 1500)

      try {
        frameWindow.focus()
        frameWindow.print()
      } catch (error) {
        finish(error instanceof Error ? error : new Error('No se pudo abrir el diálogo de impresión'))
      }
    }

    iframe.srcdoc = buildTicketHtml(payload)
  })
}

export const isDesktop = () => Boolean(window.electronAPI)

export const getDebugLogFilePath = async () => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.logs.getFilePath()
}

export const openDebugLogFolder = async () => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  const response = await window.electronAPI.logs.openFolder()
  if (!response.success) {
    throw new Error(response.error || 'No se pudo abrir la carpeta de logs')
  }

  return response.path
}

export const listClientAssets = async (clientId: string, clientName: string): Promise<ClientAssetsResponse> => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.list({ clientId, clientName })
}

export const importClientAssets = async (
  clientId: string,
  clientName: string,
  kind: ClientAssetKind,
  options?: { photoCategory?: PhotoCategoryId | null }
): Promise<ClientAssetsResponse> => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.import({
    clientId,
    clientName,
    kind,
    photoCategory: options?.photoCategory ?? null
  })
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

export const setClientPhotoCategory = async (
  clientId: string,
  clientName: string,
  assetId: string,
  photoCategory: PhotoCategoryId | null
): Promise<ClientAssetsResponse> => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.setPhotoCategory({ clientId, clientName, assetId, photoCategory })
}

export const openClientFolder = async (clientId: string, clientName: string) => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  return window.electronAPI.clientAssets.openFolder({ clientId, clientName })
}

export const openClientAsset = async (clientId: string, clientName: string, assetId: string) => {
  if (!window.electronAPI) {
    throw new Error(desktopUnavailableError)
  }

  const response = await window.electronAPI.clientAssets.openAsset({ clientId, clientName, assetId })
  if (!response.success) {
    throw new Error(response.error || 'No se pudo abrir el archivo')
  }

  return response
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

export const getPrintTicketSuccessMessage = (result: TicketPrintResult) =>
  result.mode === 'browser' ? 'Se abrió el diálogo de impresión del navegador' : 'Ticket enviado a la impresora'

export const printTicket = async (payload: TicketPayload): Promise<TicketPrintResult> => {
  if (!window.electronAPI) {
    return printTicketInBrowser(payload)
  }

  const response = await window.electronAPI.ticket.print(payload)
  if (!response.success) {
    throw new Error(response.error || 'No se pudo imprimir el ticket')
  }

  return { mode: 'desktop' }
}
