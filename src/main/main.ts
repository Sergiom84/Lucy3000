import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { promises as fsPromises } from 'fs'
import { ChildProcess, spawn } from 'child_process'
import { printNetworkTicket } from './escpos'
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

const isDevelopment = process.env.NODE_ENV === 'development'
const backendPort = process.env.PORT || '3001'

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
  hosts: string[] = ['localhost']
) => {
  for (let i = 0; i < attempts; i += 1) {
    for (const host of hosts) {
      try {
        const response = await fetch(`http://${host}:${backendPort}/health`)
        if (response.ok) {
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

const getBundledSeedDbPath = () =>
  findExistingPath([
    path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'prisma', 'lucy3000.db'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'prisma', 'lucy3000.db'),
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
    backendProcess = null
  })

  const ready = await waitForBackendReady(40, 500, ['localhost', '127.0.0.1'])
  if (!ready) {
    stopBackend()
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
      contextIsolation: true
    },
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
    show: false
  })

  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
  }

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2) {
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
  app.setAppLogsPath()
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
  stopBackend()
})

app.on('child-process-gone', (_event, details) => {
  writeMainLog('error', 'Child process gone', sanitizeLogValue(details))
})

ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:getPath', (_, name: string) => app.getPath(name as AppPathName))
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
    if (!fs.existsSync(dbPath)) {
      return { success: false, message: 'Base de datos no encontrada' }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupName = `lucy3000-backup-${timestamp}.db`
    const backupPath = path.join(targetDir, backupName)

    await fsPromises.copyFile(dbPath, backupPath)

    // Keep only last 10 backups
    const files = await fsPromises.readdir(targetDir)
    const backupFiles = files
      .filter(f => f.startsWith('lucy3000-backup-') && f.endsWith('.db'))
      .sort()
    if (backupFiles.length > 10) {
      for (const old of backupFiles.slice(0, backupFiles.length - 10)) {
        await fsPromises.unlink(path.join(targetDir, old)).catch(() => {})
      }
    }

    return { success: true, message: `Backup creado: ${backupName}`, path: backupPath }
  } catch (error) {
    return { success: false, message: `Error al crear backup: ${error instanceof Error ? error.message : error}` }
  }
})

ipcMain.handle('backup:restore', async () => {
  try {
    const dialogResult = await dialog.showOpenDialog(mainWindow!, {
      title: 'Seleccionar backup para restaurar',
      properties: ['openFile'],
      filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }]
    })

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { success: false, message: 'Restauracion cancelada' }
    }

    const sourcePath = dialogResult.filePaths[0]
    const dbPath = getDbPath()

    // Create a safety backup before restoring
    const safetyPath = dbPath + '.pre-restore'
    if (fs.existsSync(dbPath)) {
      await fsPromises.copyFile(dbPath, safetyPath)
    }

    await fsPromises.copyFile(sourcePath, dbPath)

    return { success: true, message: 'Backup restaurado. Reinicia la aplicacion para aplicar los cambios.' }
  } catch (error) {
    return { success: false, message: `Error al restaurar: ${error instanceof Error ? error.message : error}` }
  }
})

ipcMain.handle('backup:list', async () => {
  try {
    const config = await getBackupConfig()
    await ensureDir(config.folder)

    const files = await fsPromises.readdir(config.folder)
    const backups = []

    for (const file of files) {
      if (!file.startsWith('lucy3000-backup-') || !file.endsWith('.db')) continue
      const filePath = path.join(config.folder, file)
      const stats = await fsPromises.stat(filePath)
      backups.push({
        name: file,
        date: stats.mtime.toISOString(),
        size: stats.size
      })
    }

    backups.sort((a, b) => b.date.localeCompare(a.date))

    return { success: true, backups }
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
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupName = `lucy3000-auto-backup-${timestamp}.db`
      await fsPromises.copyFile(dbPath, path.join(config.folder, backupName))

      // Keep only last 4 auto backups
      const files = await fsPromises.readdir(config.folder)
      const autoBackups = files.filter(f => f.startsWith('lucy3000-auto-backup-') && f.endsWith('.db')).sort()
      if (autoBackups.length > 4) {
        for (const old of autoBackups.slice(0, autoBackups.length - 4)) {
          await fsPromises.unlink(path.join(config.folder, old)).catch(() => {})
        }
      }

      writeMainLog('info', 'Automatic backup created', { backupName, folder: config.folder })
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

ipcMain.handle('print:pdf', async (_, data: TicketPrintPayload) => {
  return { success: false, error: 'Use ticket:print instead', data }
})
