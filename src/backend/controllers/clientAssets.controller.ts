import path from 'path'
import { randomUUID } from 'crypto'
import { Response } from 'express'
import type { AuthRequest } from '../middleware/auth.middleware'
import { prisma } from '../db'
import {
  ensureBucket,
  uploadFile,
  getSignedUrls,
  deleteFiles
} from '../services/supabaseStorage.service'
// Types inlined here to stay within rootDir (tsconfig.backend.json: rootDir=src/backend)
type ClientAssetKind = 'photos' | 'consents' | 'documents'
type PhotoCategoryId = 'before' | 'after' | 'treatments' | 'unclassified'
type ClientAssetPreviewType = 'image' | 'pdf' | 'file'

type ClientAsset = {
  id: string
  kind: ClientAssetKind
  fileName: string
  originalName: string
  addedAt: string
  takenAt?: string | null
  photoCategory?: PhotoCategoryId | null
  absolutePath: string
  previewUrl: string
  previewType: ClientAssetPreviewType
  isPrimaryPhoto: boolean
}

type ClientPhotoCategorySummary = {
  id: PhotoCategoryId
  label: string
  photoCount: number
  coverUrl: string | null
}

type ClientAssetsResponse = {
  baseDir: string
  primaryPhotoUrl: string | null
  photoCategories: ClientPhotoCategorySummary[]
  photos: ClientAsset[]
  consents: ClientAsset[]
  documents: ClientAsset[]
}

const PHOTO_CATEGORIES = [
  { id: 'before' as PhotoCategoryId, label: 'Antes' },
  { id: 'after' as PhotoCategoryId, label: 'Después' },
  { id: 'treatments' as PhotoCategoryId, label: 'Tratamientos' },
  { id: 'unclassified' as PhotoCategoryId, label: 'Sin clasificar' }
] as const

let bucketReady = false
const ensureBucketOnce = async () => {
  if (bucketReady) return
  await ensureBucket()
  bucketReady = true
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])

const MAX_ASSET_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB

// El mimetype lo declara el cliente y es falsificable: contrastar con la firma
// real del fichero (magic bytes) antes de aceptarlo.
const matchesMagicBytes = (buffer: Buffer, mime: string): boolean => {
  if (buffer.length < 12) return false

  const startsWith = (bytes: number[], offset = 0) =>
    bytes.every((byte, index) => buffer[offset + index] === byte)

  switch (mime) {
    case 'image/jpeg':
      return startsWith([0xff, 0xd8, 0xff])
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47])
    case 'image/gif':
      return startsWith([0x47, 0x49, 0x46, 0x38])
    case 'image/webp':
      return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)
    case 'image/heic':
    case 'image/heif':
      // ISO-BMFF: 'ftyp' en offset 4
      return startsWith([0x66, 0x74, 0x79, 0x70], 4)
    case 'application/pdf':
      return startsWith([0x25, 0x50, 0x44, 0x46]) // %PDF
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith([0x50, 0x4b]) // ZIP (docx/xlsx)
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return startsWith([0xd0, 0xcf, 0x11, 0xe0]) // OLE2 (doc/xls)
    default:
      return false
  }
}

const mimeToPreviewType = (mime: string): ClientAsset['previewType'] => {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  return 'file'
}

const buildStorageKey = (tenantId: string, clientId: string, ext: string) =>
  `${tenantId}/${clientId}/${randomUUID()}${ext}`

type DbClientFile = {
  id: string
  kind: string
  originalName: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  photoCategory: string | null
  isPrimary: boolean
  takenAt: Date | null
  addedAt: Date
}

const toClientAsset = (
  file: DbClientFile,
  signedUrl: string
): ClientAsset => ({
  id: file.id,
  kind: file.kind as ClientAssetKind,
  fileName: path.basename(file.storageKey),
  originalName: file.originalName,
  addedAt: file.addedAt.toISOString(),
  takenAt: file.takenAt?.toISOString() ?? null,
  photoCategory: (file.photoCategory as PhotoCategoryId) ?? null,
  absolutePath: file.storageKey,
  previewUrl: signedUrl,
  previewType: mimeToPreviewType(file.mimeType),
  isPrimaryPhoto: file.isPrimary
})

const buildResponse = async (
  files: DbClientFile[]
): Promise<ClientAssetsResponse> => {
  const keys = files.map((f) => f.storageKey)
  const signedUrls = await getSignedUrls(keys)

  const photos = files
    .filter((f) => f.kind === 'photos')
    .map((f) => toClientAsset(f, signedUrls.get(f.storageKey) ?? ''))

  const consents = files
    .filter((f) => f.kind === 'consents')
    .map((f) => toClientAsset(f, signedUrls.get(f.storageKey) ?? ''))

  const documents = files
    .filter((f) => f.kind === 'documents')
    .map((f) => toClientAsset(f, signedUrls.get(f.storageKey) ?? ''))

  const primaryFile = files.find((f) => f.isPrimary && f.kind === 'photos')
  const primaryPhotoUrl = primaryFile
    ? (signedUrls.get(primaryFile.storageKey) ?? null)
    : null

  const photoCategories: ClientPhotoCategorySummary[] = PHOTO_CATEGORIES.map((cat) => {
    const catPhotos = photos.filter(
      (p) => (p.photoCategory ?? 'unclassified') === cat.id
    )
    const cover = catPhotos[0] ?? null
    return {
      id: cat.id,
      label: cat.label,
      photoCount: catPhotos.length,
      coverUrl: cover?.previewUrl ?? null
    }
  })

  return {
    baseDir: '',
    primaryPhotoUrl,
    photoCategories,
    photos,
    consents,
    documents
  }
}

