import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Calendar, CheckCircle2, Database, FolderOpen, HardDrive, Link2, Printer, RefreshCw, RotateCcw, Save, Unlink, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ImportProductsModal from '../components/ImportProductsModal'
import ImportServicesModal from '../components/ImportServicesModal'
import ImportClientsModal from '../components/ImportClientsModal'
import ImportBonosModal from '../components/ImportBonosModal'
import {
  getPrintTicketSuccessMessage,
  getDebugLogFilePath,
  isDesktop,
  getTicketPrinterConfig,
  listTicketPrinters,
  openDebugLogFolder,
  printTicket,
  saveTicketPrinterConfig,
  TicketPrinter
} from '../utils/desktop'
import type { TicketPrinterConfig } from '../utils/desktop'
import api from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import { buildTestTicketPayload } from '../utils/tickets'
import { DEFAULT_NETWORK_TICKET_PORT } from '../../shared/ticketPrinter'

type GoogleCalendarConfig = {
  connected: boolean
  enabled: boolean
  sendClientInvites: boolean
  calendarId: string
  oauthConfigured: boolean
  missingEnvVars: string[]
  redirectUri?: string | null
}

const DEFAULT_CALENDAR_CONFIG: GoogleCalendarConfig = {
  connected: false,
  enabled: false,
  sendClientInvites: true,
  calendarId: 'primary',
  oauthConfigured: true,
  missingEnvVars: [],
  redirectUri: null
}

const GOOGLE_CALENDAR_MESSAGE_SOURCE = 'lucy3000-google-calendar-oauth'

