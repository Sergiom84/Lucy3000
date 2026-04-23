import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../utils/api'
import {
  getDebugLogFilePath,
  getPrintTicketSuccessMessage,
  getRuntimeDataPaths,
  getTicketPrinterConfig,
  isDesktop,
  listTicketPrinters,
  openDebugLogFolder,
  openRuntimeDataFolder,
  printTicket,
  resetRuntimeData,
  saveTicketPrinterConfig,
  type TicketPrinter,
  type TicketPrinterConfig
} from '../../utils/desktop'
import { buildTestTicketPayload } from '../../utils/tickets'
import { useAuthStore } from '../../stores/authStore'
import { DEFAULT_NETWORK_TICKET_PORT } from '../../../shared/ticketPrinter'
import {
  buildDesktopEnvPath,
  buildPrinterConfig,
  getPrinterConfigValidationError,
  resolveSettingsApiOrigin
} from './settingsHelpers'
import {
  DEFAULT_CALENDAR_CONFIG,
  GOOGLE_CALENDAR_MESSAGE_SOURCE,
  type GoogleCalendarConfig,
  type SettingsImportModal
} from './types'

export const useSettingsPage = () => {
  const { user, logout } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingPrinter, setTestingPrinter] = useState(false)
  const [printers, setPrinters] = useState<TicketPrinter[]>([])
  const [printerMode, setPrinterMode] = useState<TicketPrinterConfig['mode']>('system')
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [networkHost, setNetworkHost] = useState('')
  const [networkPort, setNetworkPort] = useState(String(DEFAULT_NETWORK_TICKET_PORT))
  const [calendarConfig, setCalendarConfig] = useState<GoogleCalendarConfig>(DEFAULT_CALENDAR_CONFIG)
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [calendarAction, setCalendarAction] = useState<null | 'save' | 'link' | 'pending' | 'sync'>(null)
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_CONFIG.calendarId)
  const [desktopExePath, setDesktopExePath] = useState('')
  const [desktopUserDataPath, setDesktopUserDataPath] = useState('')
  const [desktopDbPath, setDesktopDbPath] = useState('')
  const [importModal, setImportModal] = useState<SettingsImportModal>(null)
  const [backupFolder, setBackupFolder] = useState('')
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true)
  const [backups, setBackups] = useState<Array<{ name: string; date: string; size: number }>>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [debugLogPath, setDebugLogPath] = useState('')

  const desktopMode = isDesktop()
  const isAdmin = user?.role === 'ADMIN'
  const apiOrigin = useMemo(
    () => resolveSettingsApiOrigin(typeof api.defaults.baseURL === 'string' ? api.defaults.baseURL : undefined, window.location.origin),
    []
  )
  const desktopExeEnvPath = useMemo(() => buildDesktopEnvPath(desktopExePath), [desktopExePath])

  const loadPrinters = async () => {
    if (!desktopMode) return

    try {
      setLoading(true)
      const [availablePrinters, configuredPrinter] = await Promise.all([
        listTicketPrinters(),
        getTicketPrinterConfig()
      ])

      setPrinters(availablePrinters)
      setPrinterMode(configuredPrinter.mode)
      setSelectedPrinter(
        configuredPrinter.ticketPrinterName ||
          availablePrinters.find((printer) => printer.isDefault)?.name ||
          ''
      )
      setNetworkHost(configuredPrinter.networkHost)
      setNetworkPort(String(configuredPrinter.networkPort || DEFAULT_NETWORK_TICKET_PORT))
    } catch {
      toast.error('No se pudieron cargar las impresoras')
    } finally {
      setLoading(false)
    }
  }

  const loadCalendarConfig = async () => {
    if (!isAdmin) return

    try {
      setLoadingCalendar(true)
      const response = await api.get<GoogleCalendarConfig>('/calendar/config')
      const config = {
        ...DEFAULT_CALENDAR_CONFIG,
        ...response.data
      }

      setCalendarConfig(config)
      setCalendarId(config.calendarId || 'primary')
    } catch (error) {
      console.error('Error cargando configuración de Google Calendar:', error)
      toast.error('No se pudo cargar la configuración de Google Calendar')
    } finally {
      setLoadingCalendar(false)
    }
  }

  const handleConnectGoogleCalendar = async () => {
    if (!isAdmin) return

    try {
      const response = await api.get<{ authUrl: string }>('/calendar/auth/url')
      const popup = window.open(response.data.authUrl, '_blank', 'popup=yes,width=560,height=720')

      if (!popup) {
        toast.error('No se pudo abrir la ventana de autorización. Revisa el bloqueador de popups.')
        return
      }

      toast.success('Completa la autorización en la ventana que se acaba de abrir')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al conectar con Google Calendar')
    }
  }

  const handleSaveCalendarConfig = async () => {
    if (!isAdmin) return

    try {
      setCalendarAction('save')

      const trimmedCalendarId = calendarId.trim() || 'primary'
      const response = await api.put('/calendar/config', {
        enabled: calendarConfig.enabled,
        sendClientInvites: calendarConfig.sendClientInvites,
        calendarId: trimmedCalendarId
      })

      setCalendarConfig((current) => ({
        ...current,
        calendarId: trimmedCalendarId
      }))
      setCalendarId(trimmedCalendarId)
      toast.success(response.data?.message || 'Configuración de Google Calendar actualizada')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al guardar configuración')
    } finally {
      setCalendarAction(null)
    }
  }

  const handleDisconnectCalendar = async () => {
    if (!isAdmin) return

    if (!confirm('¿Seguro que quieres desconectar Google Calendar?')) return

    try {
      await api.post('/calendar/disconnect')
      setCalendarConfig(DEFAULT_CALENDAR_CONFIG)
      setCalendarId(DEFAULT_CALENDAR_CONFIG.calendarId)
      toast.success('Google Calendar desconectado')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al desconectar Google Calendar')
    }
  }

  const handleManualCalendarSync = async () => {
    if (!isAdmin) return

    try {
      setCalendarAction('sync')
      const response = await api.post('/calendar/sync')
      toast.success(response.data?.message || 'Sincronización completada')
      await loadCalendarConfig()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al ejecutar la sincronización')
    } finally {
      setCalendarAction(null)
    }
  }

  const handleLinkCalendar = async () => {
    if (!isAdmin) return

    try {
      setCalendarAction('link')
      const response = await api.post('/calendar/link')
      toast.success(response.data?.message || 'Vinculación completada')
      await loadCalendarConfig()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al ejecutar la vinculación')
    } finally {
      setCalendarAction(null)
    }
  }

  const handlePendingCalendarSync = async () => {
    if (!isAdmin) return

    try {
      setCalendarAction('pending')
      const response = await api.post('/calendar/pending')
      toast.success(response.data?.message || 'Sincronización de pendientes completada')
      await loadCalendarConfig()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al sincronizar pendientes')
    } finally {
      setCalendarAction(null)
    }
  }

  const loadBackupConfig = async () => {
    if (!desktopMode || !window.electronAPI) return
    try {
      setLoadingBackups(true)
      const config = await window.electronAPI.backup.getConfig()
      setBackupFolder(config.folder)
      setAutoBackupEnabled(config.autoEnabled)

      const result = await window.electronAPI.backup.list()
      if (result.success) setBackups(result.backups)
    } catch {
      // Backup config not available
    } finally {
      setLoadingBackups(false)
    }
  }

  const loadDesktopExePath = async () => {
    if (!desktopMode || !window.electronAPI) return

    try {
      const exePath = await window.electronAPI.getPath('exe')
      setDesktopExePath(exePath)
    } catch {
      setDesktopExePath('')
    }
  }

  const loadDesktopUserDataPath = async () => {
    if (!desktopMode || !window.electronAPI) return

    try {
      const runtimeInfo = await getRuntimeDataPaths()
      setDesktopUserDataPath(runtimeInfo.userDataPath)
      setDesktopDbPath(runtimeInfo.dbPath)
    } catch {
      setDesktopUserDataPath('')
      setDesktopDbPath('')
    }
  }

  const loadDebugLogPath = async () => {
    if (!desktopMode) return

    try {
      const filePath = await getDebugLogFilePath()
      setDebugLogPath(filePath)
    } catch {
      setDebugLogPath('')
    }
  }

  const handleCreateBackup = async () => {
    if (!desktopMode || !window.electronAPI) return
    try {
      setCreatingBackup(true)
      const result = await window.electronAPI.backup.create()
      if (result.success) {
        toast.success(result.message || 'Backup creado')
        void loadBackupConfig()
      } else {
        toast.error(result.message || 'Error al crear backup')
      }
    } catch {
      toast.error('Error al crear backup')
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleRestoreBackup = async () => {
    if (!desktopMode || !window.electronAPI) return
    if (!confirm('Esto reemplazara la base de datos actual con el backup seleccionado. Si el backup es completo, tambien se restauraran los assets locales del cliente. Se creara una copia de seguridad automatica antes de restaurar. ¿Continuar?')) return
    try {
      const result = await window.electronAPI.backup.restore()
      if (result.success) {
        toast.success(result.message || 'Backup restaurado')

        if (result.requiresRelaunch) {
          logout()
          setTimeout(() => {
            void window.electronAPI!.relaunch()
          }, 600)
        }
      } else {
        toast.error(result.message || 'Error al restaurar')
      }
    } catch {
      toast.error('Error al restaurar backup')
    }
  }

  const handleSelectBackupFolder = async () => {
    if (!desktopMode || !window.electronAPI) return
    const result = await window.electronAPI.backup.selectFolder()
    if (!result.canceled && result.folder) {
      setBackupFolder(result.folder)
    }
  }

  const handleSaveBackupConfig = async () => {
    if (!desktopMode || !window.electronAPI) return
    try {
      await window.electronAPI.backup.setConfig({
        folder: backupFolder,
        autoEnabled: autoBackupEnabled,
        cronExpression: '0 3 * * 0'
      })
      toast.success('Configuracion de backup guardada')
    } catch {
      toast.error('Error al guardar configuracion')
    }
  }

  const handleOpenLogsFolder = async () => {
    if (!desktopMode) return

    try {
      const folderPath = await openDebugLogFolder()
      toast.success(`Carpeta de logs abierta: ${folderPath}`)
    } catch (error: any) {
      toast.error(error.message || 'No se pudo abrir la carpeta de logs')
    }
  }

  const handleOpenRuntimeFolder = async () => {
    if (!desktopMode) return

    try {
      const folderPath = await openRuntimeDataFolder()
      toast.success(`Carpeta abierta: ${folderPath}`)
    } catch (error: any) {
      toast.error(error.message || 'No se pudo abrir la carpeta de datos')
    }
  }

  const handleResetLocalInstall = async () => {
    if (!desktopMode) return

    const accepted = window.confirm(
      'Esto moverá la base activa a una copia de seguridad dentro de la carpeta de datos y reiniciará la app para volver al bootstrap del primer administrador. ¿Continuar?'
    )

    if (!accepted) return

    try {
      const result = await resetRuntimeData()
      toast.success('Instalación local restablecida')
      setDesktopDbPath(result.dbPath)

      if (result.requiresRelaunch && window.electronAPI) {
        logout()
        setTimeout(() => {
          void window.electronAPI!.relaunch()
        }, 600)
      }
    } catch (error: any) {
      toast.error(error.message || 'No se pudo restablecer la instalación local')
    }
  }

  const validatePrinterConfig = (config: TicketPrinterConfig) => {
    const validationError = getPrinterConfigValidationError(config)
    if (validationError) {
      toast.error(validationError)
      return false
    }

    return true
  }

  const handleSavePrinter = async () => {
    const config = buildPrinterConfig(printerMode, selectedPrinter, networkHost, networkPort)
    if (!validatePrinterConfig(config)) {
      return
    }

    try {
      setSaving(true)
      await saveTicketPrinterConfig(config)
      toast.success('Impresora de tickets configurada')
    } catch {
      toast.error('No se pudo guardar la impresora')
    } finally {
      setSaving(false)
    }
  }

  const handleTestPrinter = async () => {
    try {
      setTestingPrinter(true)
      if (!desktopMode) {
        const result = await printTicket(buildTestTicketPayload())
        toast.success(getPrintTicketSuccessMessage(result))
        return
      }

      const config = buildPrinterConfig(printerMode, selectedPrinter, networkHost, networkPort)
      if (!validatePrinterConfig(config)) {
        return
      }

      await saveTicketPrinterConfig(config)
      const result = await printTicket(buildTestTicketPayload())
      toast.success(getPrintTicketSuccessMessage(result))
    } catch (error: any) {
      toast.error(error.message || 'No se pudo imprimir el ticket de prueba')
    } finally {
      setTestingPrinter(false)
    }
  }

  useEffect(() => {
    void loadPrinters()
    void loadCalendarConfig()
    void loadBackupConfig()
    void loadDebugLogPath()
    void loadDesktopExePath()
    void loadDesktopUserDataPath()
  }, [isAdmin])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== apiOrigin) return

      const payload = event.data
      if (!payload || payload.source !== GOOGLE_CALENDAR_MESSAGE_SOURCE) return

      if (payload.success) {
        toast.success(payload.message || 'Google Calendar conectado')
        void loadCalendarConfig()
        return
      }

      toast.error(payload.message || 'No se pudo completar la conexión con Google Calendar')
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [apiOrigin])

  return {
    autoBackupEnabled,
    backupFolder,
    backups,
    calendarAction,
    calendarConfig,
    calendarId,
    creatingBackup,
    debugLogPath,
    desktopDbPath,
    desktopExeEnvPath,
    desktopExePath,
    desktopMode,
    desktopUserDataPath,
    handleConnectGoogleCalendar,
    handleCreateBackup,
    handleDisconnectCalendar,
    handleLinkCalendar,
    handleManualCalendarSync,
    handleOpenLogsFolder,
    handleOpenRuntimeFolder,
    handlePendingCalendarSync,
    handleResetLocalInstall,
    handleRestoreBackup,
    handleSaveBackupConfig,
    handleSaveCalendarConfig,
    handleSavePrinter,
    handleSelectBackupFolder,
    handleTestPrinter,
    importModal,
    isAdmin,
    loading,
    loadingBackups,
    loadingCalendar,
    networkHost,
    networkPort,
    printerMode,
    printers,
    saving,
    selectedPrinter,
    setAutoBackupEnabled,
    setCalendarConfig,
    setCalendarId,
    setImportModal,
    setNetworkHost,
    setNetworkPort,
    setPrinterMode,
    setSelectedPrinter,
    testingPrinter,
    loadPrinters
  }
}
