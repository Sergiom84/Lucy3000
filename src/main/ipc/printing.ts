import { ipcMain } from 'electron'
import type { PdfPrintPayload } from '../../shared/electron'
import type { TicketPrintPayload, TicketPrinterConfig } from '../../shared/ticketPrinter'
import type { PrintingRuntime } from '../printing'

export const registerPrintingIpcHandlers = (printingRuntime: PrintingRuntime) => {
  ipcMain.handle('ticket:listPrinters', async () => printingRuntime.listPrinters())
  ipcMain.handle('ticket:getConfig', async () => printingRuntime.getConfig())
  ipcMain.handle('ticket:setConfig', async (_, config: TicketPrinterConfig) => printingRuntime.setConfig(config))
  ipcMain.handle('ticket:getPrinter', async () => printingRuntime.getPrinter())
  ipcMain.handle('ticket:setPrinter', async (_, printerName: string | null) =>
    printingRuntime.setPrinter(printerName)
  )
  ipcMain.handle('ticket:print', async (_, payload: TicketPrintPayload) => printingRuntime.printTicket(payload))
  ipcMain.handle('print:pdf', async (_, payload: PdfPrintPayload) => printingRuntime.printPdf(payload))
}
