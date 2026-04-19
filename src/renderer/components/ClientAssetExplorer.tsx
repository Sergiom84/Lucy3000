import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  File,
  FileImage,
  FileText,
  FolderOpen,
  Star,
  Trash2,
  Upload
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { formatDateTime } from '../utils/format'
import {
  deleteClientAsset,
  importClientAssets,
  isDesktop,
  openClientAsset,
  openClientFolder,
  setClientPhotoCategory,
  setPrimaryClientPhoto,
  type ClientAsset,
  type ClientAssetsResponse,
  type PhotoCategoryId
} from '../utils/desktop'

type ExplorerFolderId = PhotoCategoryId | 'consents' | 'documents'

type ClientAssetExplorerProps = {
  clientId: string
  clientName: string
  clientAssets: ClientAssetsResponse | null
  assetsLoading: boolean
  onAssetsChange: (assets: ClientAssetsResponse) => void
  onAssetsLoadingChange: (loading: boolean) => void
}

type FolderDefinition = {
  id: ExplorerFolderId
  label: string
  kind: 'photos' | 'consents' | 'documents'
  emptyLabel: string
  accentClass: string
  accentTextClass: string
}

const ROOT_FOLDERS: FolderDefinition[] = [
  {
    id: 'before',
    label: 'Antes',
    kind: 'photos',
    emptyLabel: 'No hay fotos en Antes',
    accentClass: 'from-amber-100 via-orange-50 to-white dark:from-amber-950/40 dark:via-orange-950/20 dark:to-gray-900',
    accentTextClass: 'text-amber-700 dark:text-amber-300'
  },
  {
    id: 'after',
    label: 'Después',
    kind: 'photos',
    emptyLabel: 'No hay fotos en Después',
    accentClass: 'from-emerald-100 via-teal-50 to-white dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-gray-900',
    accentTextClass: 'text-emerald-700 dark:text-emerald-300'
  },
  {
    id: 'treatments',
    label: 'Tratamientos',
    kind: 'photos',
    emptyLabel: 'No hay fotos en Tratamientos',
    accentClass: 'from-sky-100 via-blue-50 to-white dark:from-sky-950/40 dark:via-blue-950/20 dark:to-gray-900',
    accentTextClass: 'text-sky-700 dark:text-sky-300'
  },
  {
    id: 'consents',
    label: 'Consentimientos',
    kind: 'consents',
    emptyLabel: 'No hay consentimientos',
    accentClass: 'from-violet-100 via-fuchsia-50 to-white dark:from-violet-950/40 dark:via-fuchsia-950/20 dark:to-gray-900',
    accentTextClass: 'text-violet-700 dark:text-violet-300'
  },
  {
    id: 'documents',
    label: 'Documentos',
    kind: 'documents',
    emptyLabel: 'No hay documentos',
    accentClass: 'from-slate-200 via-slate-50 to-white dark:from-slate-900 dark:via-slate-950/70 dark:to-gray-900',
    accentTextClass: 'text-slate-700 dark:text-slate-300'
  },
  {
    id: 'unclassified',
    label: 'Sin clasificar',
    kind: 'photos',
    emptyLabel: 'No hay fotos sin clasificar',
    accentClass: 'from-stone-200 via-stone-50 to-white dark:from-stone-900 dark:via-stone-950/70 dark:to-gray-900',
    accentTextClass: 'text-stone-700 dark:text-stone-300'
  }
]

const PHOTO_CATEGORY_OPTIONS: Array<{ id: PhotoCategoryId; label: string }> = [
  { id: 'before', label: 'Antes' },
  { id: 'after', label: 'Después' },
  { id: 'treatments', label: 'Tratamientos' },
  { id: 'unclassified', label: 'Sin clasificar' }
]