export default function Settings() {
  const { user } = useAuthStore()
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
  const [savingCalendar, setSavingCalendar] = useState(false)
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_CONFIG.calendarId)
  const [desktopExePath, setDesktopExePath] = useState('')
  const [desktopUserDataPath, setDesktopUserDataPath] = useState('')

  const [importModal, setImportModal] = useState<'clients' | 'services' | 'products' | 'bonos' | null>(null)

  const [backupFolder, setBackupFolder] = useState('')
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true)
  const [backups, setBackups] = useState<Array<{ name: string; date: string; size: number }>>([])
  const [_loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [debugLogPath, setDebugLogPath] = useState('')

  const desktopMode = isDesktop()
  const isAdmin = user?.role === 'ADMIN'
  const apiOrigin = useMemo(() => {
    const baseUrl = typeof api.defaults.baseURL === 'string' ? api.defaults.baseURL : window.location.origin

    try {
      return new URL(baseUrl, window.location.origin).origin
    } catch {
      return window.location.origin
    }
  }, [])
  const desktopExeEnvPath = useMemo(() => {
    if (!desktopExePath) return ''

    const lastSeparatorIndex = Math.max(desktopExePath.lastIndexOf('\\'), desktopExePath.lastIndexOf('/'))
    if (lastSeparatorIndex < 0) return '.env'

    return `${desktopExePath.slice(0, lastSeparatorIndex + 1)}.env`
  }, [desktopExePath])

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
      setSelectedPrinter(configuredPrinter.ticketPrinterName || availablePrinters.find((printer) => printer.isDefault)?.name || '')
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
      setSavingCalendar(true)

      const trimmedCalendarId = calendarId.trim() || 'primary'
      await api.put('/calendar/config', {
        enabled: calendarConfig.enabled,
        sendClientInvites: calendarConfig.sendClientInvites,
        calendarId: trimmedCalendarId
      })

      setCalendarConfig((current) => ({
        ...current,
        calendarId: trimmedCalendarId
      }))
      setCalendarId(trimmedCalendarId)
      toast.success('Configuración de Google Calendar actualizada')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al guardar configuración')
    } finally {
      setSavingCalendar(false)
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

  const loadBackupConfig = async () => {
    if (!desktopMode) return
    try {
      setLoadingBackups(true)
      const config = await window.electronAPI!.backup.getConfig()
      setBackupFolder(config.folder)
      setAutoBackupEnabled(config.autoEnabled)

      const result = await window.electronAPI!.backup.list()
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
      const userDataPath = await window.electronAPI.getPath('userData')
      setDesktopUserDataPath(userDataPath)
    } catch {
      setDesktopUserDataPath('')
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
    if (!desktopMode) return
    try {
      setCreatingBackup(true)
      const result = await window.electronAPI!.backup.create()
      if (result.success) {
        toast.success(result.message || 'Backup creado')
        loadBackupConfig()
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
    if (!desktopMode) return
    if (!confirm('Esto reemplazara la base de datos actual con el backup seleccionado. Se creara una copia de seguridad automatica antes de restaurar. ¿Continuar?')) return
    try {
      const result = await window.electronAPI!.backup.restore()
      if (result.success) {
        toast.success(result.message || 'Backup restaurado')
      } else {
        toast.error(result.message || 'Error al restaurar')
      }
    } catch {
      toast.error('Error al restaurar backup')
    }
  }

  const handleSelectBackupFolder = async () => {
    if (!desktopMode) return
    const result = await window.electronAPI!.backup.selectFolder()
    if (!result.canceled && result.folder) {
      setBackupFolder(result.folder)
    }
  }

  const handleSaveBackupConfig = async () => {
    if (!desktopMode) return
    try {
      await window.electronAPI!.backup.setConfig({
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

  const buildPrinterConfig = (): TicketPrinterConfig => ({
    mode: printerMode,
    ticketPrinterName: selectedPrinter || null,
    networkHost: networkHost.trim(),
    networkPort: Number(networkPort)
  })

  const validatePrinterConfig = (config: TicketPrinterConfig) => {
    if (config.mode === 'system' && !config.ticketPrinterName) {
      toast.error('Selecciona una impresora de Windows para el modo sistema')
      return false
    }

    if (config.mode === 'network' && !config.networkHost) {
      toast.error('Introduce la IP o el host de la impresora ESC/POS')
      return false
    }

    if (!Number.isInteger(config.networkPort) || config.networkPort <= 0 || config.networkPort > 65535) {
      toast.error('Introduce un puerto válido entre 1 y 65535')
      return false
    }

    return true
  }

  const handleSavePrinter = async () => {
    const config = buildPrinterConfig()
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

      const config = buildPrinterConfig()
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
    loadPrinters()
    loadCalendarConfig()
    loadBackupConfig()
    loadDebugLogPath()
    loadDesktopExePath()
    loadDesktopUserDataPath()
  }, [isAdmin])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== apiOrigin) return

      const payload = event.data
      if (!payload || payload.source !== GOOGLE_CALENDAR_MESSAGE_SOURCE) return

      if (payload.success) {
        toast.success(payload.message || 'Google Calendar conectado')
        loadCalendarConfig()
        return
      }

      toast.error(payload.message || 'No se pudo completar la conexión con Google Calendar')
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [apiOrigin])

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Ajustes del dispositivo e integraciones de la agenda.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Impresora de tickets
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Esta configuración es local a cada equipo.
              </p>
            </div>
            <button onClick={loadPrinters} className="btn btn-secondary" disabled={!desktopMode || loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Recargar
            </button>
          </div>

          {!desktopMode ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                En navegador no hay acceso a Electron ni configuración silenciosa de impresora. Lucy3000 usará el diálogo de impresión del navegador y podrás elegir `POS-80c` manualmente.
              </div>

              <button
                onClick={handleTestPrinter}
                className="btn btn-primary"
                disabled={testingPrinter}
              >
                <Printer className="mr-2 h-4 w-4" />
                {testingPrinter ? 'Abriendo impresión...' : 'Imprimir prueba en navegador'}
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Modo de conexión</label>
                <select
                  value={printerMode}
                  onChange={(event) => setPrinterMode(event.target.value as TicketPrinterConfig['mode'])}
                  className="input"
                  disabled={loading || saving || testingPrinter}
                >
                  <option value="system">Impresora instalada en Windows</option>
                  <option value="network">ESC/POS por red (LAN)</option>
                </select>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Usa modo Windows si la impresora aparece en el sistema. Usa LAN si quieres enviar ESC/POS directo a la IP de la impresora.
                </p>
              </div>

              {printerMode === 'system' ? (
                <div>
                  <label className="label">Impresora configurada</label>
                  <select
                    value={selectedPrinter}
                    onChange={(event) => setSelectedPrinter(event.target.value)}
                    className="input"
                    disabled={loading || saving || testingPrinter}
                  >
                    <option value="">Sin seleccionar</option>
                    {printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.displayName || printer.name}
                        {printer.isDefault ? ' (predeterminada)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">IP o host de la impresora</label>
                    <input
                      type="text"
                      value={networkHost}
                      onChange={(event) => setNetworkHost(event.target.value)}
                      placeholder="192.168.1.50"
                      className="input"
                      disabled={loading || saving || testingPrinter}
                    />
                  </div>

                  <div>
                    <label className="label">Puerto TCP</label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={networkPort}
                      onChange={(event) => setNetworkPort(event.target.value)}
                      placeholder={String(DEFAULT_NETWORK_TICKET_PORT)}
                      className="input"
                      disabled={loading || saving || testingPrinter}
                    />
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      La mayoría de impresoras ESC/POS por red escuchan en el puerto `9100`.
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                    Recomendación: para pruebas rápidas en portátil, la conexión LAN directa suele ser más estable que USB en Electron porque evita drivers y módulos nativos.
                  </div>
                </>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleSavePrinter}
                  className="btn btn-primary"
                  disabled={saving || loading || testingPrinter}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Guardando...' : 'Guardar impresora'}
                </button>

                <button
                  onClick={handleTestPrinter}
                  className="btn btn-secondary"
                  disabled={saving || loading || testingPrinter}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {testingPrinter ? 'Imprimiendo...' : 'Imprimir prueba'}
                </button>
              </div>

              {printerMode === 'system' && printers.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  No hay impresoras detectadas por Electron. Si la impresora no aparece en Windows, usa el modo LAN con IP fija o DHCP reservada.
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Google Calendar</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Integración global de agenda. Requiere permisos de administrador.
              </p>
            </div>
          </div>

          {!isAdmin ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Solo un usuario con rol administrador puede conectar o modificar la integración con Google Calendar.
            </div>
          ) : loadingCalendar ? (
            <div className="py-4 text-center text-gray-600 dark:text-gray-400">
              Cargando configuración...
            </div>
          ) : calendarConfig.connected ? (
            <div className="space-y-4">
              {!calendarConfig.oauthConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">Falta configurar Google Calendar en el entorno del .exe.</p>
                  <p className="mt-2">
                    Variables pendientes: {calendarConfig.missingEnvVars.join(', ')}.
                  </p>
                  <p className="mt-2">
                    Añádelas en el archivo <span className="font-mono">.env</span> de la carpeta de datos de Lucy3000 y reinicia la app.
                  </p>
                  {desktopUserDataPath && (
                    <p className="mt-2 break-all font-mono text-xs">
                      Ruta recomendada: {desktopUserDataPath}\.env
                    </p>
                  )}
                  {desktopExeEnvPath && (
                    <p className="mt-2 break-all text-xs">
                      Alternativa compatible: <span className="font-mono">{desktopExeEnvPath}</span>
                    </p>
                  )}
                  {calendarConfig.redirectUri && (
                    <p className="mt-2 break-all text-xs">
                      Redirect URI esperada: <span className="font-mono">{calendarConfig.redirectUri}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/30">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-200">
                    Google Calendar conectado
                  </span>
                </div>
                <button onClick={handleDisconnectCalendar} className="btn btn-secondary btn-sm">
                  <Unlink className="mr-1 h-4 w-4" />
                  Desconectar
                </button>
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={calendarConfig.enabled}
                  onChange={(event) =>
                    setCalendarConfig((current) => ({ ...current, enabled: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Sincronizar citas con Google Calendar
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Al crear o modificar una cita, Lucy3000 intentará reflejar el cambio en el calendario configurado.
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={calendarConfig.sendClientInvites}
                  onChange={(event) =>
                    setCalendarConfig((current) => ({ ...current, sendClientInvites: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Enviar invitaciones y actualizaciones al cliente
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Si la cita tiene email de cliente, Google enviará el alta, los cambios y la cancelación del evento.
                  </p>
                </div>
              </label>

              <div>
                <label className="label">ID de Calendar</label>
                <input
                  type="text"
                  value={calendarId}
                  onChange={(event) => setCalendarId(event.target.value)}
                  placeholder="primary"
                  className="input"
                />
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Usa `primary` para tu calendario principal o el ID de un calendario específico.
                </p>
              </div>

              <button
                onClick={handleSaveCalendarConfig}
                className="btn btn-primary w-full"
                disabled={savingCalendar}
              >
                <Save className="mr-2 h-4 w-4" />
                {savingCalendar ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {!calendarConfig.oauthConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">Google Calendar no está listo todavía.</p>
                  <p className="mt-2">
                    Faltan estas variables: {calendarConfig.missingEnvVars.join(', ')}.
                  </p>
                  <p className="mt-2">
                    Crea o completa el archivo <span className="font-mono">.env</span> en la carpeta de datos de Lucy3000 y reinicia la aplicación antes de pulsar conectar.
                  </p>
                  {desktopUserDataPath && (
                    <p className="mt-2 break-all font-mono text-xs">
                      Ruta recomendada: {desktopUserDataPath}\.env
                    </p>
                  )}
                  {desktopExeEnvPath && (
                    <p className="mt-2 break-all text-xs">
                      Alternativa compatible: <span className="font-mono">{desktopExeEnvPath}</span>
                    </p>
                  )}
                  <p className="mt-2 text-xs">
                    Variables necesarias: <span className="font-mono">GOOGLE_CALENDAR_CLIENT_ID</span>, <span className="font-mono">GOOGLE_CALENDAR_CLIENT_SECRET</span>, <span className="font-mono">GOOGLE_CALENDAR_REDIRECT_URI</span>.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                Conecta una cuenta de Google para registrar las citas en tu calendario y, si el cliente tiene email,
                enviarle la invitación del evento desde Google.
              </div>

              <button
                onClick={handleConnectGoogleCalendar}
                className="btn btn-primary w-full"
                disabled={!calendarConfig.oauthConfigured}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Conectar Google Calendar
              </button>
            </div>
          )}
        </div>

        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-primary-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Importar datos</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Carga clientes, tratamientos o productos desde un archivo Excel.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setImportModal('clients')}
              className="btn btn-secondary w-full justify-start"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar Clientes
            </button>
            <button
              onClick={() => setImportModal('services')}
              className="btn btn-secondary w-full justify-start"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar Tratamientos
            </button>
            <button
              onClick={() => setImportModal('products')}
              className="btn btn-secondary w-full justify-start"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar Productos
            </button>
            <button
              onClick={() => setImportModal('bonos')}
              className="btn btn-secondary w-full justify-start"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar Bonos
            </button>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            La importacion no borra datos existentes. Los nuevos registros se anaden a los actuales.
            Si un registro ya existe (por SKU en productos), se omite.
          </div>
        </div>

        {desktopMode && (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-primary-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Backups</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Copia de seguridad de la base de datos local.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCreateBackup}
                className="btn btn-primary w-full"
                disabled={creatingBackup}
              >
                <Save className="mr-2 h-4 w-4" />
                {creatingBackup ? 'Creando backup...' : 'Hacer backup ahora'}
              </button>

              <button
                onClick={handleRestoreBackup}
                className="btn btn-secondary w-full"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar backup
              </button>
            </div>

            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div>
                <label className="label">Carpeta de backups</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={backupFolder}
                    onChange={(e) => setBackupFolder(e.target.value)}
                    className="input flex-1"
                    placeholder="Carpeta destino"
                    readOnly
                  />
                  <button onClick={handleSelectBackupFolder} className="btn btn-secondary">
                    <FolderOpen className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Si usas Google Drive o OneDrive, elige una carpeta sincronizada para subir los backups a la nube automaticamente.
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Backup automatico semanal
                </span>
              </label>

              <button onClick={handleSaveBackupConfig} className="btn btn-secondary w-full">
                <Save className="mr-2 h-4 w-4" />
                Guardar configuracion de backup
              </button>
            </div>

            {backups.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Backups existentes ({backups.length})
                </h3>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {backups.map((backup) => (
                    <div key={backup.name} className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400 py-1">
                      <span className="truncate flex-1">{backup.name}</span>
                      <span className="ml-2 whitespace-nowrap">{(backup.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {desktopMode && (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-primary-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Diagnostico y logs</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Lucy3000 guarda errores del renderer, Electron y backend en un fichero local.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="font-medium text-gray-900 dark:text-white">Archivo actual de log</p>
              <p className="mt-2 break-all font-mono">{debugLogPath || 'No disponible todavia'}</p>
            </div>

            <button onClick={handleOpenLogsFolder} className="btn btn-secondary w-full">
              <FolderOpen className="mr-2 h-4 w-4" />
              Abrir carpeta de logs
            </button>

            <p className="text-xs text-gray-600 dark:text-gray-400">
              Reproduce el error y enviame el contenido del log mas reciente para localizar el fallo exacto.
            </p>
          </div>
        )}

        <div className="card space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <Printer className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notas de despliegue</h2>
          </div>

          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
              La impresora de tickets se configura por equipo; Google Calendar se configura una sola vez para toda la app.
            </p>
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
              Si Lucy3000 se abre en navegador, el fallback usa el diálogo de impresión del sistema y aprovecha los drivers instalados en ese equipo.
            </p>
            <p className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
              Para impresoras ESC/POS, prioriza LAN con IP conocida o impresora instalada en Windows; USB directo desde Electron suele requerir más mantenimiento.
            </p>
            <p className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
              Si desactivas la sincronización, Lucy3000 dejará de enviar nuevos cambios a Google Calendar, pero no borrará eventos antiguos automáticamente.
            </p>
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
              La invitación al cliente solo se envía si la cita tiene email y está activada la opción de invitaciones.
            </p>
          </div>
        </div>
      </div>

      <Modal isOpen={importModal === 'clients'} title="Importar Clientes" onClose={() => setImportModal(null)}>
        <ImportClientsModal
          onSuccess={() => { setImportModal(null) }}
          onCancel={() => setImportModal(null)}
        />
      </Modal>

      <Modal isOpen={importModal === 'services'} title="Importar Tratamientos" onClose={() => setImportModal(null)}>
        <ImportServicesModal
          onSuccess={() => { setImportModal(null) }}
          onCancel={() => setImportModal(null)}
        />
      </Modal>

      <Modal isOpen={importModal === 'products'} title="Importar Productos" onClose={() => setImportModal(null)}>
        <ImportProductsModal
          onSuccess={() => { setImportModal(null) }}
          onCancel={() => setImportModal(null)}
        />
      </Modal>

      <Modal isOpen={importModal === 'bonos'} title="Importar Bonos" onClose={() => setImportModal(null)}>
        <ImportBonosModal
          onSuccess={() => { setImportModal(null) }}
          onCancel={() => setImportModal(null)}
        />
      </Modal>
    </div>
  )
}
