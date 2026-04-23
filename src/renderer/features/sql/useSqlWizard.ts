import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { buildSelectedSummary, buildUserOptions, getVisibleWarnings, suggestUserId } from './helpers'
import { analyzeSqlFile, createSqlEvent, fetchSqlEvents, fetchSqlUsers, importSqlAnalysis } from './sqlApi'
import {
  buildSqlImportPayload,
  createSqlImportBackup,
  importGeneratedSqlAssets,
  isDesktopSqlRestoreAvailable
} from './sqlImportAdapter'
import type {
  SqlAnalysisResult,
  SqlEditableStepKey,
  SqlEventLogEntry,
  SqlImportReport,
  SqlSelectedSummary,
  SqlTrackEventPayload,
  SqlUserOption,
  WizardStepId
} from './types'
import { steps } from './viewModels'

export type UseSqlWizardResult = {
  file: File | null
  analysis: SqlAnalysisResult | null
  importReport: SqlImportReport | null
  currentStep: WizardStepId
  currentStepIndex: number
  loading: boolean
  usersLoading: boolean
  userOptions: SqlUserOption[]
  usersCount: number
  visibleWarnings: SqlAnalysisResult['warnings']
  selectedSummary: SqlSelectedSummary | null
  desktopRestoreAvailable: boolean
  sessionId: string
  eventEntries: SqlEventLogEntry[]
  eventLogPath: string | null
  eventsLoading: boolean
  stepEnabled: (stepId: WizardStepId) => boolean
  goToStep: (stepId: WizardStepId) => void
  moveStep: (direction: -1 | 1) => void
  refreshEvents: () => Promise<void>
  trackEvent: (payload: SqlTrackEventPayload) => Promise<void>
  handleAnalyze: () => Promise<void>
  handleImport: () => Promise<void>
  handleFileSelection: (file: File | null) => void
  updateAnalysisRows: <K extends SqlEditableStepKey>(key: K, rows: SqlAnalysisResult[K]) => void
}

