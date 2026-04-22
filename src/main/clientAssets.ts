import { randomUUID } from 'crypto'
import path from 'path'
import { promises as fsPromises } from 'fs'

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

type ManagerOptions = {
  getDocumentsClientsRootDir: () => string
  getLegacyClientsRootDir: () => string
  buildPreviewUrl: (absolutePath: string) => string
}

type ImportClientAssetsInput = {
  clientId: string
  clientName: string
  sourcePaths: string[]
  kind: ClientAssetKind
  photoCategory?: PhotoCategoryId | null
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

export type ImportGeneratedClientAssetsResult = {
  importedCount: number
  clients: Array<{
    clientId: string
    clientName: string
    baseDir: string
  }>
}

type SetPhotoCategoryInput = {
  clientId: string
  clientName: string
  assetId: string
  photoCategory: PhotoCategoryId | null
}

const PHOTO_CATEGORY_SET = new Set<PhotoCategoryId>(PHOTO_CATEGORIES.map((item) => item.id))
const PHOTO_CATEGORY_DIRECTORY_MAP = Object.fromEntries(
  PHOTO_CATEGORIES.map((item) => [item.id, item.directory])
) as Record<PhotoCategoryId, string>
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

const normalizeToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')

const isClientAssetKind = (value: unknown): value is ClientAssetKind =>
  value === 'photos' || value === 'consents' || value === 'documents'

export const isPhotoCategoryId = (value: unknown): value is PhotoCategoryId =>
  typeof value === 'string' && PHOTO_CATEGORY_SET.has(value as PhotoCategoryId)

export const getPhotoCategoryLabel = (photoCategory: PhotoCategoryId) =>
  PHOTO_CATEGORIES.find((item) => item.id === photoCategory)?.label || 'Sin clasificar'

export const inferClientAssetPreviewType = (fileName: string): ClientAssetPreviewType => {
  const ext = path.extname(fileName).toLowerCase()
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  return 'file'
}

export const getContentTypeFromPath = (absolutePath: string) => {
  const ext = path.extname(absolutePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}

const toAssetTimestamp = (asset: Pick<StoredClientAsset, 'addedAt' | 'takenAt'>) => {
  const rawValue = asset.takenAt || asset.addedAt
  const parsed = new Date(rawValue).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const sortAssetsByMostRecent = <T extends Pick<StoredClientAsset, 'addedAt' | 'takenAt'>>(assets: T[]) =>
  [...assets].sort((a, b) => toAssetTimestamp(b) - toAssetTimestamp(a))

export const pickPrimaryPhotoId = (
  assets: Array<Pick<StoredClientAsset, 'id' | 'kind'>>,
  currentPrimaryPhotoId: string | null
) => {
  const photos = assets.filter((asset) => asset.kind === 'photos')
  if (currentPrimaryPhotoId && photos.some((asset) => asset.id === currentPrimaryPhotoId)) {
    return currentPrimaryPhotoId
  }

  return photos[0]?.id || null
}

export const mapLegacyPhotoFolderNameToCategory = (folderName: string): PhotoCategoryId => {
  const normalized = normalizeToken(folderName)
  if (!normalized) return 'unclassified'
  if (normalized.includes('antes') || normalized.includes('before')) return 'before'
  if (normalized.includes('despues') || normalized.includes('after')) return 'after'
  if (normalized.includes('tratamiento') || normalized.includes('treatment')) return 'treatments'
  return 'unclassified'
}

const normalizeLegacyFolderMap = (rawPhotoFolders: unknown) => {
  const folderMap = new Map<string, PhotoCategoryId>()
  if (!Array.isArray(rawPhotoFolders)) {
    return folderMap
  }

  rawPhotoFolders.forEach((folder) => {
    if (!isRecord(folder) || typeof folder.id !== 'string' || typeof folder.name !== 'string') {
      return
    }

    folderMap.set(folder.id, mapLegacyPhotoFolderNameToCategory(folder.name))
  })

  return folderMap
}

const normalizeStoredClientAsset = (
  asset: unknown,
  legacyFolderMap: Map<string, PhotoCategoryId>
): StoredClientAsset | null => {
  if (!isRecord(asset)) {
    return null
  }

  if (
    typeof asset.id !== 'string' ||
    !isClientAssetKind(asset.kind) ||
    typeof asset.fileName !== 'string' ||
    typeof asset.originalName !== 'string' ||
    typeof asset.addedAt !== 'string'
  ) {
    return null
  }

  const normalizedAsset: StoredClientAsset = {
    id: asset.id,
    kind: asset.kind,
    fileName: asset.fileName,
    originalName: asset.originalName,
    addedAt: asset.addedAt,
    takenAt: typeof asset.takenAt === 'string' ? asset.takenAt : asset.addedAt
  }

  if (asset.kind === 'photos') {
    if (isPhotoCategoryId(asset.photoCategory)) {
      normalizedAsset.photoCategory = asset.photoCategory
    } else if (typeof asset.folderId === 'string' && legacyFolderMap.has(asset.folderId)) {
      normalizedAsset.photoCategory = legacyFolderMap.get(asset.folderId) || 'unclassified'
    } else {
      normalizedAsset.photoCategory = 'unclassified'
    }
  }

  return normalizedAsset
}

export const normalizeClientAssetManifest = (rawManifest: unknown): ClientAssetManifest => {
  const source = isRecord(rawManifest) ? rawManifest : {}
  const legacyFolderMap = normalizeLegacyFolderMap(source.photoFolders)
  const rawAssets = Array.isArray(source.assets) ? source.assets : []
  const assets = rawAssets
    .map((asset) => normalizeStoredClientAsset(asset, legacyFolderMap))
    .filter((asset): asset is StoredClientAsset => Boolean(asset))

  const primaryPhotoId =
    typeof source.primaryPhotoId === 'string' ? pickPrimaryPhotoId(assets, source.primaryPhotoId) : pickPrimaryPhotoId(assets, null)

  return {
    version: 3,
    primaryPhotoId,
    assets
  }
}

const shouldRewriteManifest = (rawManifest: unknown, normalizedManifest: ClientAssetManifest) => {
  const source = isRecord(rawManifest) ? rawManifest : null
  if (!source) return true
  if (source.version !== 3) return true
  if (Array.isArray(source.photoFolders)) return true

  const rawAssets = Array.isArray(source.assets) ? source.assets : []
  if (rawAssets.length !== normalizedManifest.assets.length) return true

  if (source.primaryPhotoId !== normalizedManifest.primaryPhotoId) return true

  return rawAssets.some((asset) => {
    if (!isRecord(asset) || !isClientAssetKind(asset.kind)) return true
    if (asset.kind === 'photos') {
      return !isPhotoCategoryId(asset.photoCategory) || 'folderId' in asset
    }
    return 'photoCategory' in asset
  })
}

export const buildPhotoCategorySummaries = (photos: ClientAsset[]): ClientPhotoCategorySummary[] =>
  PHOTO_CATEGORIES.map((category) => {
    const categoryPhotos = sortAssetsByMostRecent(photos.filter((asset) => asset.photoCategory === category.id))
    return {
      id: category.id,
      label: category.label,
      photoCount: categoryPhotos.length,
      coverUrl: categoryPhotos[0]?.previewUrl || null
    }
  })

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const ensureDir = async (targetPath: string) => {
  await fsPromises.mkdir(targetPath, { recursive: true })
}

const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

const writeJsonFile = async (filePath: string, data: unknown) => {
  await ensureDir(path.dirname(filePath))
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const moveFileSafely = async (sourcePath: string, targetPath: string) => {
  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    return false
  }

  await ensureDir(path.dirname(targetPath))

  try {
    await fsPromises.rename(sourcePath, targetPath)
  } catch (error: any) {
    if (error?.code !== 'EXDEV') {
      throw error
    }

    await fsPromises.copyFile(sourcePath, targetPath)
    await fsPromises.rm(sourcePath, { force: true })
  }

  return true
}

const isPathInside = (targetPath: string, rootPath: string) => {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const findExistingClientDir = async (rootDir: string, clientId: string) => {
  try {
    const entries = await fsPromises.readdir(rootDir, { withFileTypes: true })
    const match = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(`-${clientId}`))
    return match ? path.join(rootDir, match.name) : null
  } catch {
    return null
  }
}

const getClientManifestPath = (baseDir: string) => path.join(baseDir, 'manifest.json')

const getPhotoCategoryDirectoryPath = (baseDir: string, photoCategory: PhotoCategoryId) =>
  path.join(baseDir, CLIENT_ASSET_DIRECTORIES.photos, PHOTO_CATEGORY_DIRECTORY_MAP[photoCategory])

const ensureClientAssetStructure = async (baseDir: string) => {
  await ensureDir(baseDir)
  await Promise.all([
    ensureDir(path.join(baseDir, CLIENT_ASSET_DIRECTORIES.consents)),
    ensureDir(path.join(baseDir, CLIENT_ASSET_DIRECTORIES.documents)),
    ensureDir(path.join(baseDir, CLIENT_ASSET_DIRECTORIES.photos)),
    ...PHOTO_CATEGORIES.map((category) => ensureDir(getPhotoCategoryDirectoryPath(baseDir, category.id)))
  ])
}

const resolveStoredAssetAbsolutePath = (baseDir: string, asset: StoredClientAsset) => {
  if (asset.kind === 'photos') {
    return path.join(
      getPhotoCategoryDirectoryPath(baseDir, asset.photoCategory || 'unclassified'),
      asset.fileName
    )
  }

  return path.join(baseDir, CLIENT_ASSET_DIRECTORIES[asset.kind], asset.fileName)
}

const getLegacyPhotoCandidatePaths = (baseDir: string, asset: StoredClientAsset) => {
  const candidates = [path.join(baseDir, CLIENT_ASSET_DIRECTORIES.photos, asset.fileName)]
  PHOTO_CATEGORIES.forEach((category) => {
    candidates.push(path.join(getPhotoCategoryDirectoryPath(baseDir, category.id), asset.fileName))
  })
  return Array.from(new Set(candidates.map((candidate) => path.resolve(candidate))))
}

const migrateAssetFilesToStructuredFolders = async (baseDir: string, manifest: ClientAssetManifest) => {
  let migrated = false

  for (const asset of manifest.assets) {
    const targetPath = resolveStoredAssetAbsolutePath(baseDir, asset)
    const targetExists = await fsPromises
      .stat(targetPath)
      .then((stats) => stats.isFile())
      .catch(() => false)

    if (targetExists) {
      continue
    }

    const candidatePaths =
      asset.kind === 'photos'
        ? getLegacyPhotoCandidatePaths(baseDir, asset)
        : [path.join(baseDir, CLIENT_ASSET_DIRECTORIES[asset.kind], asset.fileName)]

    for (const candidatePath of candidatePaths) {
      const exists = await fsPromises
        .stat(candidatePath)
        .then((stats) => stats.isFile())
        .catch(() => false)

      if (!exists) {
        continue
      }

      migrated = (await moveFileSafely(candidatePath, targetPath)) || migrated
      break
    }
  }

  return migrated
}

const toClientAsset = (baseDir: string, asset: StoredClientAsset, primaryPhotoId: string | null, buildPreviewUrl: (absolutePath: string) => string): ClientAsset => {
  const absolutePath = resolveStoredAssetAbsolutePath(baseDir, asset)
  return {
    ...asset,
    photoCategory: asset.kind === 'photos' ? asset.photoCategory || 'unclassified' : null,
    absolutePath,
    previewUrl: buildPreviewUrl(absolutePath),
    previewType: inferClientAssetPreviewType(asset.fileName),
    isPrimaryPhoto: asset.kind === 'photos' && asset.id === primaryPhotoId
  }
}

export const createClientAssetManager = ({
  getDocumentsClientsRootDir,
  getLegacyClientsRootDir,
  buildPreviewUrl
}: ManagerOptions) => {
  const getClientBaseDir = async (clientId: string, clientName: string) => {
    const folderName = `${slugify(clientName || 'cliente') || 'cliente'}-${clientId}`
    const documentsRoot = getDocumentsClientsRootDir()
    const legacyRoot = getLegacyClientsRootDir()

    await ensureDir(documentsRoot)

    const existingDocumentsDir = await findExistingClientDir(documentsRoot, clientId)
    const existingLegacyDir = await findExistingClientDir(legacyRoot, clientId)
    const preferredDir = existingDocumentsDir || path.join(documentsRoot, folderName)

    if (!existingDocumentsDir && existingLegacyDir) {
      await fsPromises.cp(existingLegacyDir, preferredDir, { recursive: true, force: false }).catch(() => undefined)
    }

    await ensureClientAssetStructure(preferredDir)
    return preferredDir
  }

  const saveClientManifest = async (baseDir: string, manifest: ClientAssetManifest) => {
    await writeJsonFile(getClientManifestPath(baseDir), manifest)
  }

  const loadClientManifest = async (baseDir: string) => {
    await ensureClientAssetStructure(baseDir)
    const manifestPath = getClientManifestPath(baseDir)
    const rawManifest = await readJsonFile<unknown>(manifestPath, null)
    const normalizedManifest = normalizeClientAssetManifest(rawManifest)
    const filesMigrated = await migrateAssetFilesToStructuredFolders(baseDir, normalizedManifest)

    if (shouldRewriteManifest(rawManifest, normalizedManifest) || filesMigrated) {
      await saveClientManifest(baseDir, normalizedManifest)
    }

    return normalizedManifest
  }

  const buildAssetResponse = async (clientId: string, clientName: string): Promise<ClientAssetsResponse> => {
    const baseDir = await getClientBaseDir(clientId, clientName)
    const manifest = await loadClientManifest(baseDir)
    const assets = manifest.assets.map((asset) => toClientAsset(baseDir, asset, manifest.primaryPhotoId, buildPreviewUrl))
    const photos = assets.filter((asset) => asset.kind === 'photos')
    const consents = assets.filter((asset) => asset.kind === 'consents')
    const documents = assets.filter((asset) => asset.kind === 'documents')

    return {
      baseDir,
      primaryPhotoUrl: assets.find((asset) => asset.isPrimaryPhoto)?.previewUrl || null,
      photoCategories: buildPhotoCategorySummaries(photos),
      photos,
      consents,
      documents
    }
  }

  const importClientAssets = async ({
    clientId,
    clientName,
    sourcePaths,
    kind,
    photoCategory
  }: ImportClientAssetsInput): Promise<ClientAssetsResponse> => {
    if (!sourcePaths.length) {
      return buildAssetResponse(clientId, clientName)
    }

    const baseDir = await getClientBaseDir(clientId, clientName)
    const manifest = await loadClientManifest(baseDir)
    const resolvedPhotoCategory = kind === 'photos' && isPhotoCategoryId(photoCategory) ? photoCategory : 'unclassified'

    for (const sourcePath of sourcePaths) {
      const parsed = path.parse(sourcePath)
      const storedName = `${Date.now()}-${randomUUID()}${parsed.ext.toLowerCase()}`
      const sourceStats = await fsPromises.stat(sourcePath)
      const asset: StoredClientAsset = {
        id: randomUUID(),
        kind,
        fileName: storedName,
        originalName: parsed.base,
        addedAt: new Date().toISOString(),
        takenAt: kind === 'documents' ? null : sourceStats.mtime.toISOString(),
        ...(kind === 'photos' ? { photoCategory: resolvedPhotoCategory } : {})
      }

      const targetPath = resolveStoredAssetAbsolutePath(baseDir, asset)
      await ensureDir(path.dirname(targetPath))
      await fsPromises.copyFile(sourcePath, targetPath)
      manifest.assets.push(asset)
    }

    manifest.primaryPhotoId = pickPrimaryPhotoId(manifest.assets, manifest.primaryPhotoId)
    await saveClientManifest(baseDir, manifest)
    return buildAssetResponse(clientId, clientName)
  }

  const importGeneratedClientAssets = async (
    items: ImportGeneratedClientAssetInput[]
  ): Promise<ImportGeneratedClientAssetsResult> => {
    if (!items.length) {
      return {
        importedCount: 0,
        clients: []
      }
    }

    const groupedItems = new Map<string, ImportGeneratedClientAssetInput[]>()

    for (const item of items) {
      const key = `${item.clientId}::${item.clientName}`
      const currentItems = groupedItems.get(key) || []
      currentItems.push(item)
      groupedItems.set(key, currentItems)
    }

    const clients: ImportGeneratedClientAssetsResult['clients'] = []
    let importedCount = 0

    for (const [groupKey, groupItems] of groupedItems.entries()) {
      const [clientId, clientName] = groupKey.split('::')
      const baseDir = await getClientBaseDir(clientId, clientName)
      const manifest = await loadClientManifest(baseDir)

      for (const item of groupItems) {
        const parsed = path.parse(item.fileName)
        const storedName = `${Date.now()}-${randomUUID()}${parsed.ext.toLowerCase()}`
        const resolvedPhotoCategory =
          item.kind === 'photos' && isPhotoCategoryId(item.photoCategory) ? item.photoCategory : 'unclassified'
        const asset: StoredClientAsset = {
          id: randomUUID(),
          kind: item.kind,
          fileName: storedName,
          originalName: item.originalName || item.fileName,
          addedAt: new Date().toISOString(),
          takenAt: item.takenAt || new Date().toISOString(),
          ...(item.kind === 'photos' ? { photoCategory: resolvedPhotoCategory } : {})
        }

        const targetPath = resolveStoredAssetAbsolutePath(baseDir, asset)
        await ensureDir(path.dirname(targetPath))
        await fsPromises.writeFile(targetPath, Buffer.from(item.contentBase64, 'base64'))
        manifest.assets.push(asset)
        importedCount += 1
      }

      manifest.primaryPhotoId = pickPrimaryPhotoId(manifest.assets, manifest.primaryPhotoId)
      await saveClientManifest(baseDir, manifest)
      clients.push({ clientId, clientName, baseDir })
    }

    return {
      importedCount,
      clients
    }
  }

  const deleteClientAsset = async (clientId: string, clientName: string, assetId: string): Promise<ClientAssetsResponse> => {
    const baseDir = await getClientBaseDir(clientId, clientName)
    const manifest = await loadClientManifest(baseDir)
    const asset = manifest.assets.find((item) => item.id === assetId)

    if (!asset) {
      return buildAssetResponse(clientId, clientName)
    }

    await fsPromises.rm(resolveStoredAssetAbsolutePath(baseDir, asset), { force: true })
    manifest.assets = manifest.assets.filter((item) => item.id !== assetId)
    manifest.primaryPhotoId = pickPrimaryPhotoId(manifest.assets, manifest.primaryPhotoId === assetId ? null : manifest.primaryPhotoId)

    await saveClientManifest(baseDir, manifest)
    return buildAssetResponse(clientId, clientName)
  }

  const setPrimaryClientPhoto = async (clientId: string, clientName: string, assetId: string): Promise<ClientAssetsResponse> => {
    const baseDir = await getClientBaseDir(clientId, clientName)
    const manifest = await loadClientManifest(baseDir)
    const photo = manifest.assets.find((item) => item.id === assetId && item.kind === 'photos')

    if (photo) {
      manifest.primaryPhotoId = photo.id
      await saveClientManifest(baseDir, manifest)
    }

    return buildAssetResponse(clientId, clientName)
  }

  const setClientPhotoCategory = async ({
    clientId,
    clientName,
    assetId,
    photoCategory
  }: SetPhotoCategoryInput): Promise<ClientAssetsResponse> => {
    const baseDir = await getClientBaseDir(clientId, clientName)
    const manifest = await loadClientManifest(baseDir)
    const photo = manifest.assets.find((item) => item.id === assetId && item.kind === 'photos')

    if (!photo) {
      return buildAssetResponse(clientId, clientName)
    }

    const resolvedCategory = isPhotoCategoryId(photoCategory) ? photoCategory : 'unclassified'
    if ((photo.photoCategory || 'unclassified') !== resolvedCategory) {
      const currentPath = resolveStoredAssetAbsolutePath(baseDir, photo)
      const nextPhoto = { ...photo, photoCategory: resolvedCategory }
      const targetPath = resolveStoredAssetAbsolutePath(baseDir, nextPhoto)
      await moveFileSafely(currentPath, targetPath)
      photo.photoCategory = resolvedCategory
      manifest.primaryPhotoId = pickPrimaryPhotoId(manifest.assets, manifest.primaryPhotoId)
      await saveClientManifest(baseDir, manifest)
    }

    return buildAssetResponse(clientId, clientName)
  }

  const getAssetAbsolutePath = async (clientId: string, clientName: string, assetId: string) => {
    const baseDir = await getClientBaseDir(clientId, clientName)
    const manifest = await loadClientManifest(baseDir)
    const asset = manifest.assets.find((item) => item.id === assetId)
    return asset ? resolveStoredAssetAbsolutePath(baseDir, asset) : null
  }

  const isAllowedClientAssetPath = (absolutePath: string) => {
    const resolvedPath = path.resolve(absolutePath)
    return [getDocumentsClientsRootDir(), getLegacyClientsRootDir()].some((rootDir) =>
      isPathInside(resolvedPath, rootDir)
    )
  }

  return {
    getClientBaseDir,
    buildAssetResponse,
    importClientAssets,
    importGeneratedClientAssets,
    deleteClientAsset,
    setPrimaryClientPhoto,
    setClientPhotoCategory,
    getAssetAbsolutePath,
    isAllowedClientAssetPath
  }
}
