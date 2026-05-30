import fs from 'fs'
import path from 'path'
import { promises as fsPromises } from 'fs'
import type {
  DatabaseConfigurePayload,
  DatabaseConfigureResult,
  DatabaseConfigMode,
  DatabaseConfigStatus,
  DatabaseUrlKind
} from '../shared/electron'
import { getProductionDbPath, getUserDataDir } from './runtimePaths'
import { writeMainLog } from './logging'

const DATABASE_MODE_ENV_KEY = 'LUCY3000_DATABASE_MODE'
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:'])

type EnvReadResult = {
  filePath: string | null
  values: Record<string, string>
}

const parseEnvContent = (content: string) => {
  const values: Record<string, string> = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
    if (key) {
      values[key] = value
    }
  }

  return values
}

const quoteEnvValue = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

const updateEnvContent = (content: string, updates: Record<string, string>) => {
  const remainingUpdates = new Map(Object.entries(updates))
  const lines = content ? content.split(/\r?\n/) : []
  const nextLines = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Z0-9_]+)(\s*=).*/i)
    if (!match) {
      return line
    }

    const key = match[2]
    const update = remainingUpdates.get(key)
    if (update === undefined) {
      return line
    }

    remainingUpdates.delete(key)
    return `${key}=${quoteEnvValue(update)}`
  })

  for (const [key, value] of remainingUpdates) {
    nextLines.push(`${key}=${quoteEnvValue(value)}`)
  }

  return `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`
}

const classifyDatabaseUrl = (databaseUrl?: string | null): DatabaseUrlKind => {
  const normalized = databaseUrl?.trim()
  if (!normalized) {
    return 'missing'
  }

  if (normalized.startsWith('file:')) {
    return 'sqlite'
  }

  try {
    const parsed = new URL(normalized)
    return POSTGRES_PROTOCOLS.has(parsed.protocol) ? 'postgresql' : 'unknown'
  } catch {
    return 'unknown'
  }
}

const inferDatabaseMode = (
  databaseUrl: string | undefined,
  explicitMode?: string
): DatabaseConfigMode | null => {
  if (explicitMode === 'local' || explicitMode === 'shared') {
    return explicitMode
  }

  if (classifyDatabaseUrl(databaseUrl) === 'sqlite') {
    return 'local'
  }

  if (!databaseUrl || classifyDatabaseUrl(databaseUrl) !== 'postgresql') {
    return null
  }

  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase()
    return hostname.includes('supabase') || hostname.includes('pooler.supabase.com') ? 'shared' : 'local'
  } catch {
    return null
  }
}

const normalizePostgresDatabaseUrl = (databaseUrl: string, mode: DatabaseConfigMode) => {
  const parsed = new URL(databaseUrl.trim())

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('La URL debe empezar por postgres:// o postgresql://')
  }

  if (mode === 'shared') {
    if (!parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'require')
    }
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '3')
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '20')
    }
  }

  return parsed.toString()
}

const toSqliteDatabaseUrl = (dbPath: string) => `file:${dbPath.replace(/\\/g, '/')}`

const getProductionEnvPaths = () => [
  path.join(path.dirname(process.execPath), '.env'),
  path.join(path.dirname(process.execPath), 'resources', '.env'),
  path.join(getUserDataDir(), '.env')
]

