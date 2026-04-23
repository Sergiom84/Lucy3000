import type { ReactNode } from 'react'

export type WizardStepId =
  | 'file'
  | 'clients'
  | 'services'
  | 'products'
  | 'bonoTemplates'
  | 'clientBonos'
  | 'accountBalances'
  | 'appointments'
  | 'summary'

export type SqlWarningStep =
  | 'file'
  | 'clients'
  | 'services'
  | 'products'
  | 'bonos'
  | 'clientBonos'
  | 'accountBalances'
  | 'appointments'
  | 'agendaBlocks'
  | 'agendaNotes'
  | 'assets'
  | 'unsupported'

export type SqlEventStep = WizardStepId | 'agendaBlocks' | 'agendaNotes' | 'assets' | 'unsupported'

export type SqlWarning = {
  code: string
  message: string
  severity: 'info' | 'warning'
  step: SqlWarningStep
  count?: number
}

export type SqlEditableRow = {
  id: string
  selected: boolean
  issues: string[]
}

export type SqlProfessionalPreview = {
  id: string
  code: string
  name: string
  shortName: string | null
  email: string | null
  isActive: boolean
}

export type SqlClientPreview = SqlEditableRow & {
  legacyId: string
  legacyClientNumber: string
  barcode: string | null
  fullName: string
  firstName: string
  lastName: string
  dni: string | null
  email: string | null
  phone: string | null
  mobilePhone: string | null
  landlinePhone: string | null
  address: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  birthDate: string | null
  registrationDate: string | null
  gender: string | null
  legacyProfessionalCode: string | null
  clientBrand: string | null
  appliedTariff: string | null
  text9A: string | null
  text9B: string | null
  text15: string | null
  text25: string | null
  text100: string | null
  integer1: number | null
  integer2: number | null
  giftVoucher: string | null
  notes: string | null
  photoRef: string | null
  photoSkinType: string | null
  webKey: string | null
  discountProfile: string | null
  globalClientNumber: string | null
  globalUpdated: boolean
  rejectPostal: boolean
  rejectSms: boolean
  rejectEmail: boolean
  excludeSurvey: boolean
  registeredSurvey: boolean
  legacySha1: string | null
  isActive: boolean
}

export type SqlServicePreview = SqlEditableRow & {
  legacyId: string
  code: string
  name: string
  description: string | null
  category: string | null
  screenCategory: string | null
  price: number | null
  durationMinutes: number | null
  taxRate: number | null
  isPack: boolean
  requiresProduct: boolean
  isActive: boolean
}

export type SqlProductPreview = SqlEditableRow & {
  legacyId: string
  legacyProductNumber: string
  sku: string
  barcode: string | null
  name: string
  description: string | null
  category: string | null
  brand: string | null
  supplier: string | null
  cost: number | null
  price: number | null
  stock: number | null
  minStock: number | null
  maxStock: number | null
  isActive: boolean
}

export type SqlBonoTemplatePreview = SqlEditableRow & {
  legacyServiceId: string
  serviceCode: string
  serviceName: string
  category: string | null
  slot: number
  totalSessions: number
  price: number | null
  isActive: boolean
}

export type SqlClientBonoPreview = SqlEditableRow & {
  legacyId: string
  legacyNumber: string
  clientNumber: string
  serviceCode: string | null
  description: string
  totalSessions: number
  consumedSessions: number
  remainingSessions: number
  legacyValue: number | null
}

export type SqlAccountBalancePreview = SqlEditableRow & {
  legacyId: string
  legacyNumber: string
  clientNumber: string
  description: string
  kind: string
  amount: number | null
  rawNominal: number | null
  rawConsumed: number | null
}

export type SqlAppointmentPreview = SqlEditableRow & {
  legacyId: string
  legacyClientNumber: string | null
  clientName: string
  phone: string | null
  serviceCode: string | null
  serviceName: string | null
  date: string
  startTime: string
  endTime: string | null
  durationMinutes: number | null
  cabin: string | null
  legacyProfessionalCode: string | null
  legacyProfessionalName: string | null
  secondaryProfessionalCode: string | null
  status: string | null
  notes: string | null
  legacyPackNumber: string | null
  targetUserId?: string | null
}

export type SqlAgendaBlockPreview = SqlEditableRow & {
  legacyId: string
  legacyClientNumber: string | null
  date: string
  startTime: string
  endTime: string | null
  durationMinutes: number | null
  cabin: string | null
  legacyProfessionalCode: string | null
  legacyProfessionalName: string | null
  notes: string | null
}

export type SqlAgendaNotePreview = SqlEditableRow & {
  legacyId: string
  dayKey: string
  legacyProfessionalCode: string | null
  legacyProfessionalName: string | null
  text: string
  isActive: boolean
  agenda: string | null
  stationNumber: number | null
}

export type SqlConsentPreview = SqlEditableRow & {
  legacyId: string
  clientNumber: string
  clientName: string | null
  health: string | null
  medication: string | null
  fileName: string
}

export type SqlSignaturePreview = SqlEditableRow & {
  legacyId: string
  clientNumber: string
  clientName: string | null
  docType: string | null
  fileName: string
  legacyServiceNumber: string | null
  signatureBase64: string | null
}

export type SqlPhotoReferencePreview = {
  tableName: string
  rowCount: number
}

