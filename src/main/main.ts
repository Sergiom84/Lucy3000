import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import { ChildProcess, spawn } from 'child_process'
import { printNetworkTicket } from './escpos'
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
  protocol.handle(CLIENT_ASSET_PROTOCOL, handleClientAssetProtocol)

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
