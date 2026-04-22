import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell, type MenuItemConstructorOptions } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import net from 'net'
import { promises as fsPromises } from 'fs'
import { ChildProcess, spawn } from 'child_process'
import { printNetworkTicket } from './escpos'
import {
  AUTO_BACKUP_PREFIX,
  MANUAL_BACKUP_PREFIX,
  PRE_RESTORE_BACKUP_PREFIX,
  createBackupSnapshot,
  listBackupEntries,
  pruneBackupEntries,
  resolveBackupSource,
  restoreDirectorySnapshot,
  restoreSqliteSnapshot
} from './backup'
import {
  getMainLogFilePath,
  initializeMainLogging,
  installMainProcessErrorLogging,
  rendererConsoleLevelToLogLevel,
  sanitizeLogValue,
  writeMainLog
} from './logging'
import {
  CLIENT_ASSET_PROTOCOL,
  createClientAssetManager,
  getContentTypeFromPath,
  type ClientAssetKind,
  type ImportGeneratedClientAssetInput,
  type PhotoCategoryId
} from './clientAssets'
import { buildTicketHtml } from '../shared/ticketHtml'
import {
  DEFAULT_TICKET_PRINTER_CONFIG,
  normalizeTicketPrinterConfig,
  validateTicketPrinterConfig
} from '../shared/ticketPrinter'
import type { TicketPrintPayload, TicketPrinterConfig } from '../shared/ticketPrinter'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
let isForcingAppExit = false

const isDevelopment = process.env.NODE_ENV === 'development'
const shouldAutoOpenDevTools = isDevelopment && process.env.ELECTRON_OPEN_DEVTOOLS === '1'
const backendPort = process.env.PORT || '3001'

if (isDevelopment) {
  const developmentRuntimeRoot = path.join(app.getPath('appData'), 'lucy3000-accounting-dev')
  app.setPath('userData', developmentRuntimeRoot)
  app.setPath('sessionData', path.join(developmentRuntimeRoot, 'session'))
}

type AppPathName =
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isLocalPortReachable = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port })

    const finish = (reachable: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(reachable)
    }

    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(500, () => finish(false))
  })

const isBackendPortOccupied = async () => {
  const port = Number(backendPort)

  if (!Number.isFinite(port)) {
    return false
  }

  for (const host of ['127.0.0.1', 'localhost']) {
    if (await isLocalPortReachable(host, port)) {
      return true
    }
  }

  return false
}

const waitForChildExit = (child: ChildProcess, timeoutMs = 5000) =>
  new Promise<boolean>((resolve) => {
    if (child.exitCode !== null) {
      resolve(true)
      return
    }

    const cleanup = () => {
      clearTimeout(timer)
      child.off('exit', handleExit)
      child.off('error', handleError)
    }

    const handleExit = () => {
      cleanup()
      resolve(true)
    }

    const handleError = () => {
      cleanup()
      resolve(true)
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeoutMs)

    child.once('exit', handleExit)
    child.once('error', handleError)
  })

const getUserDataDir = () => app.getPath('userData')
const getLegacyClientsRootDir = () => path.join(getUserDataDir(), 'clients')
const getDocumentsClientsRootDir = () =>
  path.join(app.getPath('documents'), 'Lucy3000', 'Documentos', 'Clientes')

const buildClientAssetPreviewUrl = (absolutePath: string) => {
  const encodedPath = Buffer.from(path.resolve(absolutePath), 'utf-8').toString('base64url')
  return `${CLIENT_ASSET_PROTOCOL}://asset/${encodedPath}`
}

const clientAssetManager = createClientAssetManager({
  getDocumentsClientsRootDir,
  getLegacyClientsRootDir,
  buildPreviewUrl: buildClientAssetPreviewUrl
})

const decodeClientAssetPathFromRequest = (requestUrl: string) => {
  try {
    const parsedUrl = new URL(requestUrl)
    if (parsedUrl.protocol !== `${CLIENT_ASSET_PROTOCOL}:` || parsedUrl.hostname !== 'asset') {
      return null
    }

    const encodedPath = parsedUrl.pathname.replace(/^\/+/, '')
    if (!encodedPath) return null

    const decodedPath = Buffer.from(encodedPath, 'base64url').toString('utf-8')
    return path.resolve(decodedPath)
  } catch {
    return null
  }
}

