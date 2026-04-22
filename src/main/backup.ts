import path from 'path'
import { promises as fsPromises } from 'fs'

export const MANUAL_BACKUP_PREFIX = 'lucy3000-backup-'
export const AUTO_BACKUP_PREFIX = 'lucy3000-auto-backup-'
export const PRE_RESTORE_BACKUP_PREFIX = 'lucy3000-pre-restore-'

const BACKUP_FORMAT_VERSION = 1
const BACKUP_MANIFEST_FILE = 'backup-manifest.json'
const SQLITE_DB_FILE_NAME = 'lucy3000.db'
const SQLITE_WAL_FILE_NAME = `${SQLITE_DB_FILE_NAME}-wal`
const SQLITE_SHM_FILE_NAME = `${SQLITE_DB_FILE_NAME}-shm`

const BACKUP_DB_RELATIVE_PATH = `database/${SQLITE_DB_FILE_NAME}`
const BACKUP_WAL_RELATIVE_PATH = `database/${SQLITE_WAL_FILE_NAME}`
const BACKUP_SHM_RELATIVE_PATH = `database/${SQLITE_SHM_FILE_NAME}`
const BACKUP_DOCUMENTS_CLIENTS_RELATIVE_PATH = 'client-assets/documents-clients'
const BACKUP_LEGACY_CLIENTS_RELATIVE_PATH = 'client-assets/legacy-clients'
const BACKUP_PREFIXES = [MANUAL_BACKUP_PREFIX, AUTO_BACKUP_PREFIX]

type BackupManifest = {
  version: number
  createdAt: string
  db: {
    relativePath: string
    walRelativePath: string | null
    shmRelativePath: string | null
  }
  clientAssets: {
    documentsRelativePath: string
    legacyRelativePath: string
  }
}

export type BackupEntry = {
  name: string
  date: string
  size: number
}

export type CreateBackupSnapshotInput = {
  targetDir: string
  dbPath: string
  documentsClientsRootDir: string
  legacyClientsRootDir: string
  prefix: string
  createdAt?: Date
}

export type BackupSnapshotResult = {
  backupName: string
  backupPath: string
  createdAt: string
  includesClientAssets: boolean
}

export type ResolvedBackupSource = {
  format: 'legacy-db' | 'full-directory'
  selectedPath: string
  dbSourcePath: string
  walSourcePath: string | null
  shmSourcePath: string | null
  documentsClientsSourcePath: string | null
  legacyClientsSourcePath: string | null
  includesClientAssets: boolean
}

const ensureDir = async (targetPath: string) => {
  await fsPromises.mkdir(targetPath, { recursive: true })
}

const pathExists = async (targetPath: string) => {
  try {
    await fsPromises.access(targetPath)
    return true
  } catch {
    return false
  }
}

const isDirectory = async (targetPath: string) => {
  try {
    return (await fsPromises.stat(targetPath)).isDirectory()
  } catch {
    return false
  }
}

const removeIfExists = async (targetPath: string) => {
  await fsPromises.rm(targetPath, { recursive: true, force: true })
}

const resolveBackupRelativePath = (backupRootPath: string, relativePath: string) =>
  path.join(backupRootPath, ...relativePath.split('/'))

const writeJsonFile = async (filePath: string, data: unknown) => {
  await ensureDir(path.dirname(filePath))
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

const formatBackupTimestamp = (createdAt: Date) =>
  createdAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)

const buildUniqueBackupPath = async (targetDir: string, prefix: string, createdAt: Date) => {
  const baseName = `${prefix}${formatBackupTimestamp(createdAt)}`
  let backupName = baseName
  let backupPath = path.join(targetDir, backupName)
  let duplicateCounter = 2

  while (await pathExists(backupPath)) {
    backupName = `${baseName}-${duplicateCounter}`
    backupPath = path.join(targetDir, backupName)
    duplicateCounter += 1
  }

  return { backupName, backupPath }
}

const isPathEqualOrInside = (targetPath: string, rootPath: string) => {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(targetPath))
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

const validateBackupDestination = (backupPath: string, protectedPaths: string[]) => {
  for (const protectedPath of protectedPaths) {
    if (!protectedPath) continue
    if (isPathEqualOrInside(backupPath, protectedPath)) {
      throw new Error(`La carpeta de backup no puede estar dentro de ${protectedPath}`)
    }
  }
}

const copyOptionalFile = async (sourcePath: string, targetPath: string) => {
  if (!(await pathExists(sourcePath))) {
    return false
  }

  await ensureDir(path.dirname(targetPath))
  await fsPromises.copyFile(sourcePath, targetPath)
  return true
}

