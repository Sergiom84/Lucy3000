import { describe, expect, it } from 'vitest'
import {
  buildDesktopEnvPath,
  buildPrinterConfig,
  getPrinterConfigValidationError,
  resolveSettingsApiOrigin
} from '../../../src/renderer/features/settings/settingsHelpers'

describe('settingsHelpers', () => {
  it('resolves api origin from a valid base url', () => {
    expect(resolveSettingsApiOrigin('http://localhost:8787/api', 'http://localhost:5173')).toBe('http://localhost:8787')
  })

  it('falls back to window origin when the base url is invalid', () => {
    expect(resolveSettingsApiOrigin('://bad-url', 'http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('builds the adjacent .env path from the desktop executable path', () => {
    expect(buildDesktopEnvPath('C:\\Lucy3000\\Lucy3000.exe')).toBe('C:\\Lucy3000\\.env')
  })

  it('validates network printer config', () => {
    const config = buildPrinterConfig('network', '', '192.168.1.25', '9100')
    expect(getPrinterConfigValidationError(config)).toBeNull()
  })

  it('rejects invalid ticket printer port', () => {
    const config = buildPrinterConfig('network', '', '192.168.1.25', '99999')
    expect(getPrinterConfigValidationError(config)).toBe('Introduce un puerto válido entre 1 y 65535')
  })
})