const handleClientAssetProtocol = async (request: { url: string }) => {
  const absolutePath = decodeClientAssetPathFromRequest(request.url)
  if (!absolutePath) {
    return new Response('Bad request', { status: 400 })
  }

  if (!clientAssetManager.isAllowedClientAssetPath(absolutePath)) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const stats = await fsPromises.stat(absolutePath)
    if (!stats.isFile()) {
      return new Response('Not found', { status: 404 })
    }

    const fileBuffer = await fsPromises.readFile(absolutePath)
    const responseBody = new Uint8Array(fileBuffer)
    return new Response(responseBody, {
      status: 200,
      headers: {
        'content-type': getContentTypeFromPath(absolutePath),
        'cache-control': 'private, max-age=31536000, immutable'
      }
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

const ensureDir = async (targetPath: string) => {
  await fsPromises.mkdir(targetPath, { recursive: true })
}
const getPrinterConfigPath = () => path.join(getUserDataDir(), 'device-config.json')

const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

const writeJsonFile = async (filePath: string, data: unknown) => {
  await ensureDir(path.dirname(filePath))
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const getTicketPrinterConfig = async (): Promise<TicketPrinterConfig> => {
  const config = await readJsonFile<unknown>(getPrinterConfigPath(), DEFAULT_TICKET_PRINTER_CONFIG)
  return normalizeTicketPrinterConfig(config)
}

const setTicketPrinterConfig = async (config: unknown) => {
  const normalizedConfig = normalizeTicketPrinterConfig(config)
  await writeJsonFile(getPrinterConfigPath(), normalizedConfig)
  return normalizedConfig
}

const waitForBackendReady = async (
  attempts: number,
  delayMs: number,
  hosts: string[] = ['localhost'],
  canContinue: () => boolean = () => true
) => {
  for (let i = 0; i < attempts; i += 1) {
    if (!canContinue()) {
      return false
    }

    for (const host of hosts) {
      try {
        const response = await fetch(`http://${host}:${backendPort}/health`)
        if (response.ok && canContinue()) {
          return true
        }
      } catch {
        // Backend still booting
      }
    }

    await wait(delayMs)
  }

  return false
}

const loadProductionEnv = (): Record<string, string> => {
  const envPaths = [
    path.join(path.dirname(process.execPath), '.env'),
    path.join(path.dirname(process.execPath), 'resources', '.env'),
    path.join(app.getPath('userData'), '.env')
  ]

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      writeMainLog('info', 'Loading production .env file', { envPath })
      const content = fs.readFileSync(envPath, 'utf-8')
      const vars: Record<string, string> = {}
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) continue
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
        vars[key] = value
      }
      return vars
    }
  }

  writeMainLog('warn', 'No .env file found for production')
  return {}
}

const getRuntimeJwtSecretPath = () => path.join(app.getPath('userData'), 'jwt-secret.txt')

const ensureRuntimeJwtSecret = async (existingSecret?: string) => {
  if (existingSecret) {
    return existingSecret
  }

  const secretPath = getRuntimeJwtSecretPath()

  try {
    const currentSecret = await fsPromises.readFile(secretPath, 'utf-8')
    const normalizedSecret = currentSecret.trim()
    if (normalizedSecret) {
      return normalizedSecret
    }
  } catch {
    // Secret file does not exist yet.
  }

  const generatedSecret = crypto.randomBytes(48).toString('hex')
  await ensureDir(path.dirname(secretPath))
  await fsPromises.writeFile(secretPath, generatedSecret, 'utf-8')
  writeMainLog('info', 'Generated runtime JWT secret', { secretPath })
  return generatedSecret
}

const resolveFileDatabasePath = (databaseUrl: string | undefined, schemaDir: string) => {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) {
    return null
  }

  const filePath = databaseUrl.slice('file:'.length)
  if (!filePath) {
    return null
  }

  if (path.isAbsolute(filePath)) {
    return filePath
  }

  return path.resolve(schemaDir, filePath)
}

const findExistingPath = (candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

const getPackagedBackendEntry = () =>
  findExistingPath([
    path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'backend', 'server.js'),
    path.join(__dirname, '../backend/server.js')
  ])

const getPackagedNodePath = () => {
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
    path.join(process.resourcesPath, 'app.asar', 'node_modules'),
    process.env.NODE_PATH
  ].filter((candidate): candidate is string => Boolean(candidate))

  return Array.from(new Set(candidates)).join(path.delimiter)
}