const getAssetDateValue = (asset: Pick<ClientAsset, 'addedAt' | 'takenAt'>) => {
  const parsed = new Date(asset.takenAt || asset.addedAt).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const sortAssetsByRecency = (assets: ClientAsset[]) => [...assets].sort((a, b) => getAssetDateValue(b) - getAssetDateValue(a))

const formatFolderCount = (kind: FolderDefinition['kind'], count: number) => {
  if (kind === 'photos') {
    return count === 1 ? '1 foto' : `${count} fotos`
  }

  return count === 1 ? '1 archivo' : `${count} archivos`
}

const getFileBadgeLabel = (asset: ClientAsset) => {
  if (asset.previewType === 'pdf') return 'PDF'
  if (asset.previewType === 'image') return 'Imagen'
  const extension = asset.fileName.split('.').pop()?.toUpperCase()
  return extension || 'Archivo'
}

const renderAssetSurface = (
  asset: ClientAsset | null,
  fallbackLabel: string,
  accentTextClass: string,
  compact = false
) => {
  const surfaceHeight = compact ? 'h-36' : 'h-44'

  if (!asset) {
    return (
      <div className={`flex ${surfaceHeight} items-center justify-center rounded-2xl border border-dashed border-white/60 bg-white/60 dark:border-gray-700/70 dark:bg-gray-900/40`}>
        <div className="text-center">
          <FolderOpen className={`mx-auto mb-3 h-10 w-10 ${accentTextClass}`} />
          <p className={`text-sm font-medium ${accentTextClass}`}>{fallbackLabel}</p>
        </div>
      </div>
    )
  }

  if (asset.previewType === 'image') {
    return (
      <div className={`overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm dark:border-gray-700/70 dark:bg-gray-900 ${surfaceHeight}`}>
        <img src={asset.previewUrl} alt={asset.originalName} className="h-full w-full object-cover" />
      </div>
    )
  }

  if (asset.previewType === 'pdf') {
    return (
      <div className={`overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm dark:border-gray-700/70 dark:bg-gray-900 ${surfaceHeight}`}>
        <object data={asset.previewUrl} type="application/pdf" className="h-full w-full pointer-events-none">
          <div className="flex h-full items-center justify-center bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300">
            <div className="text-center">
              <FileText className="mx-auto mb-2 h-10 w-10" />
              <p className="text-sm font-medium">Vista PDF</p>
            </div>
          </div>
        </object>
      </div>
    )
  }

  return (
    <div className={`flex ${surfaceHeight} items-center justify-center rounded-2xl border border-white/70 bg-white shadow-sm dark:border-gray-700/70 dark:bg-gray-900`}>
      <div className="text-center">
        <File className={`mx-auto mb-3 h-10 w-10 ${accentTextClass}`} />
        <p className={`text-sm font-medium ${accentTextClass}`}>{getFileBadgeLabel(asset)}</p>
      </div>
    </div>
  )
}

export default function ClientAssetExplorer({
  clientId,
  clientName,
  clientAssets,
  assetsLoading,
  onAssetsChange,
  onAssetsLoadingChange
}: ClientAssetExplorerProps) {
  const [activeFolderId, setActiveFolderId] = useState<ExplorerFolderId | null>(null)
  const [previewState, setPreviewState] = useState<{ folderId: ExplorerFolderId; assetId: string } | null>(null)
  const [photoImportPickerOpen, setPhotoImportPickerOpen] = useState(false)

  const sortedPhotos = useMemo(() => sortAssetsByRecency(clientAssets?.photos || []), [clientAssets?.photos])
  const sortedConsents = useMemo(() => sortAssetsByRecency(clientAssets?.consents || []), [clientAssets?.consents])
  const sortedDocuments = useMemo(() => sortAssetsByRecency(clientAssets?.documents || []), [clientAssets?.documents])

  const photoCategoryMap = useMemo(
    () => new Map((clientAssets?.photoCategories || []).map((category) => [category.id, category])),
    [clientAssets?.photoCategories]
  )

  const getAssetsForFolder = (folderId: ExplorerFolderId): ClientAsset[] => {
    if (folderId === 'consents') return sortedConsents
    if (folderId === 'documents') return sortedDocuments
    return sortedPhotos.filter((asset) => (asset.photoCategory || 'unclassified') === folderId)
  }

  const folderEntries = useMemo(
    () =>
      ROOT_FOLDERS.map((folder) => {
        const assets = getAssetsForFolder(folder.id)
        const latestAsset = assets[0] || null
        return {
          ...folder,
          count: folder.kind === 'photos' ? photoCategoryMap.get(folder.id as PhotoCategoryId)?.photoCount ?? assets.length : assets.length,
          latestAsset,
          lastUpdatedAt: latestAsset ? latestAsset.takenAt || latestAsset.addedAt : null,
          coverUrl:
            folder.kind === 'photos'
              ? photoCategoryMap.get(folder.id as PhotoCategoryId)?.coverUrl || latestAsset?.previewUrl || null
              : latestAsset?.previewUrl || null,
          assets
        }
      }),
    [photoCategoryMap, sortedConsents, sortedDocuments, sortedPhotos]
  )

  const activeFolder = useMemo(
    () => (activeFolderId ? folderEntries.find((folder) => folder.id === activeFolderId) || null : null),
    [activeFolderId, folderEntries]
  )

  const previewAssets = useMemo(
    () => (previewState ? getAssetsForFolder(previewState.folderId) : []),
    [previewState, sortedConsents, sortedDocuments, sortedPhotos]
  )
  const previewIndex = useMemo(
    () => (previewState ? previewAssets.findIndex((asset) => asset.id === previewState.assetId) : -1),
    [previewAssets, previewState]
  )
  const previewAsset = previewIndex >= 0 ? previewAssets[previewIndex] : null

  useEffect(() => {
    if (!previewState) return
    if (!previewAsset) {
      setPreviewState(null)
    }
  }, [previewAsset, previewState])

  useEffect(() => {
    if (!previewAsset) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewState(null)
        return
      }

      if (previewAsset.previewType !== 'image' || previewAssets.length < 2) {
        return
      }

      if (event.key === 'ArrowLeft') {
        setPreviewState({
          folderId: previewState!.folderId,
          assetId: previewAssets[(previewIndex - 1 + previewAssets.length) % previewAssets.length].id
        })
      }

      if (event.key === 'ArrowRight') {
        setPreviewState({
          folderId: previewState!.folderId,
          assetId: previewAssets[(previewIndex + 1) % previewAssets.length].id
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewAsset, previewAssets, previewIndex, previewState])

  const runAssetMutation = async (
    action: () => Promise<ClientAssetsResponse>,
    options?: { successMessage?: string; errorMessage?: string }
  ) => {
    try {
      onAssetsLoadingChange(true)
      const assets = await action()
      onAssetsChange(assets)
      if (options?.successMessage) {
        toast.success(options.successMessage)
      }
      return assets
    } catch (error: any) {
      toast.error(error.message || options?.errorMessage || 'No se pudo actualizar el archivo')
      return null
    } finally {
      onAssetsLoadingChange(false)
    }
  }

  const handleImport = async (kind: FolderDefinition['kind'], photoCategory?: PhotoCategoryId | null) => {
    await runAssetMutation(
      () => importClientAssets(clientId, clientName, kind, { photoCategory: photoCategory ?? null }),
      {
        successMessage:
          kind === 'photos' ? 'Fotos importadas' : kind === 'consents' ? 'Consentimientos importados' : 'Documentos importados',
        errorMessage: 'No se pudo importar el archivo'
      }
    )
  }

  const handleDeleteAsset = async (asset: ClientAsset) => {
    const confirmed = window.confirm(`¿Eliminar ${asset.originalName}?`)
    if (!confirmed) return

    const result = await runAssetMutation(
      () => deleteClientAsset(clientId, clientName, asset.id),
      { successMessage: 'Archivo eliminado', errorMessage: 'No se pudo eliminar el archivo' }
    )

    if (result && previewState?.assetId === asset.id) {
      setPreviewState(null)
    }
  }

  const handleSetPrimaryPhoto = async (assetId: string) => {
    await runAssetMutation(
      () => setPrimaryClientPhoto(clientId, clientName, assetId),
      { successMessage: 'Foto principal actualizada', errorMessage: 'No se pudo actualizar la foto principal' }
    )
  }

  const handleSetPhotoCategory = async (assetId: string, photoCategory: PhotoCategoryId) => {
    await runAssetMutation(
      () => setClientPhotoCategory(clientId, clientName, assetId, photoCategory),
      { errorMessage: 'No se pudo mover la foto de carpeta' }
    )
  }

  const handleOpenClientFolder = async () => {
    try {
      await openClientFolder(clientId, clientName)
    } catch (error: any) {
      toast.error(error.message || 'No se pudo abrir la carpeta del cliente')
    }
  }

  const handleOpenAsset = async (asset: ClientAsset) => {
    try {
      await openClientAsset(clientId, clientName, asset.id)
    } catch (error: any) {
      toast.error(error.message || 'No se pudo abrir el archivo')
    }
  }

  const handlePreviewStep = (offset: number) => {
    if (!previewState || previewAssets.length === 0 || previewIndex < 0) return
    const nextIndex = (previewIndex + offset + previewAssets.length) % previewAssets.length
    setPreviewState({ folderId: previewState.folderId, assetId: previewAssets[nextIndex].id })
  }

  if (!isDesktop()) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
        Disponible solo en la app de escritorio Electron.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Archivos del cliente</h3>
            {clientAssets && clientAssets.consents.length > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Consentimientos cargados
              </div>
            )}
          </div>
          <button type="button" onClick={handleOpenClientFolder} className="btn btn-secondary btn-sm">
            Abrir carpeta
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setPhotoImportPickerOpen(true)} className="btn btn-primary btn-sm" disabled={assetsLoading}>
            Subir fotos
          </button>
          <button type="button" onClick={() => handleImport('consents')} className="btn btn-secondary btn-sm" disabled={assetsLoading}>
            Subir consentimiento
          </button>
          <button type="button" onClick={() => handleImport('documents')} className="btn btn-secondary btn-sm" disabled={assetsLoading}>
            Subir documento
          </button>
        </div>

        {activeFolder ? (
          <div className="space-y-4">
            <div className={`rounded-2xl border border-gray-200 bg-gradient-to-br p-4 shadow-sm dark:border-gray-700 ${activeFolder.accentClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => setActiveFolderId(null)} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Volver
                  </button>
                  <div>
                    <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${activeFolder.accentTextClass}`}>Explorador</p>
                    <h4 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{activeFolder.label}</h4>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {formatFolderCount(activeFolder.kind, activeFolder.assets.length)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeFolder.kind === 'photos' && (
                    <button
                      type="button"
                      onClick={() => handleImport('photos', activeFolder.id as PhotoCategoryId)}
                      className="btn btn-primary btn-sm"
                      disabled={assetsLoading}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Añadir fotos aquí
                    </button>
                  )}
                  {activeFolder.kind === 'consents' && (
                    <button type="button" onClick={() => handleImport('consents')} className="btn btn-primary btn-sm" disabled={assetsLoading}>
                      <Upload className="mr-2 h-4 w-4" />
                      Añadir consentimiento
                    </button>
                  )}
                  {activeFolder.kind === 'documents' && (
                    <button type="button" onClick={() => handleImport('documents')} className="btn btn-primary btn-sm" disabled={assetsLoading}>
                      <Upload className="mr-2 h-4 w-4" />
                      Añadir documento
                    </button>
                  )}
                </div>
              </div>
            </div>

            {assetsLoading && activeFolder.assets.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando archivos...</p>
            ) : activeFolder.assets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-600">
                <p className="text-sm text-gray-500 dark:text-gray-400">{activeFolder.emptyLabel}</p>
              </div>
            ) : activeFolder.kind === 'photos' ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {activeFolder.assets.map((asset) => (
                  <div key={asset.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <button type="button" onClick={() => setPreviewState({ folderId: activeFolder.id, assetId: asset.id })} className="block w-full bg-gray-100 dark:bg-gray-900">
                      <img src={asset.previewUrl} alt={asset.originalName} className="h-44 w-full object-cover" />
                    </button>
                    <div className="space-y-3 p-4">
                      <div>
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{asset.originalName}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Captura: {formatDateTime(asset.takenAt || asset.addedAt)}
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Mover a
                        </label>
                        <select
                          value={asset.photoCategory || 'unclassified'}
                          onChange={(event) => handleSetPhotoCategory(asset.id, event.target.value as PhotoCategoryId)}
                          className="input h-9 py-1 text-sm"
                          disabled={assetsLoading}
                        >
                          {PHOTO_CATEGORY_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryPhoto(asset.id)}
                          className={`btn btn-sm ${asset.isPrimaryPhoto ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          <Star className="mr-1 h-3.5 w-3.5" />
                          Principal
                        </button>
                        <button type="button" onClick={() => handleDeleteAsset(asset)} className="btn btn-sm btn-secondary text-red-600">
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {activeFolder.assets.map((asset) => (
                  <div key={asset.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <button
                      type="button"
                      onClick={() => setPreviewState({ folderId: activeFolder.id, assetId: asset.id })}
                      className="block w-full bg-gray-100 p-4 dark:bg-gray-900"
                    >
                      {renderAssetSurface(asset, activeFolder.label, activeFolder.accentTextClass, true)}
                    </button>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{asset.originalName}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Importado: {formatDateTime(asset.addedAt)}
                          </p>
                        </div>
                        <span className="badge badge-secondary shrink-0">{getFileBadgeLabel(asset)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPreviewState({ folderId: activeFolder.id, assetId: asset.id })} className="btn btn-sm btn-secondary">
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          Ver
                        </button>
                        <button type="button" onClick={() => handleOpenAsset(asset)} className="btn btn-sm btn-secondary">
                          Abrir archivo
                        </button>
                        <button type="button" onClick={() => handleDeleteAsset(asset)} className="btn btn-sm btn-secondary text-red-600">
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {folderEntries.map((folder) => {
              const coverAsset = folder.latestAsset
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setActiveFolderId(folder.id)}
                  className={`group rounded-[28px] border border-gray-200 bg-gradient-to-br p-4 text-left shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg dark:border-gray-700 ${folder.accentClass}`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 pr-2">
                      <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${folder.accentTextClass}`}>Carpeta</p>
                      <h4 className="mt-2 break-words text-base font-semibold leading-tight text-gray-900 dark:text-white">{folder.label}</h4>
                    </div>
                  </div>

                  {renderAssetSurface(coverAsset, folder.label, folder.accentTextClass)}

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{formatFolderCount(folder.kind, folder.count)}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {folder.lastUpdatedAt ? `Actualizado ${formatDateTime(folder.lastUpdatedAt)}` : 'Sin archivos todavía'}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 transition-transform group-hover:translate-x-1 dark:text-gray-200">
                      Abrir
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {assetsLoading && !activeFolder && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Actualizando archivos...</p>
        )}

      </div>

      <Modal isOpen={photoImportPickerOpen} onClose={() => setPhotoImportPickerOpen(false)} title="Subir fotos" maxWidth="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Selecciona dónde quieres guardar las nuevas fotos.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PHOTO_CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={async () => {
                  setPhotoImportPickerOpen(false)
                  await handleImport('photos', option.id)
                }}
                className="rounded-2xl border border-gray-200 px-4 py-4 text-left transition hover:border-primary-400 hover:bg-primary-50 dark:border-gray-700 dark:hover:border-primary-500 dark:hover:bg-gray-700"
              >
                <p className="font-medium text-gray-900 dark:text-white">{option.label}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Guardar nuevas fotos en esta carpeta.</p>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(previewAsset)}
        onClose={() => setPreviewState(null)}
        title={previewAsset?.originalName || 'Archivo'}
        maxWidth={previewAsset?.previewType === 'image' ? '4xl' : '2xl'}
      >
        {previewAsset && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Importado: {formatDateTime(previewAsset.addedAt)}</p>
                {previewAsset.kind === 'photos' && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Captura: {formatDateTime(previewAsset.takenAt || previewAsset.addedAt)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {previewAsset.previewType === 'image' && previewAssets.length > 1 && (
                  <>
                    <button type="button" onClick={() => handlePreviewStep(-1)} className="btn btn-secondary btn-sm">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => handlePreviewStep(1)} className="btn btn-secondary btn-sm">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button type="button" onClick={() => handleOpenAsset(previewAsset)} className="btn btn-secondary btn-sm">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir archivo
                </button>
              </div>
            </div>

            {previewAsset.previewType === 'image' && (
              <img
                src={previewAsset.previewUrl}
                alt={previewAsset.originalName}
                className="max-h-[72vh] w-full rounded-2xl bg-gray-100 object-contain dark:bg-gray-900"
              />
            )}

            {previewAsset.previewType === 'pdf' && (
              <object data={previewAsset.previewUrl} type="application/pdf" className="h-[72vh] w-full rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="flex h-[72vh] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                  <div className="text-center">
                    <FileText className="mx-auto mb-3 h-12 w-12 text-red-600 dark:text-red-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">No se pudo renderizar la vista previa del PDF.</p>
                  </div>
                </div>
              </object>
            )}

            {previewAsset.previewType === 'file' && (
              <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900">
                <div className="text-center">
                  <FileImage className="mx-auto mb-4 h-12 w-12 text-gray-500 dark:text-gray-400" />
                  <p className="text-base font-medium text-gray-900 dark:text-white">Vista previa no disponible</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Abre el archivo con el sistema para verlo o editarlo.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
