import { BrowserWindow } from 'electron'
import path from 'path'
import {
  rendererConsoleLevelToLogLevel,
  sanitizeLogValue,
  writeMainLog
} from './logging'
import { setMainWindow } from './windowState'

export const createMainWindow = (options: {
  isDevelopment: boolean
  shouldAutoOpenDevTools: boolean
}) => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
    show: false
  })

  setMainWindow(mainWindow)

  if (options.isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    if (options.shouldAutoOpenDevTools) {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
  }

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2 || String(sourceId || '').startsWith('devtools://')) {
      return
    }

    writeMainLog(rendererConsoleLevelToLogLevel(level), 'Renderer console message', {
      message,
      line,
      sourceId
    })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeMainLog('error', 'Renderer process gone', sanitizeLogValue(details))
  })

  mainWindow.webContents.on('unresponsive', () => {
    writeMainLog('warn', 'Main window became unresponsive')
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeMainLog('error', 'Renderer failed to load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    })
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    setMainWindow(null)
  })

  return mainWindow
}
