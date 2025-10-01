import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
    show: false,
  })

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPath', (_, name: string) => {
  return app.getPath(name as any)
})

ipcMain.handle('app:quit', () => {
  app.quit()
})

// Backup handler
ipcMain.handle('backup:create', async () => {
  try {
    // Implementar lógica de backup
    return { success: true, message: 'Backup creado exitosamente' }
  } catch (error) {
    return { success: false, message: 'Error al crear backup' }
  }
})

// Print handler
ipcMain.handle('print:pdf', async (_, data) => {
  try {
    // Implementar lógica de impresión
    return { success: true }
  } catch (error) {
    return { success: false, error }
  }
})