const readEnvFile = async (filePath: string) => {
  try {
    return await fsPromises.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

const readProductionEnv = (): EnvReadResult => {
  const envPaths = getProductionEnvPaths()
  let envPath: string | null = null
  const values: Record<string, string> = {}

  for (const candidate of envPaths) {
    if (!fs.existsSync(candidate)) {
      continue
    }

    envPath = candidate
    Object.assign(values, parseEnvContent(fs.readFileSync(candidate, 'utf-8')))
  }

  return { filePath: envPath, values }
}

export const createDatabaseConfigService = (options: { isDevelopment: boolean }) => {
  const getWritableEnvPath = () => path.join(getUserDataDir(), '.env')

  const getStatus = (): DatabaseConfigStatus => {
    const writableEnvPath = getWritableEnvPath()
    const legacySqlitePath = getProductionDbPath()
    const legacySqliteExists = fs.existsSync(legacySqlitePath)

    if (options.isDevelopment) {
      const databaseUrl = process.env.DATABASE_URL
      const databaseUrlKind = classifyDatabaseUrl(databaseUrl)

      return {
        configured: true,
        needsSetup: false,
        mode: inferDatabaseMode(databaseUrl, process.env[DATABASE_MODE_ENV_KEY]),
        databaseUrlKind,
        envPath: null,
        writableEnvPath,
        userDataPath: getUserDataDir(),
        legacySqlitePath,
        legacySqliteExists
      }
    }

    const productionEnv = readProductionEnv()
    const databaseUrl = productionEnv.values.DATABASE_URL || process.env.DATABASE_URL
    const databaseUrlKind = classifyDatabaseUrl(databaseUrl)
    const mode = inferDatabaseMode(databaseUrl, productionEnv.values[DATABASE_MODE_ENV_KEY])

    if (databaseUrlKind === 'postgresql' || databaseUrlKind === 'sqlite') {
      return {
        configured: true,
        needsSetup: false,
        mode,
        databaseUrlKind,
        envPath: productionEnv.filePath,
        writableEnvPath,
        userDataPath: getUserDataDir(),
        legacySqlitePath,
        legacySqliteExists
      }
    }

    const reason =
      databaseUrlKind === 'missing'
        ? 'No hay DATABASE_URL configurada para arrancar el backend.'
        : 'La DATABASE_URL configurada no es una URL PostgreSQL/Supabase valida ni una base SQLite local.'

    return {
      configured: false,
      needsSetup: true,
      mode,
      databaseUrlKind,
      envPath: productionEnv.filePath,
      writableEnvPath,
      userDataPath: getUserDataDir(),
      legacySqlitePath,
      legacySqliteExists,
      reason
    }
  }

  const configure = async (payload: DatabaseConfigurePayload): Promise<DatabaseConfigureResult> => {
    try {
      const mode = payload.mode
      if (mode !== 'local' && mode !== 'shared') {
        return { success: false, requiresRelaunch: false, error: 'Selecciona un modo de cliente valido.' }
      }

      const rawDatabaseUrl = (payload.databaseUrl || '').trim()
      if (mode === 'shared' && !rawDatabaseUrl) {
        return {
          success: false,
          requiresRelaunch: false,
          error: 'Pega la DATABASE_URL de Supabase para configurar un cliente compartido.'
        }
      }

      const normalizedDatabaseUrl =
        mode === 'local'
          ? toSqliteDatabaseUrl(getProductionDbPath())
          : normalizePostgresDatabaseUrl(rawDatabaseUrl, mode)
      const envPath = getWritableEnvPath()
      const currentContent = await readEnvFile(envPath)
      const currentValues = parseEnvContent(currentContent)

      const nextContent = updateEnvContent(currentContent, {
        ...currentValues,
        DATABASE_URL: normalizedDatabaseUrl,
        NODE_ENV: 'production',
        PORT: currentValues.PORT || process.env.PORT || '3001',
        [DATABASE_MODE_ENV_KEY]: mode
      })

      await fsPromises.mkdir(path.dirname(envPath), { recursive: true })
      await fsPromises.writeFile(envPath, nextContent, 'utf-8')

      writeMainLog('info', 'Database configuration saved', {
        envPath,
        mode,
        databaseUrlKind: mode === 'local' ? 'sqlite' : 'postgresql'
      })

      return {
        success: true,
        requiresRelaunch: true,
        envPath,
        mode
      }
    } catch (error) {
      writeMainLog('error', 'Failed to save database configuration', error)
      return {
        success: false,
        requiresRelaunch: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  return {
    getStatus,
    configure
  }
}

export type DatabaseConfigService = ReturnType<typeof createDatabaseConfigService>
