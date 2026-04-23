import type {
  ClientAssetOpenAssetResult,
  ClientAssetOpenFolderResult,
  ClientAssetsImportPayload,
  ClientAssetsOwnerPayload,
  ClientAssetsResponse,
  ClientAssetSelectionPayload,
  ClientAssetSetPhotoCategoryPayload,
  ImportGeneratedClientAssetsPayload,
  ImportGeneratedClientAssetsResult
} from './clientAssets'
import type { TicketPrintPayload, TicketPrinterConfig } from './ticketPrinter'

export type AppPathName =
  | 'home'
  | 'appData'
  | 'userData'
  | 'sessionData'
  | 'temp'
  | 'exe'
  | 'module'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'music'
  | 'pictures'
  | 'videos'
  | 'recent'
  | 'logs'
  | 'crashDumps'

export type RuntimeDataPaths = {
  userDataPath: string
  dbPath: string
  logsPath: string
  dbExists: boolean
}

export type OpenPathResult = {
  success: boolean
  path: string
  error?: string
}

export type ResetRuntimeDataResult = {
  success: boolean
  dbPath: string
  userDataPath: string
  requiresRelaunch: boolean
  backupPath?: string | null
  error?: string
}

export type BackupConfig = {
  folder: string
  autoEnabled: boolean
  cronExpression: string
}

export type BackupListEntry = {
  name: string
  date: string
  size: number
}

export type BackupCreateResult = {
  success: boolean
  message?: string
  path?: string
}

export type BackupRestoreResult = {
  success: boolean
  message?: string
  requiresRelaunch?: boolean
}

export type BackupListResult = {
  success: boolean
  backups: BackupListEntry[]
}

export type SelectFolderResult = {
  canceled: boolean
  folder?: string
}

export type TicketPrinterSummary = {
  name: string
  displayName: string
  isDefault: boolean
}

export type TicketPrinterSelection = {
  ticketPrinterName: string | null
}

export type TicketPrintResult = {
  success: boolean
  error?: unknown
}

export type PdfPrintPayload = {
  html: string
  defaultFileName?: string
  landscape?: boolean
}

export type PdfPrintResult = {
  success: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

export interface ElectronAPI {
  getVersion: () => Promise<string>
  getPath: (name: AppPathName) => Promise<string>
  getRuntimeDataPaths: () => Promise<RuntimeDataPaths>
  openRuntimeDataFolder: () => Promise<OpenPathResult>
  resetRuntimeData: () => Promise<ResetRuntimeDataResult>
  relaunch: () => Promise<{ success: boolean }>
  quit: () => Promise<void>
  logs: {
    getFilePath: () => Promise<string>
    openFolder: () => Promise<OpenPathResult>
  }
  backup: {
    create: (destFolder?: string) => Promise<BackupCreateResult>
    restore: () => Promise<BackupRestoreResult>
    list: () => Promise<BackupListResult>
    selectFolder: () => Promise<SelectFolderResult>
    getConfig: () => Promise<BackupConfig>
    setConfig: (config: BackupConfig) => Promise<{ success: boolean }>
  }
  printPDF: (data: PdfPrintPayload) => Promise<PdfPrintResult>
  clientAssets: {
    list: (payload: ClientAssetsOwnerPayload) => Promise<ClientAssetsResponse>
    import: (payload: ClientAssetsImportPayload) => Promise<ClientAssetsResponse>
    importGenerated: (payload: ImportGeneratedClientAssetsPayload) => Promise<ImportGeneratedClientAssetsResult>
    delete: (payload: ClientAssetSelectionPayload) => Promise<ClientAssetsResponse>
    setPrimaryPhoto: (payload: ClientAssetSelectionPayload) => Promise<ClientAssetsResponse>
    setPhotoCategory: (payload: ClientAssetSetPhotoCategoryPayload) => Promise<ClientAssetsResponse>
    openFolder: (payload: ClientAssetsOwnerPayload) => Promise<ClientAssetOpenFolderResult>
    openAsset: (payload: ClientAssetSelectionPayload) => Promise<ClientAssetOpenAssetResult>
  }
  ticket: {
    listPrinters: () => Promise<TicketPrinterSummary[]>
    getConfig: () => Promise<TicketPrinterConfig>
    setConfig: (config: TicketPrinterConfig) => Promise<TicketPrinterConfig>
    getPrinter: () => Promise<TicketPrinterSelection>
    setPrinter: (printerName: string | null) => Promise<TicketPrinterConfig>
    print: (payload: TicketPrintPayload) => Promise<TicketPrintResult>
  }
}
