import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from './shared/electron'

const electronAPI: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  getRuntimeDataPaths: () => ipcRenderer.invoke('app:getRuntimeDataPaths'),
  openRuntimeDataFolder: () => ipcRenderer.invoke('app:openRuntimeDataFolder'),
  resetRuntimeData: () => ipcRenderer.invoke('app:resetRuntimeData'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  quit: () => ipcRenderer.invoke('app:quit'),
  logs: {
    getFilePath: () => ipcRenderer.invoke('logs:getFilePath'),
    openFolder: () => ipcRenderer.invoke('logs:openFolder')
  },
  backup: {
    create: (destFolder) => ipcRenderer.invoke('backup:create', destFolder),
    restore: () => ipcRenderer.invoke('backup:restore'),
    list: () => ipcRenderer.invoke('backup:list'),
    selectFolder: () => ipcRenderer.invoke('backup:selectFolder'),
    getConfig: () => ipcRenderer.invoke('backup:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('backup:setConfig', config)
  },
  printPDF: (data) => ipcRenderer.invoke('print:pdf', data),
  clientAssets: {
    list: (payload) => ipcRenderer.invoke('clientAssets:list', payload),
    import: (payload) => ipcRenderer.invoke('clientAssets:import', payload),
    importGenerated: (payload) => ipcRenderer.invoke('clientAssets:importGenerated', payload),
    delete: (payload) => ipcRenderer.invoke('clientAssets:delete', payload),
    setPrimaryPhoto: (payload) => ipcRenderer.invoke('clientAssets:setPrimaryPhoto', payload),
    setPhotoCategory: (payload) => ipcRenderer.invoke('clientAssets:setPhotoCategory', payload),
    openFolder: (payload) => ipcRenderer.invoke('clientAssets:openFolder', payload),
    openAsset: (payload) => ipcRenderer.invoke('clientAssets:openAsset', payload)
  },
  ticket: {
    listPrinters: () => ipcRenderer.invoke('ticket:listPrinters'),
    getConfig: () => ipcRenderer.invoke('ticket:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('ticket:setConfig', config),
    getPrinter: () => ipcRenderer.invoke('ticket:getPrinter'),
    setPrinter: (printerName) => ipcRenderer.invoke('ticket:setPrinter', printerName),
    print: (payload) => ipcRenderer.invoke('ticket:print', payload)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
