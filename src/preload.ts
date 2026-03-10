import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
  quit: () => ipcRenderer.invoke('app:quit'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  printPDF: (data: any) => ipcRenderer.invoke('print:pdf', data),
  clientAssets: {
    list: (payload: { clientId: string; clientName: string }) => ipcRenderer.invoke('clientAssets:list', payload),
    import: (payload: { clientId: string; clientName: string; kind: 'photos' | 'consents' }) =>
      ipcRenderer.invoke('clientAssets:import', payload),
    delete: (payload: { clientId: string; clientName: string; assetId: string }) =>
      ipcRenderer.invoke('clientAssets:delete', payload),
    setPrimaryPhoto: (payload: { clientId: string; clientName: string; assetId: string }) =>
      ipcRenderer.invoke('clientAssets:setPrimaryPhoto', payload),
    openFolder: (payload: { clientId: string; clientName: string }) =>
      ipcRenderer.invoke('clientAssets:openFolder', payload)
  },
  ticket: {
    listPrinters: () => ipcRenderer.invoke('ticket:listPrinters'),
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
      quit: () => Promise<void>
      createBackup: () => Promise<{ success: boolean; message?: string }>
      printPDF: (data: any) => Promise<{ success: boolean; error?: any }>
      clientAssets: {
        list: (payload: { clientId: string; clientName: string }) => Promise<any>
        import: (payload: { clientId: string; clientName: string; kind: 'photos' | 'consents' }) => Promise<any>
        delete: (payload: { clientId: string; clientName: string; assetId: string }) => Promise<any>
        setPrimaryPhoto: (payload: { clientId: string; clientName: string; assetId: string }) => Promise<any>
        openFolder: (payload: { clientId: string; clientName: string }) => Promise<{ success: boolean; baseDir: string }>
      }
      ticket: {
        listPrinters: () => Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>
        getPrinter: () => Promise<{ ticketPrinterName: string | null }>
        setPrinter: (printerName: string | null) => Promise<{ ticketPrinterName: string | null }>
        print: (payload: any) => Promise<{ success: boolean; error?: any }>
      }
    }
  }
}
