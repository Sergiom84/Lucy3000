import os from 'os'
import path from 'path'
import { promises as fsPromises } from 'fs'
import { describe, expect, it } from 'vitest'
import {
  buildPhotoCategorySummaries,
  createClientAssetManager,
  inferClientAssetPreviewType,
  mapLegacyPhotoFolderNameToCategory,
  normalizeClientAssetManifest,
  pickPrimaryPhotoId,
  type ClientAsset
} from '../../src/main/clientAssets'

const createAsset = (overrides: Partial<ClientAsset> = {}): ClientAsset => ({
  id: overrides.id || 'asset-1',
  kind: overrides.kind || 'photos',
  fileName: overrides.fileName || 'asset-1.jpg',
  originalName: overrides.originalName || 'asset-1.jpg',
  addedAt: overrides.addedAt || '2026-03-15T10:00:00.000Z',
  takenAt: overrides.takenAt || overrides.addedAt || '2026-03-15T10:00:00.000Z',
  photoCategory: overrides.photoCategory || 'before',
  absolutePath: overrides.absolutePath || 'C:\\tmp\\asset-1.jpg',
  previewUrl: overrides.previewUrl || 'lucyasset://asset/mock',
  previewType: overrides.previewType || 'image',
  isPrimaryPhoto: overrides.isPrimaryPhoto || false
})

describe('clientAssets helpers', () => {
  it('maps legacy folder names to fixed categories', () => {
    expect(mapLegacyPhotoFolderNameToCategory('Antes')).toBe('before')
    expect(mapLegacyPhotoFolderNameToCategory('Despues tratamiento')).toBe('after')
    expect(mapLegacyPhotoFolderNameToCategory('Tratamientos faciales')).toBe('treatments')
    expect(mapLegacyPhotoFolderNameToCategory('Mi carpeta custom')).toBe('unclassified')
  })

  it('normalizes a legacy manifest into the fixed photo categories', () => {
    const manifest = normalizeClientAssetManifest({
      version: 2,
      primaryPhotoId: 'missing-photo',
      photoFolders: [
        { id: 'folder-before', name: 'Antes' },
        { id: 'folder-custom', name: 'Facial VIP' }
      ],
      assets: [
        {
          id: 'photo-1',
          kind: 'photos',
          fileName: 'photo-1.jpg',
          originalName: 'photo-1.jpg',
          addedAt: '2026-03-15T10:00:00.000Z',
          takenAt: '2026-03-15T10:00:00.000Z',
          folderId: 'folder-before'
        },
        {
          id: 'photo-2',
          kind: 'photos',
          fileName: 'photo-2.jpg',
          originalName: 'photo-2.jpg',
          addedAt: '2026-03-16T10:00:00.000Z',
          folderId: 'folder-custom'
        },
        {
          id: 'consent-1',
          kind: 'consents',
          fileName: 'consent.pdf',
          originalName: 'consent.pdf',
          addedAt: '2026-03-17T10:00:00.000Z'
        }
      ]
    })

    expect(manifest.version).toBe(3)
    expect(manifest.primaryPhotoId).toBe('photo-1')
    expect(manifest.assets).toEqual([
      expect.objectContaining({ id: 'photo-1', photoCategory: 'before' }),
      expect.objectContaining({ id: 'photo-2', photoCategory: 'unclassified' }),
      expect.objectContaining({ id: 'consent-1', kind: 'consents' })
    ])
  })

  it('detects preview types from file extensions', () => {
    expect(inferClientAssetPreviewType('before.JPG')).toBe('image')
    expect(inferClientAssetPreviewType('consent.pdf')).toBe('pdf')
    expect(inferClientAssetPreviewType('planilla.xlsx')).toBe('file')
  })

  it('builds folder covers from the most recent photo in each category', () => {
    const summaries = buildPhotoCategorySummaries([
      createAsset({ id: 'before-old', photoCategory: 'before', previewUrl: 'cover-old', takenAt: '2026-03-10T10:00:00.000Z' }),
      createAsset({ id: 'before-new', photoCategory: 'before', previewUrl: 'cover-new', takenAt: '2026-03-20T10:00:00.000Z' }),
      createAsset({ id: 'after-1', photoCategory: 'after', previewUrl: 'after-cover', takenAt: '2026-03-18T10:00:00.000Z' })
    ])

    expect(summaries.find((item) => item.id === 'before')).toEqual(
      expect.objectContaining({ photoCount: 2, coverUrl: 'cover-new' })
    )
    expect(summaries.find((item) => item.id === 'after')).toEqual(
      expect.objectContaining({ photoCount: 1, coverUrl: 'after-cover' })
    )
    expect(summaries.find((item) => item.id === 'unclassified')).toEqual(
      expect.objectContaining({ photoCount: 0, coverUrl: null })
    )
  })

  it('recalculates the primary photo only when the current one no longer exists', () => {
    const assets = [
      { id: 'photo-1', kind: 'photos' as const },
      { id: 'photo-2', kind: 'photos' as const },
      { id: 'consent-1', kind: 'consents' as const }
    ]

    expect(pickPrimaryPhotoId(assets, 'photo-2')).toBe('photo-2')
    expect(pickPrimaryPhotoId(assets, 'missing-photo')).toBe('photo-1')
    expect(pickPrimaryPhotoId([{ id: 'consent-1', kind: 'consents' as const }], 'missing-photo')).toBeNull()
  })

  it('imports generated consent and signature assets without a file picker', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'lucy-client-assets-'))
    const documentsRoot = path.join(tempRoot, 'documents')
    const legacyRoot = path.join(tempRoot, 'legacy')
    const manager = createClientAssetManager({
      getDocumentsClientsRootDir: () => documentsRoot,
      getLegacyClientsRootDir: () => legacyRoot,
      buildPreviewUrl: (absolutePath) => `lucyasset://asset/${path.basename(absolutePath)}`
    })

    const result = await manager.importGeneratedClientAssets([
      {
        clientId: 'client-1',
        clientName: 'Clara Ruiz',
        kind: 'consents',
        fileName: 'consentimiento.txt',
        originalName: 'consentimiento.txt',
        contentBase64: Buffer.from('Consentimiento demo', 'utf8').toString('base64')
      },
      {
        clientId: 'client-1',
        clientName: 'Clara Ruiz',
        kind: 'documents',
        fileName: 'firma.png',
        originalName: 'firma.png',
        contentBase64: Buffer.from('firma-demo', 'utf8').toString('base64')
      }
    ])

    expect(result.importedCount).toBe(2)

    const response = await manager.buildAssetResponse('client-1', 'Clara Ruiz')
    expect(response.consents).toHaveLength(1)
    expect(response.documents).toHaveLength(1)

    const consentContent = await fsPromises.readFile(response.consents[0].absolutePath, 'utf8')
    const signatureContent = await fsPromises.readFile(response.documents[0].absolutePath, 'utf8')

    expect(consentContent).toBe('Consentimiento demo')
    expect(signatureContent).toBe('firma-demo')
  })
})
