import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { ChildProcess, spawn } from 'child_process'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

const isDevelopment = process.env.NODE_ENV === 'development'
const backendPort = process.env.PORT || '3001'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForBackendReady = async () => {
  for (let i = 0; i < 20; i++) {
    try {
      const response = await fetch(`http://localhost:${backendPort}/health`)
      if (response.ok) {
        return true
      }
    } catch {
      // Backend still booting
    }

    await wait(500)
  }

  return false
}

const startBackendInProduction = async () => {
  if (isDevelopment || backendProcess) return

  const backendEntry = path.join(__dirname, '../backend/server.js')
  if (!fs.existsSync(backendEntry)) {
    console.error(`[backend] Backend entry not found: ${backendEntry}`)
    return
  }

  backendProcess = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: backendPort
    }
  })

  backendProcess.stdout?.on('data', (chunk) => {
    console.log(`[backend] ${chunk.toString().trim()}`)
  })

  backendProcess.stderr?.on('data', (chunk) => {
    console.error(`[backend] ${chunk.toString().trim()}`)
  })

  backendProcess.on('exit', (code) => {
    console.error(`[backend] Process exited with code ${code}`)
    backendProcess = null
  })

  await waitForBackendReady()
}

const stopBackend = () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
    backendProcess = null
  }
}

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
  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
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
app.whenReady().then(async () => {
  await startBackendInProduction()
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

app.on('before-quit', () => {
  stopBackend()
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
ipcMain.handle('print:pdf', async (_, _data) => {
  try {
    // Implementar lógica de impresión
    return { success: true }
  } catch (error) {
    return { success: false, error }
  }
})

