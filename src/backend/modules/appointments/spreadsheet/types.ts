import {
  type AppointmentImportClientRecord,
  type AppointmentImportServiceRecord,
  type AppointmentSpreadsheetIssue,
  type AppointmentSpreadsheetResult,
  buildNormalizedAppointmentImportRow
} from '../../../utils/appointment-spreadsheet'

export type AppointmentImportMode = 'preview' | 'commit'

export type AppointmentImportCatalogs = {
  clients: AppointmentImportClientRecord[]
  services: AppointmentImportServiceRecord[]
}

export type MissingAppointmentClientCandidate = {
  key: string
  clientCode: string | null
  clientName: string
  phone: string | null
  email: string | null
  firstName: string
  lastName: string
  phoneForRecord: string
}

export type AppointmentImportMissingClientSummary = {
  key: string
  clientCode: string | null
  clientName: string
  phone: string | null
  email: string | null
  rows: number[]
  action?: 'created' | 'skipped'
}

export type AppointmentImportDuplicateSummary = {
  row: number
  message: string
}

export type AppointmentImportConflictSummary = {
  row: number
  message: string
}

export type PreparedAppointmentImportRow =
  | {
      kind: 'ready'
      rowNumber: number
      row: ReturnType<typeof buildNormalizedAppointmentImportRow>
      date: Date
      startTime: string
      endTime: string
      minutes: number
      cabin: string
      professional: string
      notes: string | null
      clientId: string
      serviceId: string
      serviceName: string
      clientName: string
      importKey: string
    }
  | {
      kind: 'missing-client'
      rowNumber: number
      row: ReturnType<typeof buildNormalizedAppointmentImportRow>
      date: Date
      startTime: string
      endTime: string
      minutes: number
      cabin: string
      professional: string
      notes: string | null
      serviceId: string
      serviceName: string
      missingClient: MissingAppointmentClientCandidate
    }
  | {
      kind: 'block' | 'error'
      rowNumber: number
      row: ReturnType<typeof buildNormalizedAppointmentImportRow>
      message: string
    }

export type PreparedActionableAppointmentImportRow = Extract<
  PreparedAppointmentImportRow,
  { kind: 'ready' | 'missing-client' }
>

export type AppointmentImportPreviewPayload = {
  totalRows: number
  ready: number
  detectedProfessionals: string[]
  duplicates: AppointmentImportDuplicateSummary[]
  missingClients: AppointmentImportMissingClientSummary[]
  blocks: AppointmentSpreadsheetIssue[]
  conflicts: AppointmentImportConflictSummary[]
  errors: AppointmentSpreadsheetIssue[]
}

export type AppointmentImportCommitSummary = AppointmentSpreadsheetResult & {
  createdClients: number
  detectedProfessionals: string[]
  duplicates: AppointmentImportDuplicateSummary[]
  conflicts: AppointmentImportConflictSummary[]
  blocks: AppointmentSpreadsheetIssue[]
  missingClients: AppointmentImportMissingClientSummary[]
}
