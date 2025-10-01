import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App methods
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
  quit: () => ipcRenderer.invoke('app:quit'),
  
  // Backup methods
  createBackup: () => ipcRenderer.invoke('backup:create'),
  
  // Print methods
  printPDF: (data: any) => ipcRenderer.invoke('print:pdf', data),
})

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>
      getPath: (name: string) => Promise<string>
      quit: () => Promise<void>
      createBackup: () => Promise<{ success: boolean; message?: string }>
      printPDF: (data: any) => Promise<{ success: boolean; error?: any }>
    }
  }
}