const getProductionDbPath = () => {
  const userDataDir = app.getPath('userData')
  return path.join(userDataDir, 'lucy3000.db')
}

const buildRuntimeDataPaths = () => {
  const userDataPath = app.getPath('userData')
  const dbPath = getProductionDbPath()
  const logsPath = app.getPath('logs')

  return {
    userDataPath,
    dbPath,
    logsPath,
    dbExists: fs.existsSync(dbPath)
  }
}

const openRuntimeDataFolder = async () => {
  const runtimeInfo = buildRuntimeDataPaths()
  const result = await shell.openPath(runtimeInfo.userDataPath)

  if (result) {
    writeMainLog('error', 'Failed to open runtime data folder', {
      userDataPath: runtimeInfo.userDataPath,
      result
    })
    return { success: false, error: result, path: runtimeInfo.userDataPath }
  }

  return { success: true, path: runtimeInfo.userDataPath }
}

const performRuntimeDataReset = async () => {
  const dbPath = getProductionDbPath()
  const userDataPath = app.getPath('userData')

  try {
    if (!isDevelopment) {
      await stopBackendGracefully()
    }

    let backupPath: string | null = null
    if (fs.existsSync(dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      backupPath = path.join(userDataPath, `lucy3000-reset-backup-${timestamp}.db`)
      await fsPromises.copyFile(dbPath, backupPath)
      await fsPromises.unlink(dbPath)
    }

    writeMainLog('info', 'Runtime data reset requested', {
      dbPath,
      backupPath,
      userDataPath
    })

    return {
      success: true,
      dbPath,
      backupPath,
      userDataPath,
      requiresRelaunch: !isDevelopment
    }
  } catch (error) {
    writeMainLog('error', 'Failed to reset runtime data', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      dbPath,
      userDataPath
    }
  }
}

const showDatabaseHelpDialog = async () => {
  const runtimeInfo = buildRuntimeDataPaths()
  const parentWindow = mainWindow ?? BrowserWindow.getFocusedWindow()
  const showMessageBox = (options: Electron.MessageBoxOptions) => {
    return parentWindow ? dialog.showMessageBox(parentWindow, options) : dialog.showMessageBox(options)
  }

  const result = await showMessageBox({
    type: 'info',
    title: 'Lucy3000 - BD local',
    message: 'Importante sobre la base de datos local',
    detail: [
      'Reinstalar Lucy3000 no borra la base local del equipo.',
      'Si el login no entra, puede que estés abriendo una instalación antigua con usuarios ya existentes.',
      '',
      `Base local activa: ${runtimeInfo.dbPath}`,
      `Carpeta de datos: ${runtimeInfo.userDataPath}`
    ].join('\n'),
    buttons: ['Abrir carpeta de datos', 'Restablecer instalación local', 'Cerrar'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (result.response === 0) {
    await openRuntimeDataFolder()
    return
  }

  if (result.response !== 1) {
    return
  }

  const confirmation = await showMessageBox({
    type: 'warning',
    title: 'Confirmar restablecimiento',
    message: 'Esto archivará la BD local actual y reiniciará la app.',
    detail:
      'Lucy3000 moverá la base activa a una copia de seguridad dentro de la carpeta de datos y volverá al bootstrap del primer administrador.',
    buttons: ['Cancelar', 'Restablecer'],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  })

  if (confirmation.response !== 1) {
    return
  }

  const resetResult = await performRuntimeDataReset()
  if (!resetResult.success) {
    dialog.showErrorBox('No se pudo restablecer la BD local', resetResult.error || 'Error desconocido')
    return
  }

  if (resetResult.requiresRelaunch) {
    const completed = await showMessageBox({
      type: 'info',
      title: 'BD local restablecida',
      message: 'Lucy3000 se reiniciará para aplicar el cambio.',
      detail: resetResult.backupPath
        ? `Copia de seguridad creada en:\n${resetResult.backupPath}`
        : 'No existía una base previa que archivar.',
      buttons: ['Reiniciar ahora'],
      defaultId: 0,
      noLink: true
    })

    if (completed.response === 0) {
      setTimeout(() => {
        app.relaunch()
        app.quit()
      }, 150)
    }
  }
}

const buildAppMenu = () => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'BD',
          click: () => {
            void showDatabaseHelpDialog()
          }
        },
        { type: 'separator' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const getBundledSeedDbPath = () =>
  findExistingPath([
    path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'packaged', 'lucy3000.db'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'prisma', 'lucy3000.db'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'lucy3000.db'),
    path.join(process.resourcesPath, 'prisma', 'packaged', 'lucy3000.db'),
    path.join(process.resourcesPath, 'prisma', 'prisma', 'lucy3000.db'),
    path.join(process.resourcesPath, 'prisma', 'lucy3000.db')
  ])

const ensureProductionDatabaseInitialized = async (dbPath: string) => {
  await ensureDir(path.dirname(dbPath))

  if (fs.existsSync(dbPath)) {
    return
  }

  const bundledSeedDbPath = getBundledSeedDbPath()
  if (!bundledSeedDbPath) {
    writeMainLog('warn', 'Bundled SQLite database not found, continuing with a fresh database')
    return
  }

  await fsPromises.copyFile(bundledSeedDbPath, dbPath)
  writeMainLog('info', 'Copied bundled database to production location', { dbPath, bundledSeedDbPath })
}

const startBackendInProduction = async () => {
  if (isDevelopment || backendProcess) return

  if (await isBackendPortOccupied()) {
    throw new Error(
      `El puerto ${backendPort} ya esta en uso. Cierra cualquier otra instancia de Lucy3000 o backend de desarrollo antes de abrir el instalador.`
    )
  }

  const backendEntry = getPackagedBackendEntry()
  if (!backendEntry || !fs.existsSync(backendEntry)) {
    throw new Error(`Packaged backend entry not found: ${backendEntry}`)
  }

  const productionEnv = loadProductionEnv()
  const dbPath = getProductionDbPath()
  const jwtSecret = await ensureRuntimeJwtSecret(productionEnv.JWT_SECRET)

  await ensureProductionDatabaseInitialized(dbPath)
  writeMainLog('info', 'Starting packaged backend process', {
    backendEntry,
    backendPort,
    dbPath
  })

  const child = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      ...productionEnv,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      NODE_PATH: getPackagedNodePath(),
      PORT: backendPort,
      JWT_SECRET: jwtSecret,
      DATABASE_URL: `file:${dbPath}`
    },
    windowsHide: true
  })

  backendProcess = child

  child.stdout?.on('data', (chunk) => {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      writeMainLog('info', 'Backend stdout', { line })
    }
  })

  child.stderr?.on('data', (chunk) => {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      writeMainLog('error', 'Backend stderr', { line })
    }
  })

  child.on('exit', (code) => {
    writeMainLog('error', 'Backend process exited', { code })
    if (backendProcess === child) {
      backendProcess = null
    }
  })

  const ready = await waitForBackendReady(
    40,
    500,
    ['localhost', '127.0.0.1'],
    () => backendProcess === child && child.exitCode === null
  )
  if (!ready) {
    await stopBackendGracefully()
    throw new Error(`Packaged backend did not respond on http://localhost:${backendPort}/health`)
  }
}

