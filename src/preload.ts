import { contextBridge, ipcRenderer } from 'electron'
import type { TicketPrinterConfig } from './shared/ticketPrinter'

const electronAPI = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  quit: () => ipcRenderer.invoke('app:quit'),
  logs: {
    getFilePath: () => ipcRenderer.invoke('logs:getFilePath'),
    openFolder: () => ipcRenderer.invoke('logs:openFolder')
  },
  backup: {
    create: (destFolder?: string) => ipcRenderer.invoke('backup:create', destFolder),
    restore: () => ipcRenderer.invoke('backup:restore'),
    list: () => ipcRenderer.invoke('backup:list'),
    selectFolder: () => ipcRenderer.invoke('backup:selectFolder'),
    getConfig: () => ipcRenderer.invoke('backup:getConfig'),
    setConfig: (config: { folder: string; autoEnabled: boolean; cronExpression: string }) =>
      ipcRenderer.invoke('backup:setConfig', config)
  },
  printPDF: (data: { html: string; defaultFileName?: string; landscape?: boolean }) =>
    ipcRenderer.invoke('print:pdf', data),
  clientAssets: {
    list: (payload: { clientId: string; clientName: string }) => ipcRenderer.invoke('clientAssets:list', payload),
    import: (
      payload: {
        clientId: string
        clientName: string
        kind: 'photos' | 'consents' | 'documents'
        photoCategory?: 'before' | 'after' | 'treatments' | 'unclassified' | null
      }
    ) =>
      ipcRenderer.invoke('clientAssets:import', payload),
    delete: (payload: { clientId: string; clientName: string; assetId: string }) =>
      ipcRenderer.invoke('clientAssets:delete', payload),
    setPrimaryPhoto: (payload: { clientId: string; clientName: string; assetId: string }) =>
      ipcRenderer.invoke('clientAssets:setPrimaryPhoto', payload),
    setPhotoCategory: (
      payload: {
        clientId: string
        clientName: string
        assetId: string
        photoCategory: 'before' | 'after' | 'treatments' | 'unclassified' | null
      }
    ) => ipcRenderer.invoke('clientAssets:setPhotoCategory', payload),
    openFolder: (payload: { clientId: string; clientName: string }) =>
      ipcRenderer.invoke('clientAssets:openFolder', payload),
    openAsset: (payload: { clientId: string; clientName: string; assetId: string }) =>
      ipcRenderer.invoke('clientAssets:openAsset', payload)
  },
  ticket: {
    listPrinters: () => ipcRenderer.invoke('ticket:listPrinters'),
    getConfig: () => ipcRenderer.invoke('ticket:getConfig'),
    setConfig: (config: TicketPrinterConfig) => ipcRenderer.invoke('ticket:setConfig', config),
    getPrinter: () => ipcRenderer.invoke('ticket:getPrinter'),
    setPrinter: (printerName: string | null) => ipcRenderer.invoke('ticket:setPrinter', printerName),
    print: (payload: any) => ipcRenderer.invoke('ticket:print', payload)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>
      getPath: (name: string) => Promise<string>
      relaunch: () => Promise<{ success: boolean }>
      quit: () => Promise<void>
      logs: {
        getFilePath: () => Promise<string>
        openFolder: () => Promise<{ success: boolean; path: string; error?: string }>
      }
      backup: {
        create: (destFolder?: string) => Promise<{ success: boolean; message?: string; path?: string }>
        restore: () => Promise<{ success: boolean; message?: string; requiresRelaunch?: boolean }>
        list: () => Promise<{ success: boolean; backups: Array<{ name: string; date: string; size: number }> }>
        selectFolder: () => Promise<{ canceled: boolean; folder?: string }>
        getConfig: () => Promise<{ folder: string; autoEnabled: boolean; cronExpression: string }>
        setConfig: (config: { folder: string; autoEnabled: boolean; cronExpression: string }) => Promise<{ success: boolean }>
      }
      printPDF: (data: {
        html: string
        defaultFileName?: string
        landscape?: boolean
      }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>
      clientAssets: {
        list: (payload: { clientId: string; clientName: string }) => Promise<any>
        import: (
          payload: {
            clientId: string
            clientName: string
            kind: 'photos' | 'consents' | 'documents'
            photoCategory?: 'before' | 'after' | 'treatments' | 'unclassified' | null
          }
        ) => Promise<any>
        delete: (payload: { clientId: string; clientName: string; assetId: string }) => Promise<any>
        setPrimaryPhoto: (payload: { clientId: string; clientName: string; assetId: string }) => Promise<any>
        setPhotoCategory: (
          payload: {
            clientId: string
            clientName: string
            assetId: string
            photoCategory: 'before' | 'after' | 'treatments' | 'unclassified' | null
          }
        ) => Promise<any>
        openFolder: (payload: { clientId: string; clientName: string }) => Promise<{ success: boolean; baseDir: string }>
        openAsset: (payload: { clientId: string; clientName: string; assetId: string }) => Promise<{ success: boolean; error?: string }>
      }
      ticket: {
        listPrinters: () => Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>
        getConfig: () => Promise<TicketPrinterConfig>
        setConfig: (config: TicketPrinterConfig) => Promise<TicketPrinterConfig>
        getPrinter: () => Promise<{ ticketPrinterName: string | null }>
        setPrinter: (printerName: string | null) => Promise<TicketPrinterConfig>
        print: (payload: any) => Promise<{ success: boolean; error?: any }>
      }
    }
  }
}
