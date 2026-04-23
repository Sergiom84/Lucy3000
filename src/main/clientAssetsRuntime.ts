import path from 'path'
import { promises as fsPromises } from 'fs'
import { dialog, protocol, shell } from 'electron'
import {
  CLIENT_ASSET_PROTOCOL,
  createClientAssetManager,
  getContentTypeFromPath
} from './clientAssets'
import { getDocumentsClientsRootDir, getLegacyClientsRootDir } from './runtimePaths'
import { getMainWindow } from './windowState'
import type {
  ClientAssetsImportPayload,
  ClientAssetsOwnerPayload,
  ClientAssetSelectionPayload,
  ClientAssetSetPhotoCategoryPayload,
  ImportGeneratedClientAssetsPayload
} from '../shared/clientAssets'

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

export type ClientAssetsRuntime = ReturnType<typeof createClientAssetsRuntime>

export const createClientAssetsRuntime = () => {
  const handleProtocolRequest = async (request: { url: string }) => {
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
      return new Response(new Uint8Array(fileBuffer), {
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

  const registerProtocolHandler = () => {
    protocol.handle(CLIENT_ASSET_PROTOCOL, handleProtocolRequest)
  }

  const showOpenDialog = (options: Electron.OpenDialogOptions) => {
    const parentWindow = getMainWindow()
    return parentWindow ? dialog.showOpenDialog(parentWindow, options) : dialog.showOpenDialog(options)
  }

  return {
    registerProtocolHandler,
    listAssets: (payload: ClientAssetsOwnerPayload) =>
      clientAssetManager.buildAssetResponse(payload.clientId, payload.clientName),
    importAssets: async (payload: ClientAssetsImportPayload) => {
      const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif']
      const consentExtensions = [...imageExtensions, 'pdf']
      const dialogTitleByKind = {
        photos: 'Seleccionar fotos del cliente',
        consents: 'Seleccionar consentimientos',
        documents: 'Seleccionar documentos del cliente'
      } satisfies Record<ClientAssetsImportPayload['kind'], string>
      const dialogFilters =
        payload.kind === 'photos'
          ? [{ name: 'Imágenes', extensions: imageExtensions }]
          : payload.kind === 'consents'
            ? [{ name: 'Consentimientos', extensions: consentExtensions }]
            : undefined
      const dialogResult = await showOpenDialog({
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
    },
    importGeneratedAssets: (payload: ImportGeneratedClientAssetsPayload) =>
      clientAssetManager.importGeneratedClientAssets(payload.assets || []),
    deleteAsset: (payload: ClientAssetSelectionPayload) =>
      clientAssetManager.deleteClientAsset(payload.clientId, payload.clientName, payload.assetId),
    setPrimaryPhoto: (payload: ClientAssetSelectionPayload) =>
      clientAssetManager.setPrimaryClientPhoto(payload.clientId, payload.clientName, payload.assetId),
    setPhotoCategory: (payload: ClientAssetSetPhotoCategoryPayload) =>
      clientAssetManager.setClientPhotoCategory(payload),
    openFolder: async (payload: ClientAssetsOwnerPayload) => {
      const baseDir = await clientAssetManager.getClientBaseDir(payload.clientId, payload.clientName)
      await shell.openPath(baseDir)
      return { success: true, baseDir }
    },
    openAsset: async (payload: ClientAssetSelectionPayload) => {
      const absolutePath = await clientAssetManager.getAssetAbsolutePath(
        payload.clientId,
        payload.clientName,
        payload.assetId
      )

      if (!absolutePath) {
        return { success: false, error: 'Archivo no encontrado' }
      }

      const result = await shell.openPath(absolutePath)
      if (result) {
        return { success: false, error: result }
      }

      return { success: true }
    }
  }
}
