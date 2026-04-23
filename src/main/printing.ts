import path from 'path'
import { promises as fsPromises } from 'fs'
import { BrowserWindow, dialog } from 'electron'
import { printNetworkTicket } from './escpos'
import { ensureDir, readJsonFile, writeJsonFile } from './fileUtils'
import { getMainWindow } from './windowState'
import { getPrinterConfigPath } from './runtimePaths'
import { buildTicketHtml } from '../shared/ticketHtml'
import {
  DEFAULT_TICKET_PRINTER_CONFIG,
  normalizeTicketPrinterConfig,
  validateTicketPrinterConfig
} from '../shared/ticketPrinter'
import type {
  PdfPrintPayload,
  PdfPrintResult,
  TicketPrintResult,
  TicketPrinterSelection,
  TicketPrinterSummary
} from '../shared/electron'
import type { TicketPrintPayload, TicketPrinterConfig } from '../shared/ticketPrinter'

export type PrintingRuntime = ReturnType<typeof createPrintingRuntime>

export const createPrintingRuntime = () => {
  const getTicketPrinterConfig = async (): Promise<TicketPrinterConfig> => {
    const config = await readJsonFile<unknown>(getPrinterConfigPath(), DEFAULT_TICKET_PRINTER_CONFIG)
    return normalizeTicketPrinterConfig(config)
  }

  const setTicketPrinterConfig = async (config: unknown) => {
    const normalizedConfig = normalizeTicketPrinterConfig(config)
    await writeJsonFile(getPrinterConfigPath(), normalizedConfig)
    return normalizedConfig
  }

  return {
    listPrinters: async (): Promise<TicketPrinterSummary[]> => {
      const printers = await (getMainWindow()?.webContents.getPrintersAsync() || Promise.resolve([]))
      return printers.map((printer) => ({
        name: printer.name,
        displayName: printer.displayName,
        isDefault: printer.isDefault
      }))
    },
    getConfig: getTicketPrinterConfig,
    setConfig: (config: TicketPrinterConfig) => setTicketPrinterConfig(config),
    getPrinter: async (): Promise<TicketPrinterSelection> => {
      const config = await getTicketPrinterConfig()
      return { ticketPrinterName: config.ticketPrinterName }
    },
    setPrinter: async (printerName: string | null) => {
      const currentConfig = await getTicketPrinterConfig()
      return setTicketPrinterConfig({
        ...currentConfig,
        mode: 'system',
        ticketPrinterName: printerName
      })
    },
    printTicket: async (payload: TicketPrintPayload): Promise<TicketPrintResult> => {
      const config = await getTicketPrinterConfig()
      const validation = validateTicketPrinterConfig(config)

      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      if (config.mode === 'network') {
        try {
          await printNetworkTicket({
            host: config.networkHost,
            port: config.networkPort,
            payload
          })

          return { success: true }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : error }
        }
      }

      const ticketWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true
        }
      })

      try {
        await ticketWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildTicketHtml(payload))}`)

        await new Promise<void>((resolve, reject) => {
          ticketWindow.webContents.print(
            {
              silent: true,
              printBackground: true,
              deviceName: config.ticketPrinterName || undefined,
              pageSize: {
                width: 58000,
                height: 200000
              },
              margins: {
                marginType: 'none'
              }
            },
            (success, failureReason) => {
              if (!success) {
                reject(new Error(failureReason || 'Print failed'))
                return
              }

              resolve()
            }
          )
        })

        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : error }
      } finally {
        ticketWindow.close()
      }
    },
    printPdf: async (data: PdfPrintPayload): Promise<PdfPrintResult> => {
      if (!data?.html || typeof data.html !== 'string') {
        return { success: false, error: 'Invalid PDF payload' }
      }

      const parentWindow = getMainWindow()
      const saveDialogOptions = {
        title: 'Guardar PDF',
        defaultPath: data.defaultFileName || `lucy3000_${new Date().toISOString().slice(0, 10)}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      }
      const saveResult = parentWindow
        ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions)

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true }
      }

      const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true
        }
      })

      try {
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(data.html)}`)

        const pdfBuffer = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          landscape: Boolean(data.landscape),
          pageSize: 'A4'
        })

        await ensureDir(path.dirname(saveResult.filePath))
        await fsPromises.writeFile(saveResult.filePath, pdfBuffer)

        return {
          success: true,
          filePath: saveResult.filePath
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      } finally {
        pdfWindow.close()
      }
    }
  }
}
