import { prisma } from '../../../db'
import { validateAppointmentSlot } from '../../../utils/appointment-validation'
import {
  buildAppointmentImportConflictSummary,
  buildDuplicateSummary,
  buildMissingClientSummaryMap,
  findAppointmentImportPlannedConflicts,
  isPreparedMissingClientEntry,
  isPreparedReadyEntry,
  sortMissingClientSummaries,
  toAppointmentSpreadsheetError
} from './shared'
import type {
  AppointmentImportPreviewPayload,
  PreparedActionableAppointmentImportRow,
  PreparedAppointmentImportRow
} from './types'

export const buildAppointmentImportPreview = async (
  preparedRows: PreparedAppointmentImportRow[],
  existingImportKeys: Set<string>,
  detectedProfessionals: string[]
): Promise<AppointmentImportPreviewPayload> => {
  const duplicateIssues = []
  const conflictIssues = []
  const errorIssues = []
  const blockIssues = []
  const plannedKeys = new Set<string>()
  const plannedEntries: PreparedActionableAppointmentImportRow[] = []
  let ready = 0

  for (const entry of preparedRows) {
    if (entry.kind === 'error') {
      errorIssues.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
      continue
    }

    if (entry.kind === 'block') {
      blockIssues.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
      continue
    }

    if (isPreparedMissingClientEntry(entry)) {
      const validation = await validateAppointmentSlot(
        {
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          professional: entry.professional,
          cabin: entry.cabin,
          allowPastDate: true
        },
        prisma
      )
      const plannedConflicts = findAppointmentImportPlannedConflicts(entry, plannedEntries)
      const allConflictMessages = [
        ...validation.errors.map((validationError) => validationError.message),
        ...plannedConflicts
      ]

      if (allConflictMessages.length > 0) {
        conflictIssues.push(
          buildAppointmentImportConflictSummary(entry.rowNumber, [...new Set(allConflictMessages)].join('; '))
        )
        continue
      }

      plannedEntries.push(entry)
      continue
    }

    if (!isPreparedReadyEntry(entry)) {
      continue
    }

    if (existingImportKeys.has(entry.importKey)) {
      duplicateIssues.push(
        buildDuplicateSummary(
          entry.rowNumber,
          entry.clientName,
          entry.serviceName,
          entry.date,
          entry.startTime,
          'existing'
        )
      )
      continue
    }

    if (plannedKeys.has(entry.importKey)) {
      duplicateIssues.push(
        buildDuplicateSummary(
          entry.rowNumber,
          entry.clientName,
          entry.serviceName,
          entry.date,
          entry.startTime,
          'file'
        )
      )
      continue
    }

    const validation = await validateAppointmentSlot(
      {
        date: entry.date,
        startTime: entry.startTime,
        endTime: entry.endTime,
        professional: entry.professional,
        cabin: entry.cabin,
        allowPastDate: true
      },
      prisma
    )
    const plannedConflicts = findAppointmentImportPlannedConflicts(entry, plannedEntries)
    const allConflictMessages = [
      ...validation.errors.map((validationError) => validationError.message),
      ...plannedConflicts
    ]

    if (allConflictMessages.length > 0) {
      conflictIssues.push(
        buildAppointmentImportConflictSummary(entry.rowNumber, [...new Set(allConflictMessages)].join('; '))
      )
      continue
    }

    plannedKeys.add(entry.importKey)
    plannedEntries.push(entry)
    ready += 1
  }

  return {
    totalRows: preparedRows.length,
    ready,
    detectedProfessionals,
    duplicates: duplicateIssues,
    missingClients: sortMissingClientSummaries([...buildMissingClientSummaryMap(preparedRows).values()]),
    blocks: blockIssues,
    conflicts: conflictIssues,
    errors: errorIssues
  }
}
