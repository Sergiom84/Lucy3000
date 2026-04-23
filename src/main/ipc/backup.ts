import { ipcMain } from 'electron'
import type { BackupConfig } from '../../shared/electron'
import type { BackupRuntime } from '../backupRuntime'

export const registerBackupIpcHandlers = (backupRuntime: BackupRuntime) => {
  ipcMain.handle('backup:create', async (_, destFolder?: string) => backupRuntime.createBackup(destFolder))
  ipcMain.handle('backup:restore', async () => backupRuntime.restoreBackup())
  ipcMain.handle('backup:list', async () => backupRuntime.listBackups())
  ipcMain.handle('backup:selectFolder', async () => backupRuntime.selectBackupFolder())
  ipcMain.handle('backup:getConfig', async () => backupRuntime.getBackupConfig())
  ipcMain.handle('backup:setConfig', async (_, config: BackupConfig) => {
    await backupRuntime.setBackupConfig(config)
    return { success: true }
  })
}
