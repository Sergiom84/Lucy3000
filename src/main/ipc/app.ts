import path from 'path'
import { app, ipcMain, shell } from 'electron'
import type { AppPathName } from '../../shared/electron'
import { getMainLogFilePath, writeMainLog } from '../logging'
import type { RuntimeDataService } from '../runtimeData'

export const registerAppIpcHandlers = (runtimeDataService: RuntimeDataService) => {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getPath', (_, name: AppPathName) => app.getPath(name))
  ipcMain.handle('app:getRuntimeDataPaths', () => runtimeDataService.buildRuntimeDataPaths())
  ipcMain.handle('app:openRuntimeDataFolder', () => runtimeDataService.openRuntimeDataFolder())
  ipcMain.handle('app:resetRuntimeData', () => runtimeDataService.performRuntimeDataReset())
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
}
