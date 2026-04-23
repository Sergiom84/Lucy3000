import type { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export const getMainWindow = () => mainWindow

export const setMainWindow = (nextWindow: BrowserWindow | null) => {
  mainWindow = nextWindow
}
