import { prisma } from '../../../db'
import { validateAppointmentSlot } from '../../../utils/appointment-validation'
import {
  buildAppointmentImportConflictSummary,
  buildAppointmentImportKey,
  buildDuplicateSummary,
  createClientFromAppointmentImport,
  isPreparedMissingClientEntry,
  isPreparedReadyEntry,
  normalizeAppointmentImportError,
  pushMissingClientOutcome,
  sortMissingClientSummaries,
  toAppointmentSpreadsheetError
} from './shared'
import type {
  AppointmentImportCatalogs,
  AppointmentImportCommitSummary,
  PreparedActionableAppointmentImportRow,
  PreparedAppointmentImportRow
} from './types'

type CommitAppointmentImportInput = {
  preparedRows: PreparedAppointmentImportRow[]
  existingImportKeys: Set<string>
  catalogs: AppointmentImportCatalogs
  createMissingClients: boolean
  userId: string
  detectedProfessionals: string[]
}

export const commitAppointmentImport = async (
  input: CommitAppointmentImportInput
): Promise<AppointmentImportCommitSummary> => {
  const results: AppointmentImportCommitSummary = {
    success: 0,
    skipped: 0,
    createdClients: 0,
    detectedProfessionals: input.detectedProfessionals,
    duplicates: [],
    conflicts: [],
    blocks: [],
    missingClients: [],
    errors: []
  }
  const processedImportKeys = new Set<string>(input.existingImportKeys)
  const missingClientOutcomes = new Map()
  const createdClientsByKey = new Map()

  for (const entry of input.preparedRows) {
    if (entry.kind === 'block') {
      results.skipped += 1
      results.blocks.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
      continue
    }

    if (entry.kind === 'error') {
      results.skipped += 1
      results.errors.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
      continue
    }

    const actionableEntry = entry as PreparedActionableAppointmentImportRow

    try {
      let clientId = isPreparedReadyEntry(actionableEntry) ? actionableEntry.clientId : null
      let clientName = isPreparedReadyEntry(actionableEntry)
        ? actionableEntry.clientName
        : actionableEntry.missingClient.clientName

      if (isPreparedMissingClientEntry(actionableEntry)) {
        if (!input.createMissingClients) {
          results.skipped += 1
          pushMissingClientOutcome(
            missingClientOutcomes,
            actionableEntry.missingClient,
            actionableEntry.rowNumber,
            'skipped'
          )
          continue
        }

        let createdClient = createdClientsByKey.get(actionableEntry.missingClient.key) || null
        if (!createdClient) {
          createdClient = await createClientFromAppointmentImport(actionableEntry.missingClient)
          createdClientsByKey.set(actionableEntry.missingClient.key, createdClient)
          input.catalogs.clients.push(createdClient)
          results.createdClients += 1
        }

        clientId = createdClient.id
        clientName =
          `${createdClient.firstName || ''} ${createdClient.lastName || ''}`.trim() ||
          actionableEntry.missingClient.clientName
        pushMissingClientOutcome(
          missingClientOutcomes,
          actionableEntry.missingClient,
          actionableEntry.rowNumber,
          'created'
        )
      }

      if (!clientId) {
        throw new Error('Cliente invalido')
      }

      const importKey = buildAppointmentImportKey({
        date: actionableEntry.date,
        startTime: actionableEntry.startTime,
        endTime: actionableEntry.endTime,
        professional: actionableEntry.professional,
        cabin: actionableEntry.cabin,
        serviceId: actionableEntry.serviceId,
        clientId
      })

      if (processedImportKeys.has(importKey)) {
        results.skipped += 1
        results.duplicates.push(
          buildDuplicateSummary(
            actionableEntry.rowNumber,
            clientName,
            actionableEntry.serviceName,
            actionableEntry.date,
            actionableEntry.startTime,
            input.existingImportKeys.has(importKey) ? 'existing' : 'file'
          )
        )
        continue
      }

      const validation = await validateAppointmentSlot(
        {
          date: actionableEntry.date,
          startTime: actionableEntry.startTime,
          endTime: actionableEntry.endTime,
          professional: actionableEntry.professional,
          cabin: actionableEntry.cabin,
          allowPastDate: true
        },
        prisma
      )

      if (validation.errors.length > 0) {
        results.skipped += 1
        results.conflicts.push(
          buildAppointmentImportConflictSummary(
            actionableEntry.rowNumber,
            validation.errors.map((validationError) => validationError.message).join('; ')
          )
        )
        continue
      }

      await prisma.appointment.create({
        data: {
          clientId,
          userId: input.userId,
          serviceId: actionableEntry.serviceId,
          cabin: actionableEntry.cabin,
          professional: actionableEntry.professional,
          date: actionableEntry.date,
          startTime: actionableEntry.startTime,
          endTime: actionableEntry.endTime,
          status: 'SCHEDULED',
          notes: actionableEntry.notes,
          reminder: true
        }
      })
      processedImportKeys.add(importKey)
      results.success += 1
    } catch (error) {
      results.skipped += 1
      results.errors.push(
        toAppointmentSpreadsheetError(actionableEntry.rowNumber, normalizeAppointmentImportError(error))
      )
    }
  }

  results.missingClients = sortMissingClientSummaries([...missingClientOutcomes.values()])

  return results
}