const ensureBackendReady = async () => {
  if (isDevelopment) {
    // In dev, ts-node + nodemon can take noticeably longer to compile/start.
    const ready = await waitForBackendReady(120, 500, ['localhost', '127.0.0.1'])
    if (!ready) {
      throw new Error(`Development backend did not respond on http://localhost:${backendPort}/health`)
    }

    return
  }

  await startBackendInProduction()
}

const stopBackendGracefully = async () => {
  const child = backendProcess
  if (!child) {
    return true
  }

  if (child.exitCode !== null) {
    backendProcess = null
    return true
  }

  backendProcess = null

  try {
    child.kill()
  } catch (error) {
    writeMainLog('warn', 'Failed to signal backend process for shutdown', error)
  }

  const exited = await waitForChildExit(child, 5000)
  if (!exited) {
    writeMainLog('warn', 'Backend process did not exit after shutdown signal', {
      pid: child.pid,
      timeoutMs: 5000
    })
  }

  return exited
}

const runWithPackagedBackendPaused = async <T>(
  taskLabel: string,
  options: { restartOnSuccess: boolean },
  task: () => Promise<T>
) => {
  const shouldPauseBackend = !isDevelopment && Boolean(backendProcess && backendProcess.exitCode === null)

  if (!shouldPauseBackend) {
    return task()
  }

  const stopped = await stopBackendGracefully()
  if (!stopped) {
    throw new Error(`No se pudo detener el backend para ${taskLabel}`)
  }

  let taskCompleted = false
  let taskError: unknown = null

  try {
    const result = await task()
    taskCompleted = true
    return result
  } catch (error) {
    taskError = error
    throw error
  } finally {
    if (!taskCompleted || options.restartOnSuccess) {
      try {
        await startBackendInProduction()
      } catch (restartError) {
        writeMainLog('error', `Failed to restart backend after ${taskLabel}`, restartError)
        if (!taskError) {
          throw restartError
        }
      }
    }
  }
}

