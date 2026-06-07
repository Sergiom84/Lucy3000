/**
 * Web-mode client asset API.
 * Used only when running in browser (no Electron).
 * Mirrors the shape of desktop.ts functions so ClientAssetExplorer
 * can call either without knowing the runtime.
 */

import { useAuthStore } from '../stores/authStore'
import type {
  ClientAssetKind,
  ClientAssetsResponse,
  PhotoCategoryId
} from './desktop'

const authHeaders = (): HeadersInit => {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || ''

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

/** Compress an image file client-side using Canvas. */
async function compressImage(
  file: File,
  maxWidth = 1800,
  quality = 0.8
): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height, 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        quality
      )
    )
    const name = file.name.replace(/\.[^.]+$/, '.jpg')
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    // Compression failed — use original file
    return file
  }
}

export const webListClientAssets = async (
  clientId: string
): Promise<ClientAssetsResponse> => {
  const res = await fetch(`${apiBase}/api/clients/${clientId}/assets`, {
    headers: authHeaders()
  })
  return handleResponse<ClientAssetsResponse>(res)
}

export const webUploadClientAsset = async (
  clientId: string,
  file: File,
  kind: ClientAssetKind,
  options?: { photoCategory?: PhotoCategoryId | null }
): Promise<ClientAssetsResponse> => {
  const processedFile = kind === 'photos' ? await compressImage(file) : file

  const form = new FormData()
  form.append('file', processedFile, processedFile.name)
  form.append('kind', kind)
  if (kind === 'photos' && options?.photoCategory) {
    form.append('photoCategory', options.photoCategory)
  }

  const res = await fetch(`${apiBase}/api/clients/${clientId}/assets`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  })
  return handleResponse<ClientAssetsResponse>(res)
}

export const webDeleteClientAsset = async (
  clientId: string,
  assetId: string
): Promise<ClientAssetsResponse> => {
  const res = await fetch(`${apiBase}/api/clients/${clientId}/assets/${assetId}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  return handleResponse<ClientAssetsResponse>(res)
}

export const webSetPrimaryClientPhoto = async (
  clientId: string,
  assetId: string
): Promise<ClientAssetsResponse> => {
  const res = await fetch(
    `${apiBase}/api/clients/${clientId}/assets/${assetId}/primary`,
    { method: 'PATCH', headers: authHeaders() }
  )
  return handleResponse<ClientAssetsResponse>(res)
}

export const webSetClientPhotoCategory = async (
  clientId: string,
  assetId: string,
  photoCategory: PhotoCategoryId | null
): Promise<ClientAssetsResponse> => {
  const res = await fetch(
    `${apiBase}/api/clients/${clientId}/assets/${assetId}/category`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoCategory })
    }
  )
  return handleResponse<ClientAssetsResponse>(res)
}
