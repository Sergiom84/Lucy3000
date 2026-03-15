import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import { pathToFileURL } from 'url'
import { ChildProcess, spawn } from 'child_process'
import { printNetworkTicket } from './escpos'
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
const CLIENT_ASSET_FOLDERS = {
  photos: 'photos',
  consents: 'consents'
} as const

type ClientAssetKind = keyof typeof CLIENT_ASSET_FOLDERS

type StoredClientAsset = {
  id: string
  kind: ClientAssetKind
  fileName: string
  originalName: string
  addedAt: string
}

type ClientAssetManifest = {
  version: 1
  primaryPhotoId: string | null
  assets: StoredClientAsset[]
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const getUserDataDir = () => app.getPath('userData')
const getLegacyClientsRootDir = () => path.join(getUserDataDir(), 'clients')
const getDocumentsClientsRootDir = () =>
  path.join(app.getPath('documents'), 'Lucy3000', 'Documentos', 'Clientes')

const ensureDir = async (targetPath: string) => {
  await fsPromises.mkdir(targetPath, { recursive: true })
}

const findExistingClientDir = async (rootDir: string, clientId: string) => {
  try {
    const entries = await fsPromises.readdir(rootDir, { withFileTypes: true })
    const match = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(`-${clientId}`))
    return match ? path.join(rootDir, match.name) : null
  } catch {
    return null
  }
}

const getClientBaseDir = async (clientId: string, clientName: string) => {
  const folderName = `${slugify(clientName || 'cliente') || 'cliente'}-${clientId}`
  const documentsRoot = getDocumentsClientsRootDir()
  const legacyRoot = getLegacyClientsRootDir()

  await ensureDir(documentsRoot)

  const existingDocumentsDir = await findExistingClientDir(documentsRoot, clientId)
  const existingLegacyDir = await findExistingClientDir(legacyRoot, clientId)
  const preferredDir = existingDocumentsDir || path.join(documentsRoot, folderName)

  if (!existingDocumentsDir && existingLegacyDir) {
    await fsPromises.cp(existingLegacyDir, preferredDir, { recursive: true, force: false })
  }

  const baseDir = preferredDir
  await ensureDir(baseDir)
  await ensureDir(path.join(baseDir, CLIENT_ASSET_FOLDERS.photos))
  await ensureDir(path.join(baseDir, CLIENT_ASSET_FOLDERS.consents))
  return baseDir
}

const getClientManifestPath = (baseDir: string) => path.join(baseDir, 'manifest.json')
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

const loadClientManifest = async (baseDir: string): Promise<ClientAssetManifest> => {
  const manifestPath = getClientManifestPath(baseDir)
  const manifest = await readJsonFile<ClientAssetManifest>(manifestPath, {
    version: 1,
    primaryPhotoId: null,
    assets: []
  })

  if (!Array.isArray(manifest.assets)) {
    return {
      version: 1,
      primaryPhotoId: null,
      assets: []
    }
  }

  return manifest
}

const saveClientManifest = async (baseDir: string, manifest: ClientAssetManifest) => {
  await writeJsonFile(getClientManifestPath(baseDir), manifest)
}

const buildAssetResponse = async (clientId: string, clientName: string) => {
  const baseDir = await getClientBaseDir(clientId, clientName)
  const manifest = await loadClientManifest(baseDir)

  const assets = manifest.assets.map((asset) => {
    const absolutePath = path.join(baseDir, CLIENT_ASSET_FOLDERS[asset.kind], asset.fileName)
    return {
      ...asset,
      absolutePath,
      previewUrl: pathToFileURL(absolutePath).toString(),
      isPrimaryPhoto: asset.id === manifest.primaryPhotoId
    }
  })

  return {
    baseDir,
    primaryPhotoUrl: assets.find((asset) => asset.isPrimaryPhoto)?.previewUrl || null,
    photos: assets.filter((asset) => asset.kind === 'photos'),
    consents: assets.filter((asset) => asset.kind === 'consents')
  }
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

  await waitForBackendReady(20, 500, ['localhost', '127.0.0.1'])
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    await ensureBackendReady()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend startup failed'
    console.error(`[backend] ${message}`)
    dialog.showErrorBox('Backend unavailable', message)
    app.quit()
    return
  }

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

ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:getPath', (_, name: string) => app.getPath(name as AppPathName))
ipcMain.handle('app:quit', () => {
  app.quit()
})