/** GET /api/clients/:id/assets */
export const listClientAssets = async (req: AuthRequest, res: Response) => {
  try {
    const files = await (prisma as any).clientFile.findMany({
      where: { clientId: req.params.id },
      orderBy: { addedAt: 'desc' }
    })
    const response = await buildResponse(files)
    res.json(response)
  } catch (error: any) {
    console.error('listClientAssets error', error)
    res.status(500).json({ error: error.message || 'Error al cargar archivos' })
  }
}

/** POST /api/clients/:id/assets */
export const uploadClientAsset = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' })
    }

    const { kind, photoCategory, takenAt } = req.body as {
      kind?: string
      photoCategory?: string
      takenAt?: string
    }

    if (!kind || !['photos', 'consents', 'documents'].includes(kind)) {
      return res.status(400).json({ error: 'Tipo de archivo inválido' })
    }

    if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: `Tipo de archivo no permitido: ${req.file.mimetype}` })
    }

    if (!matchesMagicBytes(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: 'El contenido del archivo no coincide con su tipo declarado' })
    }

    if (req.file.size > MAX_ASSET_SIZE_BYTES) {
      return res.status(400).json({
        error: `El archivo supera el límite de ${MAX_ASSET_SIZE_BYTES / 1024 / 1024}MB`
      })
    }

    await ensureBucketOnce()

    const ext = path.extname(req.file.originalname).toLowerCase() || '.bin'
    const storageKey = buildStorageKey(
      req.user!.tenantId,
      req.params.id,
      ext
    )

    await uploadFile(storageKey, req.file.buffer, req.file.mimetype)

    await (prisma as any).clientFile.create({
      data: {
        tenantId: req.user!.tenantId,
        clientId: req.params.id,
        kind,
        originalName: req.file.originalname,
        storageKey,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        photoCategory: kind === 'photos' ? (photoCategory || 'unclassified') : null,
        isPrimary: false,
        takenAt: takenAt ? new Date(takenAt) : null
      }
    })

    const files = await (prisma as any).clientFile.findMany({
      where: { clientId: req.params.id },
      orderBy: { addedAt: 'desc' }
    })

    const response = await buildResponse(files)
    res.status(201).json(response)
  } catch (error: any) {
    console.error('uploadClientAsset error', error)
    res.status(500).json({ error: error.message || 'Error al subir el archivo' })
  }
}

/** DELETE /api/clients/:id/assets/:assetId */
export const deleteClientAsset = async (req: AuthRequest, res: Response) => {
  try {
    const db = prisma
    const file = await (prisma as any).clientFile.findFirst({
      where: { id: req.params.assetId, clientId: req.params.id }
    })

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' })
    }

    await deleteFiles([file.storageKey])
    await (prisma as any).clientFile.delete({ where: { id: file.id } })

    const files = await (prisma as any).clientFile.findMany({
      where: { clientId: req.params.id },
      orderBy: { addedAt: 'desc' }
    })

    const response = await buildResponse(files)
    res.json(response)
  } catch (error: any) {
    console.error('deleteClientAsset error', error)
    res.status(500).json({ error: error.message || 'Error al eliminar el archivo' })
  }
}

/** PATCH /api/clients/:id/assets/:assetId/primary */
export const setPrimaryClientAsset = async (req: AuthRequest, res: Response) => {
  try {
    // ClientFile no tiene unique compuesto (id, tenantId): verificar pertenencia
    // antes de escribir, igual que en deleteClientAsset.
    const file = await (prisma as any).clientFile.findFirst({
      where: { id: req.params.assetId, clientId: req.params.id }
    })

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' })
    }

    // Clear existing primary
    await (prisma as any).clientFile.updateMany({
      where: { clientId: req.params.id, kind: 'photos' },
      data: { isPrimary: false }
    })

    // Set new primary
    await (prisma as any).clientFile.update({
      where: { id: file.id },
      data: { isPrimary: true }
    })

    const files = await (prisma as any).clientFile.findMany({
      where: { clientId: req.params.id },
      orderBy: { addedAt: 'desc' }
    })

    const response = await buildResponse(files)
    res.json(response)
  } catch (error: any) {
    console.error('setPrimaryClientAsset error', error)
    res.status(500).json({ error: error.message || 'Error al actualizar la foto principal' })
  }
}

/** PATCH /api/clients/:id/assets/:assetId/category */
export const setClientAssetCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { photoCategory } = req.body as { photoCategory: string | null }

    const file = await (prisma as any).clientFile.findFirst({
      where: { id: req.params.assetId, clientId: req.params.id }
    })

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' })
    }

    await (prisma as any).clientFile.update({
      where: { id: file.id },
      data: { photoCategory: photoCategory ?? null }
    })

    const files = await (prisma as any).clientFile.findMany({
      where: { clientId: req.params.id },
      orderBy: { addedAt: 'desc' }
    })

    const response = await buildResponse(files)
    res.json(response)
  } catch (error: any) {
    console.error('setClientAssetCategory error', error)
    res.status(500).json({ error: error.message || 'Error al mover el archivo' })
  }
}
