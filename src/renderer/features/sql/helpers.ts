import { formatCurrency } from '../../utils/format'
import { normalizeSearchText } from '../../utils/searchableOptions'
import type {
  LucyUser,
  SqlAnalysisResult,
  SqlAppointmentPreview,
  SqlSelectedSummary,
  SqlUserOption,
  SqlWarning,
  WizardStepId
} from './types'
import { stepWarningMap } from './viewModels'

export const formatMaybeCurrency = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : formatCurrency(Number(value))

export const formatMaybeNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : String(value)

export const normalizeOptionalText = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const parseNullableNumber = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export const buildUserOptions = (users: LucyUser[]): SqlUserOption[] =>
  users.map((user) => ({
    value: user.id,
    label: `${user.name}${user.username ? ` (${user.username})` : ''}${user.isActive ? '' : ' [inactivo]'}`
  }))

export const suggestUserId = (appointment: SqlAppointmentPreview, users: LucyUser[]) => {
  const candidates = [appointment.legacyProfessionalName, appointment.legacyProfessionalCode]
    .filter(Boolean)
    .map((value) => normalizeSearchText(value))

  if (candidates.length === 0) {
    return null
  }

  const match = users.find((user) =>
    candidates.includes(normalizeSearchText(user.name)) ||
    candidates.includes(normalizeSearchText(user.username || '')) ||
    candidates.includes(normalizeSearchText(user.email.split('@')[0]))
  )

  return match?.id ?? null
}

export const buildSelectedSummary = (analysis: SqlAnalysisResult | null): SqlSelectedSummary | null => {
  if (!analysis) return null

  return {
    clients: analysis.clients.filter((row) => row.selected).length,
    services: analysis.services.filter((row) => row.selected).length,
    products: analysis.products.filter((row) => row.selected).length,
    bonoTemplates: analysis.bonoTemplates.filter((row) => row.selected).length,
    clientBonos: analysis.clientBonos.filter((row) => row.selected).length,
    accountBalances: analysis.accountBalances.filter((row) => row.selected).length,
    appointments: analysis.appointments.filter((row) => row.selected).length,
    agendaBlocks: analysis.agendaBlocks.filter((row) => row.selected).length,
    agendaNotes: analysis.agendaNotes.filter((row) => row.selected).length,
    consents: analysis.consents.filter((row) => row.selected).length,
    signatures: analysis.signatures.filter((row) => row.selected).length,
    pendingUserMappings: analysis.appointments.filter(
      (row) => row.selected && row.legacyProfessionalCode && !row.targetUserId
    ).length
  }
}

export const getVisibleWarnings = (analysis: SqlAnalysisResult | null, currentStep: WizardStepId): SqlWarning[] => {
  if (!analysis) {
    return []
  }

  const warningStep = stepWarningMap[currentStep]
  if (!warningStep) {
    return analysis.warnings
  }

  return analysis.warnings.filter((warning) => warning.step === warningStep)
}
