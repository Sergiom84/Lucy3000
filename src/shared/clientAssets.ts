export const CLIENT_ASSET_PROTOCOL = 'lucyasset'

export const CLIENT_ASSET_DIRECTORIES = {
  photos: 'photos',
  consents: 'consents',
  documents: 'documents'
} as const

export const PHOTO_CATEGORIES = [
  { id: 'before', label: 'Antes', directory: 'before' },
  { id: 'after', label: 'Después', directory: 'after' },
  { id: 'treatments', label: 'Tratamientos', directory: 'treatments' },
  { id: 'unclassified', label: 'Sin clasificar', directory: 'unclassified' }
] as const

export type PhotoCategoryId = (typeof PHOTO_CATEGORIES)[number]['id']
export type ClientAssetKind = keyof typeof CLIENT_ASSET_DIRECTORIES
export type ClientAssetPreviewType = 'image' | 'pdf' | 'file'

export type StoredClientAsset = {
  id: string
  kind: ClientAssetKind
  fileName: string
  originalName: string
  addedAt: string
  takenAt?: string | null
  photoCategory?: PhotoCategoryId | null
}

export type ClientAssetManifest = {
  version: 3
  primaryPhotoId: string | null
  assets: StoredClientAsset[]
}

export type ClientAsset = StoredClientAsset & {
  absolutePath: string
  previewUrl: string
  previewType: ClientAssetPreviewType
  isPrimaryPhoto: boolean
}

export type ClientPhotoCategorySummary = {
  id: PhotoCategoryId
  label: string
  photoCount: number
  coverUrl: string | null
}

export type ClientAssetsResponse = {
  baseDir: string
  primaryPhotoUrl: string | null
  photoCategories: ClientPhotoCategorySummary[]
  photos: ClientAsset[]
  consents: ClientAsset[]
  documents: ClientAsset[]
}

export type ClientAssetsOwnerPayload = {
  clientId: string
  clientName: string
}

export type ClientAssetsImportPayload = ClientAssetsOwnerPayload & {
  kind: ClientAssetKind
  photoCategory?: PhotoCategoryId | null
}

export type ClientAssetSelectionPayload = ClientAssetsOwnerPayload & {
  assetId: string
}

export type ClientAssetSetPhotoCategoryPayload = ClientAssetSelectionPayload & {
  photoCategory: PhotoCategoryId | null
}

export type ClientAssetOpenFolderResult = {
  success: boolean
  baseDir: string
}

export type ClientAssetOpenAssetResult = {
  success: boolean
  error?: string
}

export type ImportGeneratedClientAssetInput = {
  clientId: string
  clientName: string
  kind: ClientAssetKind
  fileName: string
  originalName: string
  contentBase64: string
  mimeType?: string | null
  takenAt?: string | null
  photoCategory?: PhotoCategoryId | null
}

export type ImportGeneratedClientAssetsPayload = {
  assets: ImportGeneratedClientAssetInput[]
}

export type ImportGeneratedClientAssetsResult = {
  importedCount: number
  clients: Array<{
    clientId: string
    clientName: string
    baseDir: string
  }>
}