export type SqlUnsupportedTablePreview = {
  tableName: string
  rowCount: number
}

export type SqlGeneratedClientAsset = {
  clientId: string
  clientName: string
  kind: 'consents' | 'documents'
  fileName: string
  originalName: string
  mimeType: string
  contentBase64: string
  takenAt?: string | null
}

export type SqlImportReport = {
  stage: 'commit'
  sourceName: string
  created: {
    legacyUsers: number
    services: number
    products: number
    clients: number
    bonoTemplates: number
    clientBonos: number
    accountBalances: number
    appointments: number
    agendaBlocks: number
    agendaNotes: number
  }
  omitted: {
    unselected: {
      clients: number
      services: number
      products: number
      bonoTemplates: number
      clientBonos: number
      accountBalances: number
      appointments: number
      agendaBlocks: number
      agendaNotes: number
      consents: number
      signatures: number
    }
    photoReferencesSkipped: number
    consentsWithoutClient: number
    signaturesWithoutClient: number
  }
  warnings: string[]
  unsupported: {
    tables: SqlUnsupportedTablePreview[]
  }
  assetsGenerated: {
    consents: number
    signatures: number
  }
  generatedAssets: SqlGeneratedClientAsset[]
  backupPolicy: {
    requiresEmptyBusinessDatabase: true
  }
}

export type SqlAnalysisResult = {
  sourceName: string
  encoding: 'utf8' | 'latin1'
  detectedTables: string[]
  summary: {
    professionals: number
    clients: number
    services: number
    products: number
    bonoTemplates: number
    clientBonos: number
    accountBalances: number
    appointments: number
    agendaBlocks: number
    agendaNotes: number
    consents: number
    signatures: number
    photoReferencesSkipped: number
    unsupportedPopulatedTables: number
    warnings: number
  }
  warnings: SqlWarning[]
  professionals: SqlProfessionalPreview[]
  clients: SqlClientPreview[]
  services: SqlServicePreview[]
  products: SqlProductPreview[]
  bonoTemplates: SqlBonoTemplatePreview[]
  clientBonos: SqlClientBonoPreview[]
  accountBalances: SqlAccountBalancePreview[]
  appointments: SqlAppointmentPreview[]
  agendaBlocks: SqlAgendaBlockPreview[]
  agendaNotes: SqlAgendaNotePreview[]
  consents: SqlConsentPreview[]
  signatures: SqlSignaturePreview[]
  photoReferencesSkipped: SqlPhotoReferencePreview[]
  unsupportedPopulatedTables: SqlUnsupportedTablePreview[]
}

export type SqlImportPayload = {
  sessionId: string
  sourceName: string
  professionals: SqlProfessionalPreview[]
  clients: SqlClientPreview[]
  services: SqlServicePreview[]
  products: SqlProductPreview[]
  bonoTemplates: SqlBonoTemplatePreview[]
  clientBonos: SqlClientBonoPreview[]
  accountBalances: SqlAccountBalancePreview[]
  appointments: SqlAppointmentPreview[]
  agendaBlocks: SqlAgendaBlockPreview[]
  agendaNotes: SqlAgendaNotePreview[]
  consents: SqlConsentPreview[]
  signatures: SqlSignaturePreview[]
  photoReferencesSkipped: SqlPhotoReferencePreview[]
  unsupportedPopulatedTables: SqlUnsupportedTablePreview[]
}

export type SqlEventLogEntry = {
  id: string
  occurredAt: string
  sessionId: string
  userId: string | null
  type: string
  step: SqlEventStep | null
  message: string
  payload?: Record<string, unknown>
}

export type LucyUser = {
  id: string
  name: string
  email: string
  username?: string | null
  isActive: boolean
}

export type SqlSelectedSummary = {
  clients: number
  services: number
  products: number
  bonoTemplates: number
  clientBonos: number
  accountBalances: number
  appointments: number
  agendaBlocks: number
  agendaNotes: number
  consents: number
  signatures: number
  pendingUserMappings: number
}

export type SqlUserOption = {
  value: string
  label: string
}

export type SqlTrackEventPayload = {
  type: string
  step?: SqlEventStep | null
  message: string
  payload?: Record<string, unknown>
}

export type SqlEditableStepKey =
  | 'clients'
  | 'services'
  | 'products'
  | 'bonoTemplates'
  | 'clientBonos'
  | 'accountBalances'
  | 'appointments'

export type EditableColumn<T> = {
  header: string
  className?: string
  render: (row: T) => ReactNode
}

export type EditableDataStepProps<T extends SqlEditableRow> = {
  stepId: WizardStepId
  title: string
  description: string
  rows: T[]
  onRowsChange: (rows: T[]) => void
  columns: EditableColumn<T>[]
  searchPlaceholder: string
  getLabel: (row: T) => string
  getSearchText: (row: T) => string
  renderEditor: (row: T, updateRow: (patch: Partial<T>) => void) => ReactNode
  extraSummary?: Array<{ label: string; value: string; tone?: 'default' | 'warning' | 'danger' | 'success' }>
  emptyMessage: string
  onSelectionCountChange?: (payload: { selectedCount: number; totalRows: number }) => void
  onBulkToggle?: (payload: { mode: 'select' | 'deselect'; affectedCount: number }) => void
}