const copyDirectorySnapshot = async (sourcePath: string, targetPath: string) => {
  await removeIfExists(targetPath)
  await ensureDir(targetPath)

  if (!(await isDirectory(sourcePath))) {
    return false
  }

  await fsPromises.cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    errorOnExist: false
  })

  return true
}

const getDirectorySize = async (directoryPath: string): Promise<number> => {
  if (!(await isDirectory(directoryPath))) {
    return 0
  }

  const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true })
  let total = 0

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath)
      continue
    }

    total += (await fsPromises.stat(entryPath)).size
  }

  return total
}

const getEntrySize = async (entryPath: string) => {
  const stats = await fsPromises.stat(entryPath)
  if (stats.isDirectory()) {
    return getDirectorySize(entryPath)
  }

  return stats.size
}

const isManagedBackupEntryName = (name: string) => BACKUP_PREFIXES.some((prefix) => name.startsWith(prefix))

const isManagedBackupEntry = (entry: { name: string; isDirectory: () => boolean }) =>
  isManagedBackupEntryName(entry.name) && (entry.isDirectory() || entry.name.endsWith('.db'))

const validateManifest = (manifest: BackupManifest | null) => {
  if (!manifest || manifest.version !== BACKUP_FORMAT_VERSION) {
    throw new Error('El backup seleccionado no tiene un formato valido')
  }

  if (!manifest.db?.relativePath || !manifest.clientAssets?.documentsRelativePath || !manifest.clientAssets?.legacyRelativePath) {
    throw new Error('El backup seleccionado esta incompleto')
  }

  return manifest
}

export const createBackupSnapshot = async ({
  targetDir,
  dbPath,
  documentsClientsRootDir,
  legacyClientsRootDir,
  prefix,
  createdAt = new Date()
}: CreateBackupSnapshotInput): Promise<BackupSnapshotResult> => {
  if (!(await pathExists(dbPath))) {
    throw new Error('Base de datos no encontrada')
  }

  await ensureDir(targetDir)
  const { backupName, backupPath } = await buildUniqueBackupPath(targetDir, prefix, createdAt)
  validateBackupDestination(backupPath, [documentsClientsRootDir, legacyClientsRootDir])
  await ensureDir(backupPath)

  try {
    const dbBackupPath = resolveBackupRelativePath(backupPath, BACKUP_DB_RELATIVE_PATH)
    const walBackupPath = resolveBackupRelativePath(backupPath, BACKUP_WAL_RELATIVE_PATH)
    const shmBackupPath = resolveBackupRelativePath(backupPath, BACKUP_SHM_RELATIVE_PATH)
    const documentsBackupPath = resolveBackupRelativePath(backupPath, BACKUP_DOCUMENTS_CLIENTS_RELATIVE_PATH)
    const legacyBackupPath = resolveBackupRelativePath(backupPath, BACKUP_LEGACY_CLIENTS_RELATIVE_PATH)

    await ensureDir(path.dirname(dbBackupPath))
    await fsPromises.copyFile(dbPath, dbBackupPath)

    const walIncluded = await copyOptionalFile(`${dbPath}-wal`, walBackupPath)
    const shmIncluded = await copyOptionalFile(`${dbPath}-shm`, shmBackupPath)
    const documentsIncluded = await copyDirectorySnapshot(documentsClientsRootDir, documentsBackupPath)
    const legacyIncluded = await copyDirectorySnapshot(legacyClientsRootDir, legacyBackupPath)

    const manifest: BackupManifest = {
      version: BACKUP_FORMAT_VERSION,
      createdAt: createdAt.toISOString(),
      db: {
        relativePath: BACKUP_DB_RELATIVE_PATH,
        walRelativePath: walIncluded ? BACKUP_WAL_RELATIVE_PATH : null,
        shmRelativePath: shmIncluded ? BACKUP_SHM_RELATIVE_PATH : null
      },
      clientAssets: {
        documentsRelativePath: BACKUP_DOCUMENTS_CLIENTS_RELATIVE_PATH,
        legacyRelativePath: BACKUP_LEGACY_CLIENTS_RELATIVE_PATH
      }
    }

    await writeJsonFile(path.join(backupPath, BACKUP_MANIFEST_FILE), manifest)

    return {
      backupName,
      backupPath,
      createdAt: manifest.createdAt,
      includesClientAssets: documentsIncluded || legacyIncluded
    }
  } catch (error) {
    await removeIfExists(backupPath)
    throw error
  }
}

