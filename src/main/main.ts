import { app, BrowserWindow, dialog, protocol } from 'electron'
import path from 'path'
import {
  getMainLogFilePath,
  initializeMainLogging,
  installMainProcessErrorLogging,
  sanitizeLogValue,
  writeMainLog
} from './logging'
import { CLIENT_ASSET_PROTOCOL } from '../shared/clientAssets'
import { createBackendRuntime, type BackendRuntime } from './backendRuntime'
import { createRuntimeDataService, type RuntimeDataService } from './runtimeData'
import { createBackupRuntime, type BackupRuntime } from './backupRuntime'
import { createClientAssetsRuntime, type ClientAssetsRuntime } from './clientAssetsRuntime'
import { createPrintingRuntime, type PrintingRuntime } from './printing'
import { createMainWindow } from './window'
import { installAppMenu } from './menu'
import { registerAppIpcHandlers } from './ipc/app'
import { registerBackupIpcHandlers } from './ipc/backup'
import { registerClientAssetIpcHandlers } from './ipc/clientAssets'
import { registerPrintingIpcHandlers } from './ipc/printing'
import { applyDevelopmentRuntimePaths, getUserDataDir } from './runtimePaths'

let isForcingAppExit = false
let backendRuntime: BackendRuntime | null = null
let runtimeDataService: RuntimeDataService | null = null
let backupRuntime: BackupRuntime | null = null
let clientAssetsRuntime: ClientAssetsRuntime | null = null
let printingRuntime: PrintingRuntime | null = null

const isDevelopment = process.env.NODE_ENV === 'development'
const shouldAutoOpenDevTools = isDevelopment && process.env.ELECTRON_OPEN_DEVTOOLS === '1'
const backendPort = process.env.PORT || '3001'

applyDevelopmentRuntimePaths(isDevelopment)

protocol.registerSchemesAsPrivileged([
  {
    scheme: CLIENT_ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

app.whenReady().then(async () => {
  if (isDevelopment) {
    app.setAppLogsPath(path.join(getUserDataDir(), 'logs'))
  } else {
    app.setAppLogsPath()
  }
  initializeMainLogging()
  installMainProcessErrorLogging()
  writeMainLog('info', 'Electron app ready', {
    appVersion: app.getVersion(),
    logFilePath: getMainLogFilePath()
  })

  backendRuntime = createBackendRuntime({ isDevelopment, backendPort })
  runtimeDataService = createRuntimeDataService({ isDevelopment, backendRuntime })
  backupRuntime = createBackupRuntime({ isDevelopment, backendRuntime })
  clientAssetsRuntime = createClientAssetsRuntime()
  printingRuntime = createPrintingRuntime()

  registerAppIpcHandlers(runtimeDataService)
  registerBackupIpcHandlers(backupRuntime)
  registerClientAssetIpcHandlers(clientAssetsRuntime)
  registerPrintingIpcHandlers(printingRuntime)

  clientAssetsRuntime.registerProtocolHandler()

  try {
    await backendRuntime.ensureBackendReady()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend startup failed'
    writeMainLog('error', 'Backend unavailable during startup', error)
    dialog.showErrorBox('Backend unavailable', message)
    app.quit()
    return
  }

  installAppMenu(() => runtimeDataService?.showDatabaseHelpDialog())
  createMainWindow({ isDevelopment, shouldAutoOpenDevTools })

  backupRuntime.initializeAutoBackup()
    .catch((error) => {
      writeMainLog('error', 'Failed to initialize auto-backup', error)
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ isDevelopment, shouldAutoOpenDevTools })
    }
  })
})

app.on('window-all-closed', () => {
  writeMainLog('info', 'All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  writeMainLog('info', 'Application quitting')
  backupRuntime?.dispose()
})

app.on('before-quit', (event) => {
  if (isDevelopment || isForcingAppExit || !backendRuntime?.hasManagedProcess()) {
    return
  }

  event.preventDefault()
  isForcingAppExit = true

  void backendRuntime.stopBackendGracefully().finally(() => {
    app.exit(0)
  })
})

app.on('child-process-gone', (_event, details) => {
  writeMainLog('error', 'Child process gone', sanitizeLogValue(details))
})