ipcMain.handle('backup:create', async () => {
  try {
    return { success: true, message: 'Backup creado exitosamente' }
  } catch (error) {
    return { success: false, message: 'Error al crear backup' }
  }
})

ipcMain.handle('clientAssets:list', async (_, payload: { clientId: string; clientName: string }) => {
  return buildAssetResponse(payload.clientId, payload.clientName)
})

ipcMain.handle(
  'clientAssets:import',
  async (_, payload: { clientId: string; clientName: string; kind: ClientAssetKind }) => {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'webp']
    const dialogResult = await dialog.showOpenDialog(mainWindow!, {
      title: payload.kind === 'photos' ? 'Seleccionar fotos del cliente' : 'Seleccionar consentimientos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imágenes', extensions: imageExtensions }]
    })

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return buildAssetResponse(payload.clientId, payload.clientName)
    }

    const baseDir = await getClientBaseDir(payload.clientId, payload.clientName)
    const manifest = await loadClientManifest(baseDir)
    const targetDir = path.join(baseDir, CLIENT_ASSET_FOLDERS[payload.kind])

    for (const sourcePath of dialogResult.filePaths) {
      const parsed = path.parse(sourcePath)
      const storedName = `${Date.now()}-${randomUUID()}${parsed.ext.toLowerCase()}`
      const targetPath = path.join(targetDir, storedName)

      await fsPromises.copyFile(sourcePath, targetPath)
      manifest.assets.push({
        id: randomUUID(),
        kind: payload.kind,
        fileName: storedName,
        originalName: parsed.base,
        addedAt: new Date().toISOString()
      })
    }

    if (!manifest.primaryPhotoId && payload.kind === 'photos') {
      manifest.primaryPhotoId = manifest.assets.find((asset) => asset.kind === 'photos')?.id || null
    }

    await saveClientManifest(baseDir, manifest)
    return buildAssetResponse(payload.clientId, payload.clientName)
  }
)

ipcMain.handle(
  'clientAssets:delete',
  async (_, payload: { clientId: string; clientName: string; assetId: string }) => {
    const baseDir = await getClientBaseDir(payload.clientId, payload.clientName)
    const manifest = await loadClientManifest(baseDir)
    const asset = manifest.assets.find((item) => item.id === payload.assetId)

    if (!asset) {
      return buildAssetResponse(payload.clientId, payload.clientName)
    }

    const absolutePath = path.join(baseDir, CLIENT_ASSET_FOLDERS[asset.kind], asset.fileName)
    await fsPromises.rm(absolutePath, { force: true })
    manifest.assets = manifest.assets.filter((item) => item.id !== payload.assetId)

    if (manifest.primaryPhotoId === payload.assetId) {
      manifest.primaryPhotoId = manifest.assets.find((item) => item.kind === 'photos')?.id || null
    }

    await saveClientManifest(baseDir, manifest)
    return buildAssetResponse(payload.clientId, payload.clientName)
  }
)

ipcMain.handle(
  'clientAssets:setPrimaryPhoto',
  async (_, payload: { clientId: string; clientName: string; assetId: string }) => {
    const baseDir = await getClientBaseDir(payload.clientId, payload.clientName)
    const manifest = await loadClientManifest(baseDir)
    const photo = manifest.assets.find((item) => item.id === payload.assetId && item.kind === 'photos')

    if (photo) {
      manifest.primaryPhotoId = photo.id
      await saveClientManifest(baseDir, manifest)
    }

    return buildAssetResponse(payload.clientId, payload.clientName)
  }
)

ipcMain.handle('clientAssets:openFolder', async (_, payload: { clientId: string; clientName: string }) => {
  const baseDir = await getClientBaseDir(payload.clientId, payload.clientName)
  await shell.openPath(baseDir)
  return { success: true, baseDir }
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