const selectBackupRestoreSource = async () => {
  const parentWindow = mainWindow ?? BrowserWindow.getFocusedWindow()
  const showMessageBox = (options: Electron.MessageBoxOptions) =>
    parentWindow ? dialog.showMessageBox(parentWindow, options) : dialog.showMessageBox(options)
  const showOpenDialog = (options: Electron.OpenDialogOptions) =>
    parentWindow ? dialog.showOpenDialog(parentWindow, options) : dialog.showOpenDialog(options)

  const formatSelection = await showMessageBox({
    type: 'question',
    title: 'Restaurar backup',
    message: 'Selecciona el formato del backup a restaurar',
    detail: [
      'Backup completo: restaura la base de datos y los assets locales del cliente.',
      'Backup antiguo (.db): restaura solo la base de datos.'
    ].join('\n'),
    buttons: ['Backup completo', 'Backup antiguo (.db)', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (formatSelection.response === 2) {
    return null
  }

  const dialogResult =
    formatSelection.response === 0
      ? await showOpenDialog({
          title: 'Seleccionar carpeta de backup completo',
          properties: ['openDirectory']
        })
      : await showOpenDialog({
          title: 'Seleccionar backup .db',
          properties: ['openFile'],
          filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }]
        })

  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return null
  }

  return dialogResult.filePaths[0]
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
      contextIsolation: true
    },
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
    show: false
  })

  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    if (shouldAutoOpenDevTools) {
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
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

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

  protocol.handle(CLIENT_ASSET_PROTOCOL, handleClientAssetProtocol)

  try {
    await ensureBackendReady()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend startup failed'
    writeMainLog('error', 'Backend unavailable during startup', error)
    dialog.showErrorBox('Backend unavailable', message)
    app.quit()
    return
  }

  buildAppMenu()
  createWindow()

  // Initialize auto-backup
  getBackupConfig()
    .then(setupAutoBackup)
    .catch((error) => {
      writeMainLog('error', 'Failed to initialize auto-backup', error)
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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
})

app.on('before-quit', (event) => {
  if (isDevelopment || isForcingAppExit || !backendProcess) {
    return
  }

  event.preventDefault()
  isForcingAppExit = true

  void stopBackendGracefully().finally(() => {
    app.exit(0)
  })
})

app.on('child-process-gone', (_event, details) => {
  writeMainLog('error', 'Child process gone', sanitizeLogValue(details))
})

ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:getPath', (_, name: string) => app.getPath(name as AppPathName))
ipcMain.handle('app:getRuntimeDataPaths', () => buildRuntimeDataPaths())
ipcMain.handle('app:openRuntimeDataFolder', () => openRuntimeDataFolder())
ipcMain.handle('app:resetRuntimeData', () => performRuntimeDataReset())
ipcMain.handle('app:relaunch', () => {
  setTimeout(() => {
    app.relaunch()
    app.quit()
  }, 150)

  return { success: true }
})
ipcMain.handle('app:quit', () => {
  app.quit()
})
ipcMain.handle('logs:getFilePath', () => getMainLogFilePath())
ipcMain.handle('logs:openFolder', async () => {
  const logsDir = path.dirname(getMainLogFilePath())
  const result = await shell.openPath(logsDir)

  if (result) {
    writeMainLog('error', 'Failed to open logs folder', { logsDir, result })
    return { success: false, error: result, path: logsDir }
  }

  return { success: true, path: logsDir }
})

const getBackupConfigPath = () => path.join(getUserDataDir(), 'backup-config.json')
const getDefaultBackupDir = () => path.join(getUserDataDir(), 'backups')
const getDevelopmentDbPath = () => {
  const projectSchemaDir = path.join(process.cwd(), 'prisma')

  return (
    findExistingPath([
      resolveFileDatabasePath(process.env.DATABASE_URL, projectSchemaDir),
      path.join(projectSchemaDir, 'prisma', 'lucy3000.db'),
      path.join(projectSchemaDir, 'lucy3000.db')
    ]) || path.join(projectSchemaDir, 'prisma', 'lucy3000.db')
  )
}
const getDbPath = () => isDevelopment
  ? getDevelopmentDbPath()
  : getProductionDbPath()

const getBackupConfig = async () => {
  const defaults = { folder: getDefaultBackupDir(), autoEnabled: true, cronExpression: '0 3 * * 0' }
  return readJsonFile(getBackupConfigPath(), defaults)
}

const saveBackupConfig = async (config: { folder: string; autoEnabled: boolean; cronExpression: string }) => {
  await writeJsonFile(getBackupConfigPath(), config)
  return config
}

ipcMain.handle('backup:create', async (_, destFolder?: string) => {
  try {
    const config = await getBackupConfig()
    const targetDir = destFolder || config.folder
    await ensureDir(targetDir)

    const dbPath = getDbPath()
    const snapshot = await runWithPackagedBackendPaused(
      'crear el backup completo',
      { restartOnSuccess: true },
      () =>
        createBackupSnapshot({
          targetDir,
          dbPath,
          documentsClientsRootDir: getDocumentsClientsRootDir(),
          legacyClientsRootDir: getLegacyClientsRootDir(),
          prefix: MANUAL_BACKUP_PREFIX
        })
    )

    await pruneBackupEntries(targetDir, MANUAL_BACKUP_PREFIX, 10)

    writeMainLog('info', 'Manual backup created', {
      backupName: snapshot.backupName,
      backupPath: snapshot.backupPath,
      includesClientAssets: snapshot.includesClientAssets
    })

    return {
      success: true,
      message: `Backup completo creado: ${snapshot.backupName}`,
      path: snapshot.backupPath
    }
  } catch (error) {
    return { success: false, message: `Error al crear backup: ${error instanceof Error ? error.message : error}` }
  }
})

ipcMain.handle('backup:restore', async () => {
  try {
    const sourcePath = await selectBackupRestoreSource()
    if (!sourcePath) {
      return { success: false, message: 'Restauracion cancelada' }
    }

    const backupSource = await resolveBackupSource(sourcePath)
    const dbPath = getDbPath()

    writeMainLog('info', 'Starting backup restore', {
      sourcePath,
      dbPath,
      isDevelopment,
      backupFormat: backupSource.format,
      includesClientAssets: backupSource.includesClientAssets
    })

    const safetySnapshot = await runWithPackagedBackendPaused(
      'restaurar el backup',
      { restartOnSuccess: false },
      async () => {
        const preRestoreSnapshot = await createBackupSnapshot({
          targetDir: getUserDataDir(),
          dbPath,
          documentsClientsRootDir: getDocumentsClientsRootDir(),
          legacyClientsRootDir: getLegacyClientsRootDir(),
          prefix: PRE_RESTORE_BACKUP_PREFIX
        })

        await restoreSqliteSnapshot(backupSource, dbPath)

        if (
          backupSource.includesClientAssets &&
          backupSource.documentsClientsSourcePath &&
          backupSource.legacyClientsSourcePath
        ) {
          await restoreDirectorySnapshot(
            backupSource.documentsClientsSourcePath,
            getDocumentsClientsRootDir()
          )
          await restoreDirectorySnapshot(
            backupSource.legacyClientsSourcePath,
            getLegacyClientsRootDir()
          )
        }

        return preRestoreSnapshot
      }
    )

    writeMainLog('info', 'Backup restored successfully', {
      sourcePath,
      dbPath,
      safetyPath: safetySnapshot.backupPath,
      backupFormat: backupSource.format,
      includesClientAssets: backupSource.includesClientAssets,
      requiresRelaunch: !isDevelopment
    })

    const successMessage = backupSource.includesClientAssets
      ? isDevelopment
        ? 'Backup completo restaurado. Reinicia el entorno de desarrollo para aplicar los cambios.'
        : 'Backup completo restaurado. La aplicacion se reiniciara para aplicar los cambios.'
      : isDevelopment
        ? 'Backup de base de datos restaurado. Los assets locales del cliente no se han modificado. Reinicia el entorno de desarrollo para aplicar los cambios.'
        : 'Backup de base de datos restaurado. Los assets locales del cliente no se han modificado. La aplicacion se reiniciara para aplicar los cambios.'

    return {
      success: true,
      message: successMessage,
      requiresRelaunch: !isDevelopment
    }
  } catch (error) {
    writeMainLog('error', 'Backup restore failed', error)
    return { success: false, message: `Error al restaurar: ${error instanceof Error ? error.message : error}` }
  }
})

ipcMain.handle('backup:list', async () => {
  try {
    const config = await getBackupConfig()
    await ensureDir(config.folder)

    return { success: true, backups: await listBackupEntries(config.folder) }
  } catch (error) {
    return { success: true, backups: [] }
  }
})

ipcMain.handle('backup:selectFolder', async () => {
  const dialogResult = await dialog.showOpenDialog(mainWindow!, {
    title: 'Seleccionar carpeta de backups',
    properties: ['openDirectory']
  })

  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return { canceled: true }
  }

  return { canceled: false, folder: dialogResult.filePaths[0] }
})

