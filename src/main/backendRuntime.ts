import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import net from 'net'
import { promises as fsPromises } from 'fs'
import { ChildProcess, spawn } from 'child_process'
import { ensureDir, findExistingPath } from './fileUtils'
import {
  getDatabasePath,
  getProductionDbPath,
  getRuntimeJwtSecretPath,
  getUserDataDir
} from './runtimePaths'
import { writeMainLog } from './logging'

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

const loadProductionEnv = (): Record<string, string> => {
  const envPaths = [
    path.join(path.dirname(process.execPath), '.env'),
    path.join(path.dirname(process.execPath), 'resources', '.env'),
    path.join(getUserDataDir(), '.env')
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
        const value = trimmed.slice(eqIndex + 1).trim().replace(/^[\"']|[\"']$/g, '')
        vars[key] = value
      }
      return vars
    }
  }

  writeMainLog('warn', 'No .env file found for production')
  return {}
}

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

export type BackendRuntime = ReturnType<typeof createBackendRuntime>

export const createBackendRuntime = (options: {
  isDevelopment: boolean
  backendPort: string
}) => {
  let backendProcess: ChildProcess | null = null

  const isBackendPortOccupied = async () => {
    const port = Number(options.backendPort)

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

  const waitForBackendReady = async (
    attempts: number,
    delayMs: number,
    hosts: string[] = ['localhost'],
    canContinue: () => boolean = () => true
  ) => {
    for (let index = 0; index < attempts; index += 1) {
      if (!canContinue()) {
        return false
      }

      for (const host of hosts) {
        try {
          const response = await fetch(`http://${host}:${options.backendPort}/health`)
          if (response.ok && canContinue()) {
            return true
          }
        } catch {
          // Backend still booting.
        }
      }

      await wait(delayMs)
    }

    return false
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

  const startBackendInProduction = async () => {
    if (options.isDevelopment || backendProcess) return

    if (await isBackendPortOccupied()) {
      throw new Error(
        `El puerto ${options.backendPort} ya esta en uso. Cierra cualquier otra instancia de Lucy3000 o backend de desarrollo antes de abrir el instalador.`
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
      backendPort: options.backendPort,
      dbPath
    })

    const child = spawn(process.execPath, [backendEntry], {
      env: {
        ...process.env,
        ...productionEnv,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        NODE_PATH: getPackagedNodePath(),
        PORT: options.backendPort,
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
      throw new Error(`Packaged backend did not respond on http://localhost:${options.backendPort}/health`)
    }
  }

  const ensureBackendReady = async () => {
    if (options.isDevelopment) {
      const ready = await waitForBackendReady(120, 500, ['localhost', '127.0.0.1'])
      if (!ready) {
        throw new Error(`Development backend did not respond on http://localhost:${options.backendPort}/health`)
      }

      return
    }

    await startBackendInProduction()
  }

  const runWithPackagedBackendPaused = async <T>(
    taskLabel: string,
    runOptions: { restartOnSuccess: boolean },
    task: () => Promise<T>
  ) => {
    const shouldPauseBackend = !options.isDevelopment && Boolean(backendProcess && backendProcess.exitCode === null)

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
      if (!taskCompleted || runOptions.restartOnSuccess) {
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

  return {
    ensureBackendReady,
    stopBackendGracefully,
    runWithPackagedBackendPaused,
    hasManagedProcess: () => !options.isDevelopment && Boolean(backendProcess && backendProcess.exitCode === null),
    getDatabasePath: () => getDatabasePath(options.isDevelopment)
  }
}
