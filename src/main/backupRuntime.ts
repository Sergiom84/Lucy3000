import fs from 'fs'
import { dialog } from 'electron'
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
import { ensureDir, readJsonFile, writeJsonFile } from './fileUtils'
import {
  getBackupConfigPath,
  getDatabasePath,
  getDefaultBackupDir,
  getDocumentsClientsRootDir,
  getLegacyClientsRootDir,
  getUserDataDir
} from './runtimePaths'
import { getMainWindow } from './windowState'
import { writeMainLog } from './logging'
import type {
  BackupConfig,
  BackupCreateResult,
  BackupListResult,
  BackupRestoreResult,
  SelectFolderResult
} from '../shared/electron'
import type { BackendRuntime } from './backendRuntime'

export type BackupRuntime = ReturnType<typeof createBackupRuntime>

export const createBackupRuntime = (options: {
  isDevelopment: boolean
  backendRuntime: Pick<BackendRuntime, 'runWithPackagedBackendPaused'>
}) => {
  let autoBackupTimer: ReturnType<typeof setInterval> | null = null

  const getBackupConfig = async (): Promise<BackupConfig> => {
    const defaults = { folder: getDefaultBackupDir(), autoEnabled: true, cronExpression: '0 3 * * 0' }
    return readJsonFile(getBackupConfigPath(), defaults)
  }

  const selectBackupRestoreSource = async () => {
    const parentWindow = getMainWindow()
    const showMessageBox = (messageBoxOptions: Electron.MessageBoxOptions) =>
      parentWindow ? dialog.showMessageBox(parentWindow, messageBoxOptions) : dialog.showMessageBox(messageBoxOptions)
    const showOpenDialog = (openDialogOptions: Electron.OpenDialogOptions) =>
      parentWindow ? dialog.showOpenDialog(parentWindow, openDialogOptions) : dialog.showOpenDialog(openDialogOptions)

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

  const createBackup = async (destFolder?: string): Promise<BackupCreateResult> => {
    try {
      const config = await getBackupConfig()
      const targetDir = destFolder || config.folder
      await ensureDir(targetDir)

      const dbPath = getDatabasePath(options.isDevelopment)
      const snapshot = await options.backendRuntime.runWithPackagedBackendPaused(
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
      return {
        success: false,
        message: `Error al crear backup: ${error instanceof Error ? error.message : error}`
      }
    }
  }

  const restoreBackup = async (): Promise<BackupRestoreResult> => {
    try {
      const sourcePath = await selectBackupRestoreSource()
      if (!sourcePath) {
        return { success: false, message: 'Restauracion cancelada' }
      }

      const backupSource = await resolveBackupSource(sourcePath)
      const dbPath = getDatabasePath(options.isDevelopment)

      writeMainLog('info', 'Starting backup restore', {
        sourcePath,
        dbPath,
        isDevelopment: options.isDevelopment,
        backupFormat: backupSource.format,
        includesClientAssets: backupSource.includesClientAssets
      })

      const safetySnapshot = await options.backendRuntime.runWithPackagedBackendPaused(
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
        requiresRelaunch: !options.isDevelopment
      })

      const successMessage = backupSource.includesClientAssets
        ? options.isDevelopment
          ? 'Backup completo restaurado. Reinicia el entorno de desarrollo para aplicar los cambios.'
          : 'Backup completo restaurado. La aplicacion se reiniciara para aplicar los cambios.'
        : options.isDevelopment
          ? 'Backup de base de datos restaurado. Los assets locales del cliente no se han modificado. Reinicia el entorno de desarrollo para aplicar los cambios.'
          : 'Backup de base de datos restaurado. Los assets locales del cliente no se han modificado. La aplicacion se reiniciara para aplicar los cambios.'

      return {
        success: true,
        message: successMessage,
        requiresRelaunch: !options.isDevelopment
      }
    } catch (error) {
      writeMainLog('error', 'Backup restore failed', error)
      return {
        success: false,
        message: `Error al restaurar: ${error instanceof Error ? error.message : error}`
      }
    }
  }

  const listBackups = async (): Promise<BackupListResult> => {
    try {
      const config = await getBackupConfig()
      await ensureDir(config.folder)

      return { success: true, backups: await listBackupEntries(config.folder) }
    } catch {
      return { success: true, backups: [] }
    }
  }

  const selectBackupFolder = async (): Promise<SelectFolderResult> => {
    const parentWindow = getMainWindow()
    const dialogResult = parentWindow
      ? await dialog.showOpenDialog(parentWindow, {
          title: 'Seleccionar carpeta de backups',
          properties: ['openDirectory']
        })
      : await dialog.showOpenDialog({
          title: 'Seleccionar carpeta de backups',
          properties: ['openDirectory']
        })

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { canceled: true }
    }

    return { canceled: false, folder: dialogResult.filePaths[0] }
  }

  const setupAutoBackup = (config: BackupConfig) => {
    if (autoBackupTimer) {
      clearInterval(autoBackupTimer)
      autoBackupTimer = null
    }

    if (!config.autoEnabled) return

    const weekMs = 7 * 24 * 60 * 60 * 1000
    autoBackupTimer = setInterval(async () => {
      try {
        const dbPath = getDatabasePath(options.isDevelopment)
        if (!fs.existsSync(dbPath)) return

        await ensureDir(config.folder)
        const snapshot = await options.backendRuntime.runWithPackagedBackendPaused(
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
    }, weekMs)
  }

  const setBackupConfig = async (config: BackupConfig) => {
    await writeJsonFile(getBackupConfigPath(), config)
    setupAutoBackup(config)
    return config
  }

  const initializeAutoBackup = async () => {
    const config = await getBackupConfig()
    setupAutoBackup(config)
    return config
  }

  const dispose = () => {
    if (autoBackupTimer) {
      clearInterval(autoBackupTimer)
      autoBackupTimer = null
    }
  }

  return {
    createBackup,
    restoreBackup,
    listBackups,
    selectBackupFolder,
    getBackupConfig,
    setBackupConfig,
    initializeAutoBackup,
    dispose
  }
}