ipcMain.handle('backup:getConfig', async () => {
  return getBackupConfig()
})

ipcMain.handle('backup:setConfig', async (_, config: { folder: string; autoEnabled: boolean; cronExpression: string }) => {
  await saveBackupConfig(config)
  setupAutoBackup(config)
  return { success: true }
})

let autoBackupTimer: ReturnType<typeof setInterval> | null = null

const setupAutoBackup = (config: { folder: string; autoEnabled: boolean; cronExpression: string }) => {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }

  if (!config.autoEnabled) return

  // Simple weekly interval (every 7 days) — cron expression is stored for display but we use setInterval
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  autoBackupTimer = setInterval(async () => {
    try {
      const dbPath = getDbPath()
      if (!fs.existsSync(dbPath)) return

      await ensureDir(config.folder)
      const snapshot = await runWithPackagedBackendPaused(
        'crear el backup automatico',
        { restartOnSuccess: true },
        () =>
          createBackupSnapshot({
            targetDir: config.folder,
            dbPath,
            documentsClientsRootDir: getDocumentsClientsRootDir(),
            legacyClientsRootDir: getLegacyClientsRootDir(),
            prefix: AUTO_BACKUP_PREFIX
          })
      )

      await pruneBackupEntries(config.folder, AUTO_BACKUP_PREFIX, 4)

      writeMainLog('info', 'Automatic backup created', {
        backupName: snapshot.backupName,
        folder: config.folder,
        includesClientAssets: snapshot.includesClientAssets
      })
    } catch (error) {
      writeMainLog('error', 'Automatic backup failed', error)
    }
  }, WEEK_MS)
}

