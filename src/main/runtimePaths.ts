import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { RuntimeDataPaths } from '../shared/electron'
import { findExistingPath, resolveFileDatabasePath } from './fileUtils'

export const applyDevelopmentRuntimePaths = (isDevelopment: boolean) => {
  if (!isDevelopment) {
    return
  }

  const developmentRuntimeRoot = path.join(app.getPath('appData'), 'lucy3000-accounting-dev')
  app.setPath('userData', developmentRuntimeRoot)
  app.setPath('sessionData', path.join(developmentRuntimeRoot, 'session'))
}

export const getUserDataDir = () => app.getPath('userData')
export const getLegacyClientsRootDir = () => path.join(getUserDataDir(), 'clients')
export const getDocumentsClientsRootDir = () =>
  path.join(app.getPath('documents'), 'Lucy3000', 'Documentos', 'Clientes')
export const getPrinterConfigPath = () => path.join(getUserDataDir(), 'device-config.json')
export const getBackupConfigPath = () => path.join(getUserDataDir(), 'backup-config.json')
export const getDefaultBackupDir = () => path.join(getUserDataDir(), 'backups')
export const getRuntimeJwtSecretPath = () => path.join(getUserDataDir(), 'jwt-secret.txt')
export const getProductionDbPath = () => path.join(getUserDataDir(), 'lucy3000.db')

export const getDevelopmentDbPath = () => {
  const projectSchemaDir = path.join(process.cwd(), 'prisma')

  return (
    findExistingPath([
      resolveFileDatabasePath(process.env.DATABASE_URL, projectSchemaDir),
      path.join(projectSchemaDir, 'prisma', 'lucy3000.db'),
      path.join(projectSchemaDir, 'lucy3000.db')
    ]) || path.join(projectSchemaDir, 'prisma', 'lucy3000.db')
  )
}

export const getDatabasePath = (isDevelopment: boolean) =>
  isDevelopment ? getDevelopmentDbPath() : getProductionDbPath()

export const buildRuntimeDataPaths = (isDevelopment: boolean): RuntimeDataPaths => {
  const userDataPath = getUserDataDir()
  const dbPath = getDatabasePath(isDevelopment)
  const logsPath = app.getPath('logs')

  return {
    userDataPath,
    dbPath,
    logsPath,
    dbExists: fs.existsSync(dbPath)
  }
}
