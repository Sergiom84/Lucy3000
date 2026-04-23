import { ipcMain } from 'electron'
import type {
  ClientAssetsImportPayload,
  ClientAssetsOwnerPayload,
  ClientAssetSelectionPayload,
  ClientAssetSetPhotoCategoryPayload,
  ImportGeneratedClientAssetsPayload
} from '../../shared/clientAssets'
import type { ClientAssetsRuntime } from '../clientAssetsRuntime'

export const registerClientAssetIpcHandlers = (clientAssetsRuntime: ClientAssetsRuntime) => {
  ipcMain.handle('clientAssets:list', async (_, payload: ClientAssetsOwnerPayload) =>
    clientAssetsRuntime.listAssets(payload)
  )
  ipcMain.handle('clientAssets:import', async (_, payload: ClientAssetsImportPayload) =>
    clientAssetsRuntime.importAssets(payload)
  )
  ipcMain.handle('clientAssets:importGenerated', async (_, payload: ImportGeneratedClientAssetsPayload) =>
    clientAssetsRuntime.importGeneratedAssets(payload)
  )
  ipcMain.handle('clientAssets:delete', async (_, payload: ClientAssetSelectionPayload) =>
    clientAssetsRuntime.deleteAsset(payload)
  )
  ipcMain.handle('clientAssets:setPrimaryPhoto', async (_, payload: ClientAssetSelectionPayload) =>
    clientAssetsRuntime.setPrimaryPhoto(payload)
  )
  ipcMain.handle('clientAssets:setPhotoCategory', async (_, payload: ClientAssetSetPhotoCategoryPayload) =>
    clientAssetsRuntime.setPhotoCategory(payload)
  )
  ipcMain.handle('clientAssets:openFolder', async (_, payload: ClientAssetsOwnerPayload) =>
    clientAssetsRuntime.openFolder(payload)
  )
  ipcMain.handle('clientAssets:openAsset', async (_, payload: ClientAssetSelectionPayload) =>
    clientAssetsRuntime.openAsset(payload)
  )
}