ipcMain.handle('clientAssets:list', async (_, payload: { clientId: string; clientName: string }) => {
  return clientAssetManager.buildAssetResponse(payload.clientId, payload.clientName)
})

ipcMain.handle(
  'clientAssets:import',
  async (
    _,
    payload: { clientId: string; clientName: string; kind: ClientAssetKind; photoCategory?: PhotoCategoryId | null }
  ) => {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif']
    const consentExtensions = [...imageExtensions, 'pdf']
    const dialogTitleByKind: Record<ClientAssetKind, string> = {
      photos: 'Seleccionar fotos del cliente',
      consents: 'Seleccionar consentimientos',
      documents: 'Seleccionar documentos del cliente'
    }
    const dialogFilters =
      payload.kind === 'photos'
        ? [{ name: 'Imágenes', extensions: imageExtensions }]
        : payload.kind === 'consents'
          ? [{ name: 'Consentimientos', extensions: consentExtensions }]
          : undefined
    const dialogResult = await dialog.showOpenDialog(mainWindow!, {
      title: dialogTitleByKind[payload.kind],
      properties: ['openFile', 'multiSelections'],
      filters: dialogFilters
    })

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return clientAssetManager.buildAssetResponse(payload.clientId, payload.clientName)
    }

    return clientAssetManager.importClientAssets({
      clientId: payload.clientId,
      clientName: payload.clientName,
      sourcePaths: dialogResult.filePaths,
      kind: payload.kind,
      photoCategory: payload.photoCategory ?? null
    })
  }
)

ipcMain.handle(
  'clientAssets:importGenerated',
  async (_, payload: { assets: ImportGeneratedClientAssetInput[] }) => {
    return clientAssetManager.importGeneratedClientAssets(payload.assets || [])
  }
)

