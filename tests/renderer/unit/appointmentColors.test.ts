import { describe, expect, it } from 'vitest'
import {
  getAppointmentColorTheme,
  resolveAppointmentLegend,
  type AppointmentLegendItem
} from '../../../src/renderer/utils/appointmentColors'

const legendItems: AppointmentLegendItem[] = [
  { id: '1', category: 'Corporal', color: '#0F766E', sortOrder: 0 },
  { id: '2', category: 'Cejas y pestañas', color: '#7C3AED', sortOrder: 1 },
  { id: '3', category: 'Dep. electrica', color: '#2563EB', sortOrder: 2 }
]

describe('appointmentColors', () => {
  it('matches legends ignoring accents and case', () => {
    const result = resolveAppointmentLegend(legendItems, 'CEJAS Y Pestanas')

    expect(result?.id).toBe('2')
  })

  it('prefers the most specific legend name when several legends could match', () => {
    const result = resolveAppointmentLegend(
      [
        { id: 'a', category: 'Cera', color: '#EA580C', sortOrder: 0 },
        { id: 'b', category: 'Cera mujer', color: '#BE123C', sortOrder: 1 }
      ],
      'Cera mujer'
    )

    expect(result?.id).toBe('b')
  })

  it('returns the fallback palette when there is no matching legend', () => {
    const theme = getAppointmentColorTheme(legendItems, 'Medicina')

    expect(theme.background).toBe('#4338CA')
    expect(theme.text).toBe('#F8FAFC')
  })
})
