import fs from 'fs'
import path from 'path'
import { promises as fsPromises } from 'fs'
import { app, BrowserWindow, dialog, shell } from 'electron'
import type { ResetRuntimeDataResult } from '../shared/electron'
import type { BackendRuntime } from './backendRuntime'
import { getMainWindow } from './windowState'
import { getProductionDbPath, buildRuntimeDataPaths } from './runtimePaths'
import { writeMainLog } from './logging'

export type RuntimeDataService = ReturnType<typeof createRuntimeDataService>

export const createRuntimeDataService = (options: {
  isDevelopment: boolean
  backendRuntime: Pick<BackendRuntime, 'stopBackendGracefully'>
}) => {
  const openRuntimeDataFolder = async () => {
    const runtimeInfo = buildRuntimeDataPaths(options.isDevelopment)
    const result = await shell.openPath(runtimeInfo.userDataPath)

    if (result) {
      writeMainLog('error', 'Failed to open runtime data folder', {
        userDataPath: runtimeInfo.userDataPath,
        result
      })
      return { success: false, error: result, path: runtimeInfo.userDataPath }
    }

    return { success: true, path: runtimeInfo.userDataPath }
  }

  const performRuntimeDataReset = async (): Promise<ResetRuntimeDataResult> => {
    const dbPath = getProductionDbPath()
    const userDataPath = app.getPath('userData')

    try {
      if (!options.isDevelopment) {
        await options.backendRuntime.stopBackendGracefully()
      }

      let backupPath: string | null = null
      if (fs.existsSync(dbPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        backupPath = path.join(userDataPath, `lucy3000-reset-backup-${timestamp}.db`)
        await fsPromises.copyFile(dbPath, backupPath)
        await fsPromises.unlink(dbPath)
      }

      writeMainLog('info', 'Runtime data reset requested', {
        dbPath,
        backupPath,
        userDataPath
      })

      return {
        success: true,
        dbPath,
        backupPath,
        userDataPath,
        requiresRelaunch: !options.isDevelopment
      }
    } catch (error) {
      writeMainLog('error', 'Failed to reset runtime data', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        dbPath,
        userDataPath,
        requiresRelaunch: !options.isDevelopment
      }
    }
  }

  const showDatabaseHelpDialog = async () => {
    const runtimeInfo = buildRuntimeDataPaths(options.isDevelopment)
    const parentWindow = getMainWindow() ?? BrowserWindow.getFocusedWindow()
    const showMessageBox = (messageBoxOptions: Electron.MessageBoxOptions) =>
      parentWindow ? dialog.showMessageBox(parentWindow, messageBoxOptions) : dialog.showMessageBox(messageBoxOptions)

    const result = await showMessageBox({
      type: 'info',
      title: 'Lucy3000 - datos locales',
      message: 'Datos locales de soporte',
      detail: [
        'Lucy3000 SaaS usa una base PostgreSQL central.',
        'Esta carpeta conserva logs, configuración del wrapper y datos legacy de instalaciones antiguas.',
        '',
        `Ruta legacy de BD local: ${runtimeInfo.dbPath}`,
        `Carpeta de datos: ${runtimeInfo.userDataPath}`
      ].join('\n'),
      buttons: ['Abrir carpeta de datos', 'Restablecer datos locales', 'Cerrar'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })

    if (result.response === 0) {
      await openRuntimeDataFolder()
      return
    }

    if (result.response !== 1) {
      return
    }

    const confirmation = await showMessageBox({
      type: 'warning',
      title: 'Confirmar restablecimiento local',
      message: 'Esto archivará datos locales legacy y reiniciará la app.',
      detail:
        'Lucy3000 moverá la base local antigua, si existe, a una copia de seguridad dentro de la carpeta de datos. No modifica la base SaaS central.',
      buttons: ['Cancelar', 'Restablecer'],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    })

    if (confirmation.response !== 1) {
      return
    }

    const resetResult = await performRuntimeDataReset()
    if (!resetResult.success) {
      dialog.showErrorBox('No se pudieron restablecer los datos locales', resetResult.error || 'Error desconocido')
      return
    }

    if (resetResult.requiresRelaunch) {
      const completed = await showMessageBox({
        type: 'info',
        title: 'Datos locales restablecidos',
        message: 'Lucy3000 se reiniciará para aplicar el cambio.',
        detail: resetResult.backupPath
          ? `Copia de seguridad creada en:\n${resetResult.backupPath}`
          : 'No existía una base previa que archivar.',
        buttons: ['Reiniciar ahora'],
        defaultId: 0,
        noLink: true
      })

      if (completed.response === 0) {
        setTimeout(() => {
          app.relaunch()
          app.quit()
        }, 150)
      }
    }
  }

  return {
    buildRuntimeDataPaths: () => buildRuntimeDataPaths(options.isDevelopment),
    openRuntimeDataFolder,
    performRuntimeDataReset,
    showDatabaseHelpDialog
  }
}