ipcMain.handle(
  'clientAssets:delete',
  async (_, payload: { clientId: string; clientName: string; assetId: string }) => {
    return clientAssetManager.deleteClientAsset(payload.clientId, payload.clientName, payload.assetId)
  }
)

ipcMain.handle(
  'clientAssets:setPrimaryPhoto',
  async (_, payload: { clientId: string; clientName: string; assetId: string }) => {
    return clientAssetManager.setPrimaryClientPhoto(payload.clientId, payload.clientName, payload.assetId)
  }
)

ipcMain.handle(
  'clientAssets:setPhotoCategory',
  async (
    _,
    payload: { clientId: string; clientName: string; assetId: string; photoCategory: PhotoCategoryId | null }
  ) => {
    return clientAssetManager.setClientPhotoCategory(payload)
  }
)

ipcMain.handle('clientAssets:openFolder', async (_, payload: { clientId: string; clientName: string }) => {
  const baseDir = await clientAssetManager.getClientBaseDir(payload.clientId, payload.clientName)
  await shell.openPath(baseDir)
  return { success: true, baseDir }
})

ipcMain.handle('clientAssets:openAsset', async (_, payload: { clientId: string; clientName: string; assetId: string }) => {
  const absolutePath = await clientAssetManager.getAssetAbsolutePath(payload.clientId, payload.clientName, payload.assetId)

  if (!absolutePath) {
    return { success: false, error: 'Archivo no encontrado' }
  }

  const result = await shell.openPath(absolutePath)
  if (result) {
    return { success: false, error: result }
  }

  return { success: true }
})

ipcMain.handle('ticket:listPrinters', async () => {
  const printers = await (mainWindow?.webContents.getPrintersAsync() || Promise.resolve([]))
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName,
    isDefault: printer.isDefault
  }))
})

ipcMain.handle('ticket:getConfig', async () => getTicketPrinterConfig())

ipcMain.handle('ticket:setConfig', async (_, config: TicketPrinterConfig) => {
  return setTicketPrinterConfig(config)
})

ipcMain.handle('ticket:getPrinter', async () => {
  const config = await getTicketPrinterConfig()
  return { ticketPrinterName: config.ticketPrinterName }
})

ipcMain.handle('ticket:setPrinter', async (_, printerName: string | null) => {
  const currentConfig = await getTicketPrinterConfig()
  return setTicketPrinterConfig({
    ...currentConfig,
    mode: 'system',
    ticketPrinterName: printerName
  })
})

ipcMain.handle('ticket:print', async (_, payload: TicketPrintPayload) => {
  const config = await getTicketPrinterConfig()
  const validation = validateTicketPrinterConfig(config)

  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  if (config.mode === 'network') {
    try {
      await printNetworkTicket({
        host: config.networkHost,
        port: config.networkPort,
        payload
      })

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : error }
    }
  }

  const ticketWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true
    }
  })

  try {
    await ticketWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildTicketHtml(payload))}`)

    await new Promise<void>((resolve, reject) => {
      ticketWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: config.ticketPrinterName || undefined,
          pageSize: {
            width: 58000,
            height: 200000
          },
          margins: {
            marginType: 'none'
          }
        },
        (success, failureReason) => {
          if (!success) {
            reject(new Error(failureReason || 'Print failed'))
            return
          }

          resolve()
        }
      )
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : error }
  } finally {
    ticketWindow.close()
  }
})

ipcMain.handle(
  'print:pdf',
  async (
    _,
    data: {
      html?: string
      defaultFileName?: string
      landscape?: boolean
    }
  ) => {
    if (!data?.html || typeof data.html !== 'string') {
      return { success: false, error: 'Invalid PDF payload' }
    }

    const saveDialogOptions = {
      title: 'Guardar PDF',
      defaultPath: data.defaultFileName || `lucy3000_${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const saveResult = mainWindow
      ? await dialog.showSaveDialog(mainWindow, saveDialogOptions)
      : await dialog.showSaveDialog(saveDialogOptions)

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true }
    }

    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true
      }
    })

    try {
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(data.html)}`)

      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        landscape: Boolean(data.landscape),
        pageSize: 'A4'
      })

      await fsPromises.writeFile(saveResult.filePath, pdfBuffer)

      return {
        success: true,
        filePath: saveResult.filePath
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      pdfWindow.close()
    }
  }
)
