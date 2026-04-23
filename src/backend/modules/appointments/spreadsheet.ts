import { loadAppointmentRowsFromBuffer } from '../../utils/appointment-spreadsheet'
import { findUnknownProfessionalNames, getProfessionalCatalog } from '../../utils/professional-catalog'
import { AppointmentModuleError } from './errors'
import { commitAppointmentImport } from './spreadsheet/commit'
import { buildAppointmentImportPreview } from './spreadsheet/preview'
import {
  isPreparedActionableEntry,
  prepareAppointmentImportRows,
  selectAppointmentImportCatalogs,
  selectExistingImportAppointmentKeys
} from './spreadsheet/shared'
import { type AppointmentImportMode } from './spreadsheet/types'

export const importAppointmentsSpreadsheet = async (input: {
  buffer: Buffer
  userId: string
  mode?: unknown
  createMissingClients?: unknown
}) => {
  const mode: AppointmentImportMode = input.mode === 'preview' ? 'preview' : 'commit'
  const createMissingClients = Boolean(input.createMissingClients)

  let rows: Record<string, unknown>[]
  try {
    rows = await loadAppointmentRowsFromBuffer(input.buffer)
  } catch (error) {
    if (error instanceof Error && error.message === 'No worksheet found in the uploaded file') {
      throw new AppointmentModuleError(400, error.message)
    }
    throw error
  }

  const catalogs = await selectAppointmentImportCatalogs()
  const preparedRows = prepareAppointmentImportRows(rows, catalogs)
  const existingImportKeys = await selectExistingImportAppointmentKeys(preparedRows)
  const configuredProfessionals = await getProfessionalCatalog()
  const detectedProfessionals = findUnknownProfessionalNames(
    preparedRows.filter(isPreparedActionableEntry).map((entry) => entry.professional),
    configuredProfessionals
  )

  if (mode === 'preview') {
    return {
      stage: 'preview' as const,
      preview: await buildAppointmentImportPreview(preparedRows, existingImportKeys, detectedProfessionals)
    }
  }

  return {
    stage: 'commit' as const,
    results: await commitAppointmentImport({
      preparedRows,
      existingImportKeys,
      catalogs,
      createMissingClients,
      userId: input.userId,
      detectedProfessionals
    })
  }
}
