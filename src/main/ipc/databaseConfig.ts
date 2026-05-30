import { ipcMain } from 'electron'
import type { DatabaseConfigurePayload } from '../../shared/electron'
import type { DatabaseConfigService } from '../databaseConfig'

export const registerDatabaseConfigIpcHandlers = (databaseConfigService: DatabaseConfigService) => {
  ipcMain.handle('databaseConfig:getStatus', () => databaseConfigService.getStatus())
  ipcMain.handle('databaseConfig:configure', (_event, payload: DatabaseConfigurePayload) =>
    databaseConfigService.configure(payload)
  )
}
