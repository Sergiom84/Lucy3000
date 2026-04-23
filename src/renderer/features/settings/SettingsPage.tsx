import { Suspense, lazy } from 'react'
import { CheckCircle2, FolderOpen, Unlink } from 'lucide-react'
import Modal from '../../components/Modal'
import type { TicketPrinterConfig } from '../../utils/desktop'
import { DEFAULT_NETWORK_TICKET_PORT } from '../../../shared/ticketPrinter'
import { useSettingsPage } from './useSettingsPage'

const ImportAppointmentsModal = lazy(() => import('../../components/ImportAppointmentsModal'))
const ImportProductsModal = lazy(() => import('../../components/ImportProductsModal'))
const ImportServicesModal = lazy(() => import('../../components/ImportServicesModal'))
const ImportClientsModal = lazy(() => import('../../components/ImportClientsModal'))
const ImportBonosModal = lazy(() => import('../../components/ImportBonosModal'))
const ImportAbonosModal = lazy(() => import('../../components/ImportAbonosModal'))
const ImportClientBonosModal = lazy(() => import('../../components/ImportClientBonosModal'))

function LazyPanelLoader() {
  return <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</div>
}

export default function Settings() {
  const {
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
  } = useSettingsPage()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Configuración</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Impresora de tickets
              </h2>
            </div>
            <button onClick={loadPrinters} className="btn btn-secondary" disabled={!desktopMode || loading}>
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
                  {saving ? 'Guardando...' : 'Guardar impresora'}
                </button>

                <button
                  onClick={handleTestPrinter}
                  className="btn btn-secondary"
                  disabled={saving || loading || testingPrinter}
                >
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
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Google Calendar</h2>
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

              <div className="grid gap-3 sm:grid-cols-4">
                <button
                  onClick={handleSaveCalendarConfig}
                  className="btn btn-primary w-full"
                  disabled={calendarAction !== null}
                  title="Guardar la configuracion actual de Google Calendar"
                >
                  {calendarAction === 'save' ? 'Guardando...' : 'Guardar'}
                </button>

                <button
                  onClick={handleLinkCalendar}
                  className="btn btn-secondary w-full"
                  disabled={calendarAction !== null}
                  title="Busca coincidencias entre Lucy3000 y Google Calendar y las vincula sin crear ni modificar eventos"
                >
                  {calendarAction === 'link' ? 'Vinculando...' : 'Vincular'}
                </button>

                <button
                  onClick={handlePendingCalendarSync}
                  className="btn btn-secondary w-full"
                  disabled={calendarAction !== null}
                  title="Crea en Google Calendar las citas y bloqueos locales que todavia no estan vinculados"
                >
                  {calendarAction === 'pending' ? 'Pendientes...' : 'Pendientes'}
                </button>

                <button
                  onClick={handleManualCalendarSync}
                  className="btn btn-secondary w-full"
                  disabled={calendarAction !== null}
                  title="Actualiza la agenda vinculada en Google Calendar y reintenta los elementos con error"
                >
                  {calendarAction === 'sync' ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
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

              <button
                onClick={handleConnectGoogleCalendar}
                className="btn btn-primary w-full"
                disabled={!calendarConfig.oauthConfigured}
              >
                Conectar Google Calendar
              </button>
            </div>
          )}
        </div>

        {isAdmin ? (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Importar datos</h2>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Citas</h3>
                <button
                  onClick={() => setImportModal('appointments')}
                  className="btn btn-secondary mt-3 w-full justify-start"
                >
                  Importar Citas
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Clientes</h3>
                <button
                  onClick={() => setImportModal('clients')}
                  className="btn btn-secondary mt-3 w-full justify-start"
                >
                  Importar Clientes
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tratamientos</h3>
                <button
                  onClick={() => setImportModal('services')}
                  className="btn btn-secondary mt-3 w-full justify-start"
                >
                  Importar Tratamientos
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Productos</h3>
                <button
                  onClick={() => setImportModal('products')}
                  className="btn btn-secondary mt-3 w-full justify-start"
                >
                  Importar Productos
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bonos</h3>
                <button
                  onClick={() => setImportModal('bonos')}
                  className="btn btn-secondary mt-3 w-full justify-start"
                >
                  Importar Bonos
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bonos de clientes</h3>
                <button
                  onClick={() => setImportModal('clientBonos')}
                  className="btn btn-secondary mt-3 w-full justify-start"
                >
                  Importar Bonos de clientes
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Abonos</h3>
                <button
                  onClick={() => setImportModal('abonos')}
                  className="btn btn-secondary mt-3 w-full justify-start"
                >
                  Importar Abonos
                </button>
              </div>
            </div>

          </div>
        ) : null}

        {desktopMode && (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Backups</h2>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCreateBackup}
                className="btn btn-primary w-full"
                disabled={creatingBackup}
              >
                {creatingBackup ? 'Creando backup...' : 'Hacer backup completo ahora'}
              </button>

              <button
                onClick={handleRestoreBackup}
                className="btn btn-secondary w-full"
              >
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
                    className="input flex-1"
                    placeholder="Carpeta destino"
                    readOnly
                  />
                  <button onClick={handleSelectBackupFolder} className="btn btn-secondary">
                    <FolderOpen className="h-4 w-4" />
                  </button>
                </div>
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
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Diagnostico y logs</h2>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="font-medium text-gray-900 dark:text-white">Carpeta de datos local</p>
              <p className="mt-2 break-all font-mono">{desktopUserDataPath || 'No disponible todavia'}</p>
              <p className="mt-4 font-medium text-gray-900 dark:text-white">Base de datos activa</p>
              <p className="mt-2 break-all font-mono">{desktopDbPath || 'No disponible todavia'}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="font-medium text-gray-900 dark:text-white">Archivo actual de log</p>
              <p className="mt-2 break-all font-mono">{debugLogPath || 'No disponible todavia'}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={handleOpenLogsFolder} className="btn btn-secondary">
                Abrir carpeta de logs
              </button>
              <button onClick={handleOpenRuntimeFolder} className="btn btn-secondary">
                Abrir carpeta de datos
              </button>
              <button onClick={handleResetLocalInstall} className="btn btn-secondary">
                Restablecer instalación local
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={importModal === 'appointments'} title="Importar Citas" onClose={() => setImportModal(null)}>
        {importModal === 'appointments' ? (
          <Suspense fallback={<LazyPanelLoader />}>
            <ImportAppointmentsModal
              onSuccess={() => { setImportModal(null) }}
              onCancel={() => setImportModal(null)}
            />
          </Suspense>
        ) : null}
      </Modal>

      <Modal isOpen={importModal === 'clients'} title="Importar Clientes" onClose={() => setImportModal(null)}>
        {importModal === 'clients' ? (
          <Suspense fallback={<LazyPanelLoader />}>
            <ImportClientsModal
              onSuccess={() => { setImportModal(null) }}
              onCancel={() => setImportModal(null)}
            />
          </Suspense>
        ) : null}
      </Modal>

      <Modal isOpen={importModal === 'services'} title="Importar Tratamientos" onClose={() => setImportModal(null)}>
        {importModal === 'services' ? (
          <Suspense fallback={<LazyPanelLoader />}>
            <ImportServicesModal
              onSuccess={() => { setImportModal(null) }}
              onCancel={() => setImportModal(null)}
            />
          </Suspense>
        ) : null}
      </Modal>

      <Modal isOpen={importModal === 'products'} title="Importar Productos" onClose={() => setImportModal(null)}>
        {importModal === 'products' ? (
          <Suspense fallback={<LazyPanelLoader />}>
            <ImportProductsModal
              onSuccess={() => { setImportModal(null) }}
              onCancel={() => setImportModal(null)}
            />
          </Suspense>
        ) : null}
      </Modal>

      <Modal isOpen={importModal === 'bonos'} title="Importar Bonos" onClose={() => setImportModal(null)}>
        {importModal === 'bonos' ? (
          <Suspense fallback={<LazyPanelLoader />}>
            <ImportBonosModal
              onSuccess={() => { setImportModal(null) }}
              onCancel={() => setImportModal(null)}
            />
          </Suspense>
        ) : null}
      </Modal>

      <Modal isOpen={importModal === 'abonos'} title="Importar Abonos" onClose={() => setImportModal(null)}>
        {importModal === 'abonos' ? (
          <Suspense fallback={<LazyPanelLoader />}>
            <ImportAbonosModal
              onSuccess={() => { setImportModal(null) }}
              onCancel={() => setImportModal(null)}
            />
          </Suspense>
        ) : null}
      </Modal>

      <Modal
        isOpen={importModal === 'clientBonos'}
        title="Importar Bonos de clientes"
        onClose={() => setImportModal(null)}
      >
        {importModal === 'clientBonos' ? (
          <Suspense fallback={<LazyPanelLoader />}>
            <ImportClientBonosModal
              onSuccess={() => { setImportModal(null) }}
              onCancel={() => setImportModal(null)}
            />
          </Suspense>
        ) : null}
      </Modal>
    </div>
  )
}