export const useSqlWizard = (): UseSqlWizardResult => {
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<SqlAnalysisResult | null>(null)
  const [importReport, setImportReport] = useState<SqlImportReport | null>(null)
  const [currentStep, setCurrentStep] = useState<WizardStepId>('file')
  const [loading, setLoading] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [eventEntries, setEventEntries] = useState<SqlEventLogEntry[]>([])
  const [eventLogPath, setEventLogPath] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [sessionId] = useState(() => `sql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const previousStepRef = useRef<WizardStepId>('file')
  const pageOpenedTrackedRef = useRef(false)
  const [rawUsers, setRawUsers] = useState<Parameters<typeof buildUserOptions>[0]>([])

  const userOptions = useMemo(() => buildUserOptions(rawUsers), [rawUsers])
  const selectedSummary = useMemo(() => buildSelectedSummary(analysis), [analysis])
  const visibleWarnings = useMemo(() => getVisibleWarnings(analysis, currentStep), [analysis, currentStep])
  const currentStepIndex = steps.findIndex((step) => step.id === currentStep)
  const desktopRestoreAvailable = isDesktopSqlRestoreAvailable()

  useEffect(() => {
    const loadUsers = async () => {
      setUsersLoading(true)
      try {
        const response = await fetchSqlUsers()
        setRawUsers(response)
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
      const response = await fetchSqlEvents(sessionId)
      setEventEntries(response.entries)
      setEventLogPath(response.filePath)
    } catch (error) {
      console.error('Error fetching SQL events:', error)
    } finally {
      setEventsLoading(false)
    }
  }, [sessionId])

  const trackEvent = useCallback(
    async (payload: SqlTrackEventPayload) => {
      try {
        const createdEntry = await createSqlEvent(sessionId, payload)
        setEventEntries((current) => [createdEntry, ...current].slice(0, 30))
      } catch (error) {
        console.error('Error creating SQL event:', error)
      }
    },
    [sessionId]
  )

  useEffect(() => {
    if (pageOpenedTrackedRef.current) {
      return
    }

    pageOpenedTrackedRef.current = true

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
    if (!analysis || rawUsers.length === 0) {
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
            appointment.targetUserId !== undefined ? appointment.targetUserId : suggestUserId(appointment, rawUsers)
        }))
      }
    })
  }, [analysis, rawUsers])

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

  const stepEnabled = useCallback((stepId: WizardStepId) => stepId === 'file' || Boolean(analysis), [analysis])

  const goToStep = useCallback(
    (stepId: WizardStepId) => {
      if (!stepEnabled(stepId)) return
      setCurrentStep(stepId)
    },
    [stepEnabled]
  )

  const moveStep = useCallback(
    (direction: -1 | 1) => {
      const nextStep = steps[currentStepIndex + direction]
      if (!nextStep || !stepEnabled(nextStep.id)) return
      setCurrentStep(nextStep.id)
    },
    [currentStepIndex, stepEnabled]
  )

  const handleFileSelection = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile)
      setAnalysis(null)
      setImportReport(null)

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
    },
    [trackEvent]
  )

  const updateAnalysisRows = useCallback(
    <K extends SqlEditableStepKey>(key: K, rows: SqlAnalysisResult[K]) => {
      setAnalysis((current) => (current ? ({ ...current, [key]: rows } as SqlAnalysisResult) : current))
    },
    []
  )

  const handleAnalyze = useCallback(async () => {
    if (!file) {
      toast.error('Selecciona un archivo .sql o .sqlx antes de analizar')
      return
    }

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
      const nextAnalysis = await analyzeSqlFile(file)
      const withMapping =
        rawUsers.length > 0
          ? {
              ...nextAnalysis,
              appointments: nextAnalysis.appointments.map((appointment) => ({
                ...appointment,
                targetUserId: suggestUserId(appointment, rawUsers)
              }))
            }
          : nextAnalysis

      setAnalysis(withMapping)
      setImportReport(null)
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
  }, [file, rawUsers, trackEvent])

  const handleImport = useCallback(async () => {
    if (!analysis) {
      toast.error('Analiza primero el archivo SQL')
      return
    }

    if (!desktopRestoreAvailable || !window.electronAPI) {
      toast.error('La restauración requiere el bridge de escritorio disponible')
      return
    }

    setLoading(true)
    await trackEvent({
      type: 'import_started',
      step: 'summary',
      message: `Se inicia la restauración SQL de ${analysis.sourceName}`,
      payload: {
        sourceName: analysis.sourceName
      }
    })

    try {
      const backupResult = await createSqlImportBackup()
      await trackEvent({
        type: 'backup_completed',
        step: 'summary',
        message: 'Backup previo creado antes de la restauración SQL',
        payload: {
          backupPath: backupResult.path || null
        }
      })

      const nextReport = await importSqlAnalysis(buildSqlImportPayload(analysis, sessionId))
      let finalReport = nextReport
      let completedWithWarnings = false

      if (nextReport.generatedAssets.length > 0) {
        try {
          const assetImportResult = await importGeneratedSqlAssets(nextReport.generatedAssets)

          await trackEvent({
            type: 'assets_imported',
            step: 'summary',
            message: `Assets legacy guardados tras la restauración SQL: ${assetImportResult?.importedCount || 0}`,
            payload: assetImportResult || undefined
          })
        } catch (assetError: any) {
          completedWithWarnings = true
          const warningMessage = `La base se restauró, pero no se pudieron guardar los assets legacy: ${assetError?.message || 'Error desconocido'}`
          finalReport = {
            ...nextReport,
            warnings: [warningMessage, ...nextReport.warnings]
          }

          await trackEvent({
            type: 'assets_import_failed',
            step: 'assets',
            message: warningMessage,
            payload: {
              error: assetError?.message || 'Error desconocido'
            }
          })
        }
      }

      setImportReport(finalReport)
      await refreshEvents()
      if (completedWithWarnings) {
        toast.success('Restauración SQL completada con advertencias')
      } else {
        toast.success('Restauración SQL completada')
      }
    } catch (error: any) {
      console.error('SQL import error:', error)
      await trackEvent({
        type: 'import_failed',
        step: 'summary',
        message: `Error restaurando ${analysis.sourceName}`,
        payload: {
          error: error.response?.data?.error || error.message || 'Error desconocido',
          details: error.response?.data?.details || null
        }
      })
      toast.error(error.response?.data?.error || error.message || 'No se pudo completar la restauración SQL')
    } finally {
      setLoading(false)
    }
  }, [analysis, desktopRestoreAvailable, refreshEvents, sessionId, trackEvent])

  return {
    file,
    analysis,
    importReport,
    currentStep,
    currentStepIndex,
    loading,
    usersLoading,
    userOptions,
    usersCount: rawUsers.length,
    visibleWarnings,
    selectedSummary,
    desktopRestoreAvailable,
    sessionId,
    eventEntries,
    eventLogPath,
    eventsLoading,
    stepEnabled,
    goToStep,
    moveStep,
    refreshEvents,
    trackEvent,
    handleAnalyze,
    handleImport,
    handleFileSelection,
    updateAnalysisRows
  }
}