export const resolveBackupSource = async (selectedPath: string): Promise<ResolvedBackupSource> => {
  const stats = await fsPromises.stat(selectedPath).catch(() => null)

  if (!stats) {
    throw new Error('No se encontro el backup seleccionado')
  }

  if (stats.isFile()) {
    if (path.extname(selectedPath).toLowerCase() !== '.db') {
      throw new Error('Selecciona un archivo .db valido')
    }

    const walSourcePath = (await pathExists(`${selectedPath}-wal`)) ? `${selectedPath}-wal` : null
    const shmSourcePath = (await pathExists(`${selectedPath}-shm`)) ? `${selectedPath}-shm` : null

    return {
      format: 'legacy-db',
      selectedPath,
      dbSourcePath: selectedPath,
      walSourcePath,
      shmSourcePath,
      documentsClientsSourcePath: null,
      legacyClientsSourcePath: null,
      includesClientAssets: false
    }
  }

  if (!stats.isDirectory()) {
    throw new Error('Selecciona una carpeta de backup valida')
  }

  const manifest = validateManifest(await readJsonFile<BackupManifest>(path.join(selectedPath, BACKUP_MANIFEST_FILE)))
  const dbSourcePath = resolveBackupRelativePath(selectedPath, manifest.db.relativePath)
  const walSourcePath = manifest.db.walRelativePath
    ? resolveBackupRelativePath(selectedPath, manifest.db.walRelativePath)
    : null
  const shmSourcePath = manifest.db.shmRelativePath
    ? resolveBackupRelativePath(selectedPath, manifest.db.shmRelativePath)
    : null
  const documentsClientsSourcePath = resolveBackupRelativePath(selectedPath, manifest.clientAssets.documentsRelativePath)
  const legacyClientsSourcePath = resolveBackupRelativePath(selectedPath, manifest.clientAssets.legacyRelativePath)

  if (!(await pathExists(dbSourcePath))) {
    throw new Error('El backup seleccionado no contiene la base de datos')
  }

  if (!(await isDirectory(documentsClientsSourcePath)) || !(await isDirectory(legacyClientsSourcePath))) {
    throw new Error('El backup seleccionado no contiene el snapshot completo de assets')
  }

  return {
    format: 'full-directory',
    selectedPath,
    dbSourcePath,
    walSourcePath: walSourcePath && (await pathExists(walSourcePath)) ? walSourcePath : null,
    shmSourcePath: shmSourcePath && (await pathExists(shmSourcePath)) ? shmSourcePath : null,
    documentsClientsSourcePath,
    legacyClientsSourcePath,
    includesClientAssets: true
  }
}

export const listBackupEntries = async (targetDir: string): Promise<BackupEntry[]> => {
  const entries = await fsPromises.readdir(targetDir, { withFileTypes: true })
  const backups = await Promise.all(
    entries
      .filter(isManagedBackupEntry)
      .map(async (entry) => {
        const entryPath = path.join(targetDir, entry.name)
        const stats = await fsPromises.stat(entryPath)
        return {
          name: entry.name,
          date: stats.mtime.toISOString(),
          size: await getEntrySize(entryPath)
        }
      })
  )

  return backups.sort((left, right) => right.date.localeCompare(left.date))
}

export const pruneBackupEntries = async (targetDir: string, prefix: string, keepLimit: number) => {
  if (keepLimit < 1) {
    return
  }

  const entries = await fsPromises.readdir(targetDir, { withFileTypes: true })
  const matchingEntries = entries
    .filter((entry) => entry.name.startsWith(prefix) && (entry.isDirectory() || entry.name.endsWith('.db')))
    .sort((left, right) => left.name.localeCompare(right.name))

  if (matchingEntries.length <= keepLimit) {
    return
  }

  for (const staleEntry of matchingEntries.slice(0, matchingEntries.length - keepLimit)) {
    await removeIfExists(path.join(targetDir, staleEntry.name))
  }
}

export const restoreSqliteSnapshot = async (
  source: Pick<ResolvedBackupSource, 'dbSourcePath' | 'walSourcePath' | 'shmSourcePath'>,
  targetDbPath: string
) => {
  await ensureDir(path.dirname(targetDbPath))
  await fsPromises.copyFile(source.dbSourcePath, targetDbPath)

  if (source.walSourcePath) {
    await fsPromises.copyFile(source.walSourcePath, `${targetDbPath}-wal`)
  } else {
    await removeIfExists(`${targetDbPath}-wal`)
  }

  if (source.shmSourcePath) {
    await fsPromises.copyFile(source.shmSourcePath, `${targetDbPath}-shm`)
  } else {
    await removeIfExists(`${targetDbPath}-shm`)
  }
}

export const restoreDirectorySnapshot = async (sourcePath: string, targetPath: string) => {
  await removeIfExists(targetPath)
  await ensureDir(path.dirname(targetPath))
  await fsPromises.cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    errorOnExist: false
  })
}
