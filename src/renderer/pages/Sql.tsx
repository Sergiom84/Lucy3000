import { type Dispatch, type ReactNode, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Gift,
  Package,
  RefreshCcw,
  Scissors,
  Search,
  ShieldAlert,
  Upload,
  Users,
  Wallet
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { filterRankedItems, normalizeSearchText } from '../utils/searchableOptions'
import { formatCurrency } from '../utils/format'

type SqlWarning = {
  code: string
  message: string
  severity: 'info' | 'warning'
  step: 'file' | 'clients' | 'services' | 'products' | 'bonos' | 'clientBonos' | 'accountBalances' | 'appointments'
  count?: number
}

type SqlEditableRow = {
  id: string
  selected: boolean
  issues: string[]
}

type SqlProfessionalPreview = {
  id: string
  code: string
  name: string
  shortName: string | null
  email: string | null
  isActive: boolean
}

type SqlClientPreview = SqlEditableRow & {
  legacyId: string
  legacyClientNumber: string
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
  notes: string | null
  photoRef: string | null
  isActive: boolean
}

type SqlServicePreview = SqlEditableRow & {
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

type SqlProductPreview = SqlEditableRow & {
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

type SqlBonoTemplatePreview = SqlEditableRow & {
  legacyServiceId: string
  serviceCode: string
  serviceName: string
  category: string | null
  slot: number
  totalSessions: number
  price: number | null
  isActive: boolean
}

type SqlClientBonoPreview = SqlEditableRow & {
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

type SqlAccountBalancePreview = SqlEditableRow & {
  legacyId: string
  legacyNumber: string
  clientNumber: string
  description: string
  kind: string
  amount: number | null
  rawNominal: number | null
  rawConsumed: number | null
}

type SqlAppointmentPreview = SqlEditableRow & {
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
  isInternalBlock: boolean
  targetUserId?: string | null
}

type SqlAnalysisResult = {
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
}

type SqlEventLogEntry = {
  id: string
  occurredAt: string
  sessionId: string
  userId: string | null
  type: string
  step: WizardStepId | null
  message: string
  payload?: Record<string, unknown>
}

type LucyUser = {
  id: string
  name: string
  email: string
  username?: string | null
  isActive: boolean
}

type WizardStepId =
  | 'file'
  | 'clients'
  | 'services'
  | 'products'
  | 'bonoTemplates'
  | 'clientBonos'
  | 'accountBalances'
  | 'appointments'
  | 'summary'

type WizardStep = {
  id: WizardStepId
  label: string
  shortLabel: string
  icon: typeof Database
}

type EditableColumn<T> = {
  header: string
  className?: string
  render: (row: T) => ReactNode
}

type EditableDataStepProps<T extends SqlEditableRow> = {
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
  extraSummary?: Array<{ label: string; value: string; tone?: string }>
  emptyMessage: string
  onSelectionCountChange?: (payload: { selectedCount: number; totalRows: number }) => void
  onBulkToggle?: (payload: { mode: 'select' | 'deselect'; affectedCount: number }) => void
}

const PAGE_SIZE = 25

const steps: WizardStep[] = [
  { id: 'file', label: 'Archivo', shortLabel: 'Archivo', icon: Database },
  { id: 'clients', label: 'Clientes', shortLabel: 'Clientes', icon: Users },
  { id: 'services', label: 'Tratamientos', shortLabel: 'Trat.', icon: Scissors },
  { id: 'products', label: 'Productos', shortLabel: 'Prod.', icon: Package },
  { id: 'bonoTemplates', label: 'Bonos', shortLabel: 'Bonos', icon: Gift },
  { id: 'clientBonos', label: 'Bonos cliente', shortLabel: 'Bonos cli.', icon: Gift },
  { id: 'accountBalances', label: 'Abonos cliente', shortLabel: 'Abonos', icon: Wallet },
  { id: 'appointments', label: 'Citas', shortLabel: 'Citas', icon: CalendarDays },
  { id: 'summary', label: 'Resumen', shortLabel: 'Resumen', icon: CheckCircle2 }
]

const formatMaybeCurrency = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : formatCurrency(Number(value))

const formatMaybeNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : String(value)

const normalizeOptionalText = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const parseNullableNumber = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const suggestUserId = (appointment: SqlAppointmentPreview, users: LucyUser[]) => {
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

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: string }) {
  const toneClassName =
    tone === 'warning'
      ? 'text-amber-600'
      : tone === 'danger'
        ? 'text-red-600'
        : tone === 'success'
          ? 'text-green-600'
          : 'text-gray-900 dark:text-white'

  return (
    <div className="card">
      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClassName}`}>{value}</p>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'email' | 'date' | 'time'
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step = '1',
  placeholder
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  step?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={(event) => onChange(parseNullableNumber(event.target.value))}
        placeholder={placeholder}
        className="input"
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 4
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="input resize-none"
      />
    </label>
  )
}

function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string | null | undefined
  onChange: (value: string | null) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? event.target.value : null)}
        className="input"
      >
        <option value="">Sin asignar</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function EditableDataStep<T extends SqlEditableRow>({
  stepId,
  title,
  description: _description,
  rows,
  onRowsChange,
  columns,
  searchPlaceholder,
  getLabel,
  getSearchText,
  renderEditor,
  extraSummary,
  emptyMessage,
  onSelectionCountChange,
  onBulkToggle
}: EditableDataStepProps<T>) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(rows[0]?.id ?? null)
  const previousSelectedCountRef = useRef<number | null>(null)

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedRowId(null)
      return
    }

    if (!selectedRowId || !rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(rows[0].id)
    }
  }, [rows, selectedRowId])

  const filteredRows = useMemo(() => {
    if (!search.trim()) {
      return rows
    }

    return filterRankedItems(rows, search, (row) => ({
      label: getLabel(row),
      searchText: getSearchText(row)
    }))
  }, [getLabel, getSearchText, rows, search])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null
  const selectedCount = rows.filter((row) => row.selected).length
  const issuesCount = rows.reduce((count, row) => count + row.issues.length, 0)
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => row.selected)

  const updateRow = (id: string, patch: Partial<T>) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const toggleVisibleRows = () => {
    const visibleIds = new Set(visibleRows.map((row) => row.id))
    const mode = allVisibleSelected ? 'deselect' : 'select'
    onRowsChange(
      rows.map((row) => (visibleIds.has(row.id) ? { ...row, selected: !allVisibleSelected } : row))
    )
    onBulkToggle?.({ mode, affectedCount: visibleRows.length })
  }

  useEffect(() => {
    if (previousSelectedCountRef.current === null) {
      previousSelectedCountRef.current = selectedCount
      return
    }

    if (previousSelectedCountRef.current !== selectedCount) {
      onSelectionCountChange?.({ selectedCount, totalRows: rows.length })
      previousSelectedCountRef.current = selectedCount
    }
  }, [onSelectionCountChange, rows.length, selectedCount, stepId])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard label="Total" value={String(rows.length)} />
        <SummaryCard label="Seleccionados" value={String(selectedCount)} tone="success" />
        <SummaryCard label="Incidencias" value={String(issuesCount)} tone={issuesCount > 0 ? 'warning' : 'default'} />
        {extraSummary?.map((item) => (
          <SummaryCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </div>

      <div className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="input pl-10"
            />
          </div>

          <button onClick={toggleVisibleRows} className="btn btn-secondary">
            {allVisibleSelected ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.85fr)]">
        <div className="card min-w-0">
          {filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-14">Usar</th>
                      {columns.map((column) => (
                        <th key={column.header} className={column.className}>
                          {column.header}
                        </th>
                      ))}
                      <th className="w-24 text-right">Avisos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.id}
                        className={`cursor-pointer ${
                          row.id === selectedRowId ? 'bg-primary-50/70 dark:bg-primary-900/10' : ''
                        }`}
                        onClick={() => setSelectedRowId(row.id)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) => updateRow(row.id, { selected: event.target.checked } as Partial<T>)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        </td>
                        {columns.map((column) => (
                          <td key={column.header} className={column.className}>
                            {column.render(row)}
                          </td>
                        ))}
                        <td className="text-right">
                          {row.issues.length > 0 ? (
                            <span className="badge badge-warning">{row.issues.length}</span>
                          ) : (
                            <span className="text-sm text-gray-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                <p>
                  Mostrando {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} de{' '}
                  {filteredRows.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage === 1}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </button>
                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    Siguiente
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card h-fit">
          {selectedRow ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{getLabel(selectedRow)}</h3>
                {selectedRow.issues.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {selectedRow.issues.map((issue) => (
                      <div
                        key={issue}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
                      >
                        {issue}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {renderEditor(selectedRow, (patch) => updateRow(selectedRow.id, patch))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un registro para revisarlo o editarlo.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Sql() {
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<SqlAnalysisResult | null>(null)
  const [currentStep, setCurrentStep] = useState<WizardStepId>('file')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<LucyUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [eventEntries, setEventEntries] = useState<SqlEventLogEntry[]>([])
  const [eventLogPath, setEventLogPath] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [sessionId] = useState(() => `sql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const previousStepRef = useRef<WizardStepId>('file')

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: `${user.name}${user.username ? ` (${user.username})` : ''}${user.isActive ? '' : ' [inactivo]'}`
      })),
    [users]
  )

  useEffect(() => {
    const loadUsers = async () => {
      setUsersLoading(true)
      try {
        const response = await api.get('/users')
        setUsers(response.data)
      } catch (error) {
        console.error('Error fetching users for SQL wizard:', error)
        toast.error('No se pudieron cargar los usuarios de Lucy3000')
      } finally {
        setUsersLoading(false)
      }
    }

    void loadUsers()
  }, [])

  const refreshEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const response = await api.get('/sql/events', {
        params: {
          sessionId,
          limit: 30
        }
      })

      setEventEntries(response.data.entries || [])
      setEventLogPath(response.data.filePath || null)
    } catch (error) {
      console.error('Error fetching SQL events:', error)
    } finally {
      setEventsLoading(false)
    }
  }, [sessionId])

  const trackEvent = useCallback(
    async (payload: {
      type: string
      step?: WizardStepId | null
      message: string
      payload?: Record<string, unknown>
    }) => {
      try {
        const response = await api.post('/sql/events', {
          sessionId,
          type: payload.type,
          step: payload.step ?? null,
          message: payload.message,
          payload: payload.payload
        })

        const createdEntry: SqlEventLogEntry = response.data
        setEventEntries((current) => [createdEntry, ...current].slice(0, 30))
      } catch (error) {
        console.error('Error creating SQL event:', error)
      }
    },
    [sessionId]
  )

  useEffect(() => {
    void refreshEvents()
    void trackEvent({
      type: 'page_opened',
      step: 'file',
      message: 'Se abrió el módulo SQL',
      payload: {
        sessionId
      }
    })
  }, [refreshEvents, sessionId, trackEvent])

  useEffect(() => {
    if (!analysis || users.length === 0) {
      return
    }

    if (!analysis.appointments.some((appointment) => appointment.targetUserId === undefined)) {
      return
    }

    setAnalysis((current) => {
      if (!current) return current

      return {
        ...current,
        appointments: current.appointments.map((appointment) => ({
          ...appointment,
          targetUserId:
            appointment.targetUserId !== undefined ? appointment.targetUserId : suggestUserId(appointment, users)
        }))
      }
    })
  }, [analysis, users])

  useEffect(() => {
    if (previousStepRef.current === currentStep) {
      return
    }

    const previousStep = previousStepRef.current
    previousStepRef.current = currentStep

    void trackEvent({
      type: 'step_changed',
      step: currentStep,
      message: `Cambio de paso: ${previousStep} -> ${currentStep}`,
      payload: {
        previousStep,
        currentStep
      }
    })
  }, [currentStep, trackEvent])

  const currentStepIndex = steps.findIndex((step) => step.id === currentStep)
  const stepEnabled = (stepId: WizardStepId) => stepId === 'file' || Boolean(analysis)

  const selectedSummary = useMemo(() => {
    if (!analysis) return null

    return {
      clients: analysis.clients.filter((row) => row.selected).length,
      services: analysis.services.filter((row) => row.selected).length,
      products: analysis.products.filter((row) => row.selected).length,
      bonoTemplates: analysis.bonoTemplates.filter((row) => row.selected).length,
      clientBonos: analysis.clientBonos.filter((row) => row.selected).length,
      accountBalances: analysis.accountBalances.filter((row) => row.selected).length,
      appointments: analysis.appointments.filter((row) => row.selected).length,
      pendingUserMappings: analysis.appointments.filter(
        (row) => row.selected && !row.isInternalBlock && row.legacyProfessionalCode && !row.targetUserId
      ).length
    }
  }, [analysis])

  const handleAnalyze = async () => {
    if (!file) {
      toast.error('Selecciona un archivo .sql antes de analizar')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setLoading(true)
    await trackEvent({
      type: 'analyze_started',
      step: 'file',
      message: `Se inicia el análisis de ${file.name}`,
      payload: {
        fileName: file.name,
        fileSize: file.size
      }
    })

    try {
      const response = await api.post('/sql/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      const nextAnalysis: SqlAnalysisResult = response.data
      const withMapping =
        users.length > 0
          ? {
              ...nextAnalysis,
              appointments: nextAnalysis.appointments.map((appointment) => ({
                ...appointment,
                targetUserId: suggestUserId(appointment, users)
              }))
            }
          : nextAnalysis

      setAnalysis(withMapping)
      setCurrentStep('clients')
      await trackEvent({
        type: 'analyze_completed',
        step: 'file',
        message: `Análisis completado para ${file.name}`,
        payload: {
          fileName: file.name,
          summary: nextAnalysis.summary,
          warnings: nextAnalysis.warnings.length
        }
      })
      toast.success('Archivo SQL analizado correctamente')
    } catch (error: any) {
      console.error('SQL analyze error:', error)
      await trackEvent({
        type: 'analyze_failed',
        step: 'file',
        message: `Error analizando ${file.name}`,
        payload: {
          fileName: file.name,
          error: error.response?.data?.error || error.message || 'Error desconocido'
        }
      })
      toast.error(error.response?.data?.error || 'No se pudo analizar el archivo SQL')
    } finally {
      setLoading(false)
    }
  }

  const goToStep = (stepId: WizardStepId) => {
    if (!stepEnabled(stepId)) return
    setCurrentStep(stepId)
  }

  const moveStep = (direction: -1 | 1) => {
    const nextStep = steps[currentStepIndex + direction]
    if (!nextStep || !stepEnabled(nextStep.id)) return
    setCurrentStep(nextStep.id)
  }

  return (
    <SqlWizardContent
      file={file}
      setFile={setFile}
      analysis={analysis}
      setAnalysis={setAnalysis}
      currentStep={currentStep}
      currentStepIndex={currentStepIndex}
      goToStep={goToStep}
      stepEnabled={stepEnabled}
      moveStep={moveStep}
      loading={loading}
      users={users}
      usersLoading={usersLoading}
      userOptions={userOptions}
      handleAnalyze={handleAnalyze}
      selectedSummary={selectedSummary}
      sessionId={sessionId}
      eventEntries={eventEntries}
      eventLogPath={eventLogPath}
      eventsLoading={eventsLoading}
      refreshEvents={refreshEvents}
      trackEvent={trackEvent}
    />
  )
}

type SqlSelectedSummary = {
  clients: number
  services: number
  products: number
  bonoTemplates: number
  clientBonos: number
  accountBalances: number
  appointments: number
  pendingUserMappings: number
}

type SqlWizardContentProps = {
  file: File | null
  setFile: Dispatch<SetStateAction<File | null>>
  analysis: SqlAnalysisResult | null
  setAnalysis: Dispatch<SetStateAction<SqlAnalysisResult | null>>
  currentStep: WizardStepId
  currentStepIndex: number
  goToStep: (stepId: WizardStepId) => void
  stepEnabled: (stepId: WizardStepId) => boolean
  moveStep: (direction: -1 | 1) => void
  loading: boolean
  users: LucyUser[]
  usersLoading: boolean
  userOptions: Array<{ value: string; label: string }>
  handleAnalyze: () => Promise<void>
  selectedSummary: SqlSelectedSummary | null
  sessionId: string
  eventEntries: SqlEventLogEntry[]
  eventLogPath: string | null
  eventsLoading: boolean
  refreshEvents: () => Promise<void>
  trackEvent: (payload: {
    type: string
    step?: WizardStepId | null
    message: string
    payload?: Record<string, unknown>
  }) => Promise<void>
}

const stepWarningMap: Record<WizardStepId, SqlWarning['step'] | null> = {
  file: 'file',
  clients: 'clients',
  services: 'services',
  products: 'products',
  bonoTemplates: 'bonos',
  clientBonos: 'clientBonos',
  accountBalances: 'accountBalances',
  appointments: 'appointments',
  summary: null
}

function SqlWizardContent({
  file,
  setFile,
  analysis,
  setAnalysis,
  currentStep,
  currentStepIndex,
  goToStep,
  stepEnabled,
  moveStep,
  loading,
  users,
  usersLoading,
  userOptions,
  handleAnalyze,
  selectedSummary,
  sessionId,
  eventEntries,
  eventLogPath,
  eventsLoading,
  refreshEvents,
  trackEvent
}: SqlWizardContentProps) {
  const updateRows = <
    K extends
      | 'clients'
      | 'services'
      | 'products'
      | 'bonoTemplates'
      | 'clientBonos'
      | 'accountBalances'
      | 'appointments'
  >(
    key: K,
    rows: SqlAnalysisResult[K]
  ) => {
    setAnalysis((current) => (current ? { ...current, [key]: rows } : current))
  }

  const visibleWarnings = useMemo(() => {
    if (!analysis) {
      return []
    }

    const warningStep = stepWarningMap[currentStep]
    if (!warningStep) {
      return analysis.warnings
    }

    return analysis.warnings.filter((warning) => warning.step === warningStep)
  }, [analysis, currentStep])

  let currentContent: ReactNode = null

  if (currentStep === 'file') {
    currentContent = (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="card space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">1. Cargar el archivo SQL</h2>
          </div>

          <label className="block rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/40">
            <span className="mb-3 flex items-center gap-3 text-base font-semibold text-gray-900 dark:text-white">
              <Upload className="h-5 w-5 text-primary-600" />
              Archivo compatible
            </span>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Selecciona un <code>.sql</code> generado por el sistema anterior. Esta primera fase está pensada
              para <code>01dat.sql</code>.
            </p>
            <input
              type="file"
              accept=".sql,text/plain,application/sql"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                setFile(nextFile)
                setAnalysis(null)
                if (nextFile) {
                  void trackEvent({
                    type: 'file_selected',
                    step: 'file',
                    message: `Archivo seleccionado: ${nextFile.name}`,
                    payload: {
                      fileName: nextFile.name,
                      fileSize: nextFile.size
                    }
                  })
                }
              }}
              className="input"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={!file || loading}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Analizar SQL
                </>
              )}
            </button>

            {analysis ? (
              <button type="button" onClick={() => void handleAnalyze()} disabled={loading} className="btn btn-secondary">
                Reanalizar
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard label="Archivo" value={file?.name ?? 'Sin seleccionar'} />
            <SummaryCard label="Usuarios Lucy" value={usersLoading ? '...' : String(users.length)} />
            <SummaryCard label="Estado" value={analysis ? 'Analizado' : 'Pendiente'} tone={analysis ? 'success' : 'warning'} />
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            <p>
              Sesión de log: <code>{sessionId}</code>
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {analysis ? (
            <div className="card space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Diagnóstico del archivo</h3>

              <div className="grid grid-cols-2 gap-4">
                <SummaryCard label="Origen" value={analysis.sourceName} />
                <SummaryCard label="Codificación" value={analysis.encoding} />
                <SummaryCard label="Clientes" value={String(analysis.summary.clients)} />
                <SummaryCard label="Tratamientos" value={String(analysis.summary.services)} />
                <SummaryCard label="Productos" value={String(analysis.summary.products)} />
                <SummaryCard label="Bonos plantilla" value={String(analysis.summary.bonoTemplates)} />
                <SummaryCard label="Bonos cliente" value={String(analysis.summary.clientBonos)} />
                <SummaryCard label="Abonos cliente" value={String(analysis.summary.accountBalances)} />
                <SummaryCard label="Citas" value={String(analysis.summary.appointments)} />
                <SummaryCard
                  label="Avisos"
                  value={String(analysis.summary.warnings)}
                  tone={analysis.summary.warnings > 0 ? 'warning' : 'success'}
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Tablas detectadas</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.detectedTables.map((tableName) => (
                    <span key={tableName} className="badge badge-primary">
                      {tableName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (currentStep === 'clients' && analysis) {
    currentContent = (
      <EditableDataStep
        stepId="clients"
        title="2. Clientes"
        description="Revisa los clientes detectados, decide cuáles conservar y corrige los datos que Lucy3000 deberá guardar."
        rows={analysis.clients}
        onRowsChange={(rows) => updateRows('clients', rows)}
        searchPlaceholder="Buscar por nombre, código legacy, DNI, email, teléfono o notas..."
        getLabel={(row) => row.fullName || row.legacyClientNumber}
        getSearchText={(row) =>
          [
            row.legacyClientNumber,
            row.fullName,
            row.dni,
            row.email,
            row.phone,
            row.mobilePhone,
            row.landlinePhone,
            row.city,
            row.clientBrand,
            row.notes
          ]
            .filter(Boolean)
            .join(' ')
        }
        columns={[
          {
            header: 'Cliente',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.fullName || '-'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">#{row.legacyClientNumber}</p>
              </div>
            )
          },
          {
            header: 'Contacto',
            render: (row) => (
              <div>
                <p>{row.phone || row.mobilePhone || row.landlinePhone || '-'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.email || 'Sin email'}</p>
              </div>
            )
          },
          {
            header: 'DNI',
            render: (row) => row.dni || '-'
          },
          {
            header: 'Ciudad',
            render: (row) => row.city || '-'
          },
          {
            header: 'Activa',
            render: (row) => (
              <span className={`badge ${row.isActive ? 'badge-success' : 'badge-warning'}`}>
                {row.isActive ? 'Sí' : 'No'}
              </span>
            )
          }
        ]}
        extraSummary={[
          {
            label: 'Con email',
            value: String(analysis.clients.filter((row) => row.email).length)
          },
          {
            label: 'Inactivos',
            value: String(analysis.clients.filter((row) => !row.isActive).length),
            tone: analysis.clients.some((row) => !row.isActive) ? 'warning' : 'default'
          }
        ]}
        emptyMessage="No hay clientes que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'clients',
            message: `Clientes seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'clients',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} clientes visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este cliente" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Código legacy" value={row.legacyClientNumber} onChange={(value) => updateRow({ legacyClientNumber: value })} />
              <TextField label="DNI" value={row.dni} onChange={(value) => updateRow({ dni: normalizeOptionalText(value) })} />
              <TextField label="Nombre completo" value={row.fullName} onChange={(value) => updateRow({ fullName: value })} />
              <TextField label="Nombre" value={row.firstName} onChange={(value) => updateRow({ firstName: value })} />
              <TextField label="Apellidos" value={row.lastName} onChange={(value) => updateRow({ lastName: value })} />
              <TextField label="Email" type="email" value={row.email} onChange={(value) => updateRow({ email: normalizeOptionalText(value) })} />
              <TextField label="Teléfono" value={row.phone} onChange={(value) => updateRow({ phone: normalizeOptionalText(value) })} />
              <TextField label="Móvil" value={row.mobilePhone} onChange={(value) => updateRow({ mobilePhone: normalizeOptionalText(value) })} />
              <TextField label="Fijo" value={row.landlinePhone} onChange={(value) => updateRow({ landlinePhone: normalizeOptionalText(value) })} />
              <TextField label="Fecha nacimiento" type="date" value={row.birthDate} onChange={(value) => updateRow({ birthDate: normalizeOptionalText(value) })} />
              <TextField label="Fecha alta" type="date" value={row.registrationDate} onChange={(value) => updateRow({ registrationDate: normalizeOptionalText(value) })} />
              <TextField label="Sexo" value={row.gender} onChange={(value) => updateRow({ gender: normalizeOptionalText(value) })} />
              <TextField label="Dirección" value={row.address} onChange={(value) => updateRow({ address: normalizeOptionalText(value) })} />
              <TextField label="Ciudad" value={row.city} onChange={(value) => updateRow({ city: normalizeOptionalText(value) })} />
              <TextField label="Provincia" value={row.province} onChange={(value) => updateRow({ province: normalizeOptionalText(value) })} />
              <TextField label="Código postal" value={row.postalCode} onChange={(value) => updateRow({ postalCode: normalizeOptionalText(value) })} />
              <TextField label="Profesional legacy" value={row.legacyProfessionalCode} onChange={(value) => updateRow({ legacyProfessionalCode: normalizeOptionalText(value) })} />
              <TextField label="Marca cliente" value={row.clientBrand} onChange={(value) => updateRow({ clientBrand: normalizeOptionalText(value) })} />
              <TextField label="Tarifa aplicada" value={row.appliedTariff} onChange={(value) => updateRow({ appliedTariff: normalizeOptionalText(value) })} />
              <TextField label="Referencia foto" value={row.photoRef} onChange={(value) => updateRow({ photoRef: normalizeOptionalText(value) })} />
            </div>

            <TextAreaField label="Notas" value={row.notes} onChange={(value) => updateRow({ notes: normalizeOptionalText(value) })} />
            <CheckboxField label="Cliente activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'services' && analysis) {
    currentContent = (
      <EditableDataStep
        stepId="services"
        title="3. Tratamientos"
        description="Normaliza el catálogo de tratamientos antes de usarlo para bonos y citas."
        rows={analysis.services}
        onRowsChange={(rows) => updateRows('services', rows)}
        searchPlaceholder="Buscar por código, nombre, descripción o categoría..."
        getLabel={(row) => `${row.code} · ${row.name}`}
        getSearchText={(row) =>
          [row.code, row.name, row.description, row.category, row.screenCategory].filter(Boolean).join(' ')
        }
        columns={[
          {
            header: 'Código',
            render: (row) => row.code
          },
          {
            header: 'Tratamiento',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.category || 'Sin categoría'}</p>
              </div>
            )
          },
          {
            header: 'Duración',
            render: (row) => (row.durationMinutes ? `${row.durationMinutes} min` : '-')
          },
          {
            header: 'PVP',
            render: (row) => formatMaybeCurrency(row.price)
          },
          {
            header: 'Pack',
            render: (row) => (
              <span className={`badge ${row.isPack ? 'badge-primary' : 'badge-info'}`}>{row.isPack ? 'Sí' : 'No'}</span>
            )
          }
        ]}
        extraSummary={[
          {
            label: 'Con duración',
            value: String(analysis.services.filter((row) => row.durationMinutes).length)
          },
          {
            label: 'Packs',
            value: String(analysis.services.filter((row) => row.isPack).length)
          }
        ]}
        emptyMessage="No hay tratamientos que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'services',
            message: `Tratamientos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'services',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} tratamientos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este tratamiento" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Código" value={row.code} onChange={(value) => updateRow({ code: value })} />
              <TextField label="Nombre" value={row.name} onChange={(value) => updateRow({ name: value })} />
              <TextField label="Descripción" value={row.description} onChange={(value) => updateRow({ description: normalizeOptionalText(value) })} />
              <TextField label="Categoría" value={row.category} onChange={(value) => updateRow({ category: normalizeOptionalText(value) })} />
              <TextField label="Categoría pantalla" value={row.screenCategory} onChange={(value) => updateRow({ screenCategory: normalizeOptionalText(value) })} />
              <NumberField label="Precio" value={row.price} onChange={(price) => updateRow({ price })} step="0.01" />
              <NumberField label="Duración (min)" value={row.durationMinutes} onChange={(durationMinutes) => updateRow({ durationMinutes })} />
              <NumberField label="IVA" value={row.taxRate} onChange={(taxRate) => updateRow({ taxRate })} step="0.01" />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <CheckboxField label="Es pack" checked={row.isPack} onChange={(isPack) => updateRow({ isPack })} />
              <CheckboxField
                label="Requiere producto"
                checked={row.requiresProduct}
                onChange={(requiresProduct) => updateRow({ requiresProduct })}
              />
              <CheckboxField label="Activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
            </div>
          </div>
        )}
      />
    )
  }

  if (currentStep === 'products' && analysis) {
    currentContent = (
      <EditableDataStep
        stepId="products"
        title="4. Productos"
        description="Ajusta el catálogo de productos, stock y referencias antes de incorporarlo."
        rows={analysis.products}
        onRowsChange={(rows) => updateRows('products', rows)}
        searchPlaceholder="Buscar por SKU, nombre, marca, categoría, proveedor o código..."
        getLabel={(row) => `${row.sku} · ${row.name}`}
        getSearchText={(row) =>
          [
            row.sku,
            row.name,
            row.brand,
            row.category,
            row.supplier,
            row.barcode,
            row.description,
            row.legacyProductNumber
          ]
            .filter(Boolean)
            .join(' ')
        }
        columns={[
          {
            header: 'SKU',
            render: (row) => row.sku
          },
          {
            header: 'Producto',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.brand || 'Sin marca'}</p>
              </div>
            )
          },
          {
            header: 'Categoría',
            render: (row) => row.category || '-'
          },
          {
            header: 'Stock',
            render: (row) => formatMaybeNumber(row.stock)
          },
          {
            header: 'PVP',
            render: (row) => formatMaybeCurrency(row.price)
          }
        ]}
        extraSummary={[
          {
            label: 'Con stock',
            value: String(analysis.products.filter((row) => (row.stock ?? 0) > 0).length)
          },
          {
            label: 'Con proveedor',
            value: String(analysis.products.filter((row) => row.supplier).length)
          }
        ]}
        emptyMessage="No hay productos que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'products',
            message: `Productos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'products',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} productos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este producto" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Código legacy" value={row.legacyProductNumber} onChange={(value) => updateRow({ legacyProductNumber: value })} />
              <TextField label="SKU" value={row.sku} onChange={(value) => updateRow({ sku: value })} />
              <TextField label="Código de barras" value={row.barcode} onChange={(value) => updateRow({ barcode: normalizeOptionalText(value) })} />
              <TextField label="Nombre" value={row.name} onChange={(value) => updateRow({ name: value })} />
              <TextField label="Categoría" value={row.category} onChange={(value) => updateRow({ category: normalizeOptionalText(value) })} />
              <TextField label="Marca" value={row.brand} onChange={(value) => updateRow({ brand: normalizeOptionalText(value) })} />
              <TextField label="Proveedor" value={row.supplier} onChange={(value) => updateRow({ supplier: normalizeOptionalText(value) })} />
              <NumberField label="Coste" value={row.cost} onChange={(cost) => updateRow({ cost })} step="0.01" />
              <NumberField label="Precio venta" value={row.price} onChange={(price) => updateRow({ price })} step="0.01" />
              <NumberField label="Stock" value={row.stock} onChange={(stock) => updateRow({ stock })} />
              <NumberField label="Stock mínimo" value={row.minStock} onChange={(minStock) => updateRow({ minStock })} />
              <NumberField label="Stock máximo" value={row.maxStock} onChange={(maxStock) => updateRow({ maxStock })} />
            </div>

            <TextAreaField label="Descripción" value={row.description} onChange={(value) => updateRow({ description: normalizeOptionalText(value) })} />
            <CheckboxField label="Producto activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'bonoTemplates' && analysis) {
    currentContent = (
      <EditableDataStep
        stepId="bonoTemplates"
        title="5. Bonos"
        description="Revisa las plantillas de bonos derivadas del catálogo legacy."
        rows={analysis.bonoTemplates}
        onRowsChange={(rows) => updateRows('bonoTemplates', rows)}
        searchPlaceholder="Buscar por tratamiento, código o categoría..."
        getLabel={(row) => `${row.serviceName} · ${row.totalSessions} sesiones`}
        getSearchText={(row) => [row.serviceCode, row.serviceName, row.category].filter(Boolean).join(' ')}
        columns={[
          {
            header: 'Tratamiento',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.serviceName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.serviceCode}</p>
              </div>
            )
          },
          {
            header: 'Slot',
            render: (row) => String(row.slot)
          },
          {
            header: 'Sesiones',
            render: (row) => String(row.totalSessions)
          },
          {
            header: 'Precio',
            render: (row) => formatMaybeCurrency(row.price)
          }
        ]}
        extraSummary={[
          {
            label: 'Bonos activos',
            value: String(analysis.bonoTemplates.filter((row) => row.isActive).length)
          }
        ]}
        emptyMessage="No hay bonos que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'bonoTemplates',
            message: `Bonos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'bonoTemplates',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} bonos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este bono" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Código tratamiento" value={row.serviceCode} onChange={(value) => updateRow({ serviceCode: value })} />
              <TextField label="Nombre tratamiento" value={row.serviceName} onChange={(value) => updateRow({ serviceName: value })} />
              <TextField label="Categoría" value={row.category} onChange={(value) => updateRow({ category: normalizeOptionalText(value) })} />
              <NumberField label="Slot legacy" value={row.slot} onChange={(slot) => updateRow({ slot: slot ?? row.slot })} />
              <NumberField label="Sesiones" value={row.totalSessions} onChange={(totalSessions) => updateRow({ totalSessions: totalSessions ?? row.totalSessions })} />
              <NumberField label="Precio" value={row.price} onChange={(price) => updateRow({ price })} step="0.01" />
            </div>

            <CheckboxField label="Bono activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'clientBonos' && analysis) {
    currentContent = (
      <EditableDataStep
        stepId="clientBonos"
        title="6. Bonos del cliente"
        description="Cada registro representa un bono o pack que ya tenía un cliente en el sistema anterior."
        rows={analysis.clientBonos}
        onRowsChange={(rows) => updateRows('clientBonos', rows)}
        searchPlaceholder="Buscar por cliente, descripción, número legacy o código de tratamiento..."
        getLabel={(row) => `${row.clientNumber} · ${row.description}`}
        getSearchText={(row) => [row.clientNumber, row.description, row.serviceCode, row.legacyNumber].filter(Boolean).join(' ')}
        columns={[
          {
            header: 'Cliente',
            render: (row) => row.clientNumber
          },
          {
            header: 'Bono',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.description}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.serviceCode || 'Sin código'}</p>
              </div>
            )
          },
          {
            header: 'Restantes',
            render: (row) => `${row.remainingSessions}/${row.totalSessions}`
          },
          {
            header: 'Valor',
            render: (row) => formatMaybeCurrency(row.legacyValue)
          }
        ]}
        extraSummary={[
          {
            label: 'Con saldo',
            value: String(analysis.clientBonos.filter((row) => row.remainingSessions > 0).length)
          }
        ]}
        emptyMessage="No hay bonos de cliente que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'clientBonos',
            message: `Bonos de cliente seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'clientBonos',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} bonos de cliente visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este bono de cliente" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Número legacy" value={row.legacyNumber} onChange={(value) => updateRow({ legacyNumber: value })} />
              <TextField label="Cliente" value={row.clientNumber} onChange={(value) => updateRow({ clientNumber: value })} />
              <TextField label="Código tratamiento" value={row.serviceCode} onChange={(value) => updateRow({ serviceCode: normalizeOptionalText(value) })} />
              <TextField label="Descripción" value={row.description} onChange={(value) => updateRow({ description: value })} />
              <NumberField label="Sesiones totales" value={row.totalSessions} onChange={(totalSessions) => updateRow({ totalSessions: totalSessions ?? row.totalSessions })} />
              <NumberField label="Consumidas" value={row.consumedSessions} onChange={(consumedSessions) => updateRow({ consumedSessions: consumedSessions ?? row.consumedSessions })} />
              <NumberField label="Restantes" value={row.remainingSessions} onChange={(remainingSessions) => updateRow({ remainingSessions: remainingSessions ?? row.remainingSessions })} />
              <NumberField label="Valor legacy" value={row.legacyValue} onChange={(legacyValue) => updateRow({ legacyValue })} step="0.01" />
            </div>
          </div>
        )}
      />
    )
  }

  if (currentStep === 'accountBalances' && analysis) {
    currentContent = (
      <EditableDataStep
        stepId="accountBalances"
        title="7. Abonos del cliente"
        description="Estos movimientos vienen del bloque legacy de abonos/regalos. Revísalos con cuidado antes de darlos por válidos."
        rows={analysis.accountBalances}
        onRowsChange={(rows) => updateRows('accountBalances', rows)}
        searchPlaceholder="Buscar por cliente, descripción, tipo o número legacy..."
        getLabel={(row) => `${row.clientNumber} · ${row.description}`}
        getSearchText={(row) => [row.clientNumber, row.description, row.kind, row.legacyNumber].filter(Boolean).join(' ')}
        columns={[
          {
            header: 'Cliente',
            render: (row) => row.clientNumber
          },
          {
            header: 'Descripción',
            render: (row) => row.description
          },
          {
            header: 'Tipo',
            render: (row) => row.kind
          },
          {
            header: 'Importe',
            render: (row) => formatMaybeCurrency(row.amount)
          }
        ]}
        extraSummary={[
          {
            label: 'Con importe',
            value: String(analysis.accountBalances.filter((row) => row.amount !== null).length)
          }
        ]}
        emptyMessage="No hay abonos de cliente que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'accountBalances',
            message: `Abonos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'accountBalances',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} abonos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este abono" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Número legacy" value={row.legacyNumber} onChange={(value) => updateRow({ legacyNumber: value })} />
              <TextField label="Cliente" value={row.clientNumber} onChange={(value) => updateRow({ clientNumber: value })} />
              <TextField label="Tipo" value={row.kind} onChange={(value) => updateRow({ kind: value })} />
              <NumberField label="Importe" value={row.amount} onChange={(amount) => updateRow({ amount })} step="0.01" />
              <NumberField label="Nominal raw" value={row.rawNominal} onChange={(rawNominal) => updateRow({ rawNominal })} step="0.01" />
              <NumberField label="Consumido raw" value={row.rawConsumed} onChange={(rawConsumed) => updateRow({ rawConsumed })} step="0.01" />
            </div>

            <TextAreaField label="Descripción" value={row.description} onChange={(value) => updateRow({ description: value })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'appointments' && analysis) {
    currentContent = (
      <EditableDataStep
        stepId="appointments"
        title="8. Citas"
        description="Aquí revisas la agenda histórica y asignas cada cita a un usuario real de Lucy3000 cuando proceda."
        rows={analysis.appointments}
        onRowsChange={(rows) => updateRows('appointments', rows)}
        searchPlaceholder="Buscar por cliente, tratamiento, profesional, cabina o notas..."
        getLabel={(row) => `${row.date} · ${row.clientName}`}
        getSearchText={(row) =>
          [
            row.clientName,
            row.legacyClientNumber,
            row.serviceCode,
            row.serviceName,
            row.legacyProfessionalCode,
            row.legacyProfessionalName,
            row.secondaryProfessionalCode,
            row.cabin,
            row.notes
          ]
            .filter(Boolean)
            .join(' ')
        }
        columns={[
          {
            header: 'Fecha',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.date}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {row.startTime} {row.endTime ? `- ${row.endTime}` : ''}
                </p>
              </div>
            )
          },
          {
            header: 'Cliente',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.clientName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.legacyClientNumber || 'Sin cliente'}</p>
              </div>
            )
          },
          {
            header: 'Tratamiento',
            render: (row) => row.serviceName || '-'
          },
          {
            header: 'Profesional',
            render: (row) => (
              <div>
                <p>{row.legacyProfessionalName || row.legacyProfessionalCode || '-'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {row.targetUserId
                    ? userOptions.find((option) => option.value === row.targetUserId)?.label || 'Asignado'
                    : 'Sin asignar'}
                </p>
              </div>
            )
          },
          {
            header: 'Estado',
            render: (row) => (
              <span className={`badge ${row.isInternalBlock ? 'badge-warning' : 'badge-success'}`}>
                {row.isInternalBlock ? 'Bloque' : row.status || 'Cita'}
              </span>
            )
          }
        ]}
        extraSummary={[
          {
            label: 'Bloques internos',
            value: String(analysis.appointments.filter((row) => row.isInternalBlock).length),
            tone: analysis.appointments.some((row) => row.isInternalBlock) ? 'warning' : 'default'
          },
          {
            label: 'Sin usuario Lucy',
            value: String(
              analysis.appointments.filter(
                (row) => row.selected && !row.isInternalBlock && row.legacyProfessionalCode && !row.targetUserId
              ).length
            ),
            tone:
              analysis.appointments.some(
                (row) => row.selected && !row.isInternalBlock && row.legacyProfessionalCode && !row.targetUserId
              )
                ? 'warning'
                : 'success'
          }
        ]}
        emptyMessage="No hay citas que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'appointments',
            message: `Citas seleccionadas: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'appointments',
            message: `${mode === 'select' ? 'Seleccionadas' : 'Deseleccionadas'} ${affectedCount} citas visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar esta cita" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Cliente legacy" value={row.legacyClientNumber} onChange={(value) => updateRow({ legacyClientNumber: normalizeOptionalText(value) })} />
              <TextField label="Nombre cliente" value={row.clientName} onChange={(value) => updateRow({ clientName: value })} />
              <TextField label="Teléfono" value={row.phone} onChange={(value) => updateRow({ phone: normalizeOptionalText(value) })} />
              <TextField label="Código tratamiento" value={row.serviceCode} onChange={(value) => updateRow({ serviceCode: normalizeOptionalText(value) })} />
              <TextField label="Tratamiento" value={row.serviceName} onChange={(value) => updateRow({ serviceName: normalizeOptionalText(value) })} />
              <TextField label="Fecha" type="date" value={row.date} onChange={(value) => updateRow({ date: value })} />
              <TextField label="Hora inicio" type="time" value={row.startTime} onChange={(value) => updateRow({ startTime: value })} />
              <TextField label="Hora fin" type="time" value={row.endTime} onChange={(value) => updateRow({ endTime: normalizeOptionalText(value) })} />
              <NumberField label="Duración (min)" value={row.durationMinutes} onChange={(durationMinutes) => updateRow({ durationMinutes })} />
              <TextField label="Cabina" value={row.cabin} onChange={(value) => updateRow({ cabin: normalizeOptionalText(value) })} />
              <TextField
                label="Profesional legacy"
                value={row.legacyProfessionalCode}
                onChange={(value) => updateRow({ legacyProfessionalCode: normalizeOptionalText(value) })}
              />
              <TextField
                label="Nombre profesional"
                value={row.legacyProfessionalName}
                onChange={(value) => updateRow({ legacyProfessionalName: normalizeOptionalText(value) })}
              />
              <TextField
                label="Profesional secundario"
                value={row.secondaryProfessionalCode}
                onChange={(value) => updateRow({ secondaryProfessionalCode: normalizeOptionalText(value) })}
              />
              <TextField label="Estado" value={row.status} onChange={(value) => updateRow({ status: normalizeOptionalText(value) })} />
              <TextField
                label="Pack legacy"
                value={row.legacyPackNumber}
                onChange={(value) => updateRow({ legacyPackNumber: normalizeOptionalText(value) })}
              />
              <SelectField label="Usuario Lucy" value={row.targetUserId} onChange={(targetUserId) => updateRow({ targetUserId })} options={userOptions} />
            </div>

            <TextAreaField label="Notas" value={row.notes} onChange={(value) => updateRow({ notes: normalizeOptionalText(value) })} />
            <CheckboxField label="Bloque interno" checked={row.isInternalBlock} onChange={(isInternalBlock) => updateRow({ isInternalBlock })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'summary' && analysis && selectedSummary) {
    currentContent = (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">9. Resumen</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Clientes seleccionados" value={String(selectedSummary.clients)} />
          <SummaryCard label="Tratamientos seleccionados" value={String(selectedSummary.services)} />
          <SummaryCard label="Productos seleccionados" value={String(selectedSummary.products)} />
          <SummaryCard label="Bonos seleccionados" value={String(selectedSummary.bonoTemplates)} />
          <SummaryCard label="Bonos cliente seleccionados" value={String(selectedSummary.clientBonos)} />
          <SummaryCard label="Abonos seleccionados" value={String(selectedSummary.accountBalances)} />
          <SummaryCard label="Citas seleccionadas" value={String(selectedSummary.appointments)} />
          <SummaryCard
            label="Citas sin usuario Lucy"
            value={String(selectedSummary.pendingUserMappings)}
            tone={selectedSummary.pendingUserMappings > 0 ? 'warning' : 'success'}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen del lote preparado</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bloque</th>
                    <th>Total detectado</th>
                    <th>Seleccionado</th>
                    <th>Incidencias</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Clientes', analysis.clients.length, selectedSummary.clients, analysis.clients.reduce((sum, row) => sum + row.issues.length, 0)],
                    ['Tratamientos', analysis.services.length, selectedSummary.services, analysis.services.reduce((sum, row) => sum + row.issues.length, 0)],
                    ['Productos', analysis.products.length, selectedSummary.products, analysis.products.reduce((sum, row) => sum + row.issues.length, 0)],
                    ['Bonos', analysis.bonoTemplates.length, selectedSummary.bonoTemplates, analysis.bonoTemplates.reduce((sum, row) => sum + row.issues.length, 0)],
                    ['Bonos cliente', analysis.clientBonos.length, selectedSummary.clientBonos, analysis.clientBonos.reduce((sum, row) => sum + row.issues.length, 0)],
                    ['Abonos cliente', analysis.accountBalances.length, selectedSummary.accountBalances, analysis.accountBalances.reduce((sum, row) => sum + row.issues.length, 0)],
                    ['Citas', analysis.appointments.length, selectedSummary.appointments, analysis.appointments.reduce((sum, row) => sum + row.issues.length, 0)]
                  ].map(([label, total, selected, issues]) => (
                    <tr key={String(label)}>
                      <td>{label}</td>
                      <td>{total}</td>
                      <td>{selected}</td>
                      <td>{issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Estado del asistente</h3>
              <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>Archivo analizado: <strong className="text-gray-900 dark:text-white">{analysis.sourceName}</strong></p>
                <p>Tablas detectadas: <strong className="text-gray-900 dark:text-white">{analysis.detectedTables.length}</strong></p>
                <p>Avisos totales: <strong className="text-gray-900 dark:text-white">{analysis.warnings.length}</strong></p>
                <p>Usuarios Lucy cargados: <strong className="text-gray-900 dark:text-white">{users.length}</strong></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">SQL</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-info">Solo 01dat.sql compatible</span>
          <span className="badge badge-warning">Ventas, caja y fotos fuera</span>
          <span className="badge badge-success">Modo seguro: sin escritura</span>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex min-w-max gap-3">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isEnabled = stepEnabled(step.id)

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(step.id)}
                disabled={!isEnabled}
                className={`min-h-[6.5rem] min-w-[8.5rem] rounded-xl border px-3 py-3 text-left transition-all ${
                  isActive
                    ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
                    : isEnabled
                      ? 'border-gray-200 hover:border-primary-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-primary-500 dark:hover:bg-gray-700/40'
                      : 'cursor-not-allowed border-gray-200 opacity-50 dark:border-gray-700'
                }`}
              >
                <div className="flex h-full flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Paso {index + 1}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-tight text-gray-900 dark:text-white">
                      {step.shortLabel}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {visibleWarnings.length > 0 ? (
        <div className="card border-amber-200 dark:border-amber-900/40">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Avisos</h2>
          </div>

          <div className="mt-4 space-y-3">
            {visibleWarnings.map((warning) => (
              <div
                key={`${warning.step}-${warning.code}-${warning.message}`}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  warning.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100'
                    : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>{warning.message}</p>
                  {warning.count ? <span className="badge badge-info">{warning.count}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {currentContent}

      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Log de eventos</h2>
            {eventLogPath ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Archivo: <code>{eventLogPath}</code>
              </p>
            ) : null}
          </div>

          <button type="button" onClick={() => void refreshEvents()} className="btn btn-secondary" disabled={eventsLoading}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${eventsLoading ? 'animate-spin' : ''}`} />
            Actualizar log
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {eventEntries.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay eventos registrados para esta sesión.</p>
          ) : (
            eventEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-primary">{entry.type}</span>
                    {entry.step ? <span className="badge badge-info">{entry.step}</span> : null}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(entry.occurredAt).toLocaleString('es-ES')}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{entry.sessionId}</span>
                </div>

                <p className="mt-2 text-sm text-gray-900 dark:text-white">{entry.message}</p>
                {entry.payload ? (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => moveStep(-1)}
          disabled={currentStepIndex === 0}
          className="btn btn-secondary disabled:opacity-50"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Paso anterior
        </button>

        <div className="text-sm text-gray-500 dark:text-gray-400">
          {analysis ? `Paso ${currentStepIndex + 1} de ${steps.length}` : 'Analiza un SQL para desbloquear el wizard'}
        </div>

        <button
          type="button"
          onClick={() => moveStep(1)}
          disabled={currentStepIndex === steps.length - 1 || !analysis}
          className="btn btn-primary disabled:opacity-50"
        >
          Siguiente paso
          <ChevronRight className="ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
