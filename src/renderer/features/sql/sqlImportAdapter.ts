import type { SqlAnalysisResult, SqlGeneratedClientAsset, SqlImportPayload } from './types'

type DesktopBackupResult = {
  success?: boolean
  message?: string
  path?: string | null
}

type GeneratedAssetsImportResult = {
  importedCount: number
}

export const isDesktopSqlRestoreAvailable = () =>
  Boolean(window.electronAPI?.backup?.create && window.electronAPI?.clientAssets?.importGenerated)

export const buildSqlImportPayload = (analysis: SqlAnalysisResult, sessionId: string): SqlImportPayload => ({
  sessionId,
  sourceName: analysis.sourceName,
  professionals: analysis.professionals,
  clients: analysis.clients,
  services: analysis.services,
  products: analysis.products,
  bonoTemplates: analysis.bonoTemplates,
  clientBonos: analysis.clientBonos,
  accountBalances: analysis.accountBalances,
  appointments: analysis.appointments,
  agendaBlocks: analysis.agendaBlocks,
  agendaNotes: analysis.agendaNotes,
  consents: analysis.consents,
  signatures: analysis.signatures,
  photoReferencesSkipped: analysis.photoReferencesSkipped,
  unsupportedPopulatedTables: analysis.unsupportedPopulatedTables
})

export const createSqlImportBackup = async () => {
  const backupResult = (await window.electronAPI?.backup?.create?.()) as DesktopBackupResult | undefined

  if (!backupResult?.success) {
    throw new Error(backupResult?.message || 'No se pudo crear el backup previo')
  }

  return backupResult
}

export const importGeneratedSqlAssets = async (assets: SqlGeneratedClientAsset[]) => {
  if (!assets.length) {
    return null
  }

  return (await window.electronAPI?.clientAssets?.importGenerated?.({
    assets
  })) as GeneratedAssetsImportResult | null
}
