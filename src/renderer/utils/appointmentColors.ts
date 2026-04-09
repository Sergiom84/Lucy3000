export type AppointmentColorTheme = {
  background: string
  text: string
  softBackground: string
  border: string
}

type TreatmentThemeKey =
  | 'CEJAS_Y_PESTANAS'
  | 'CERA_HOMBRE'
  | 'CERA_MUJER'
  | 'CORPORAL'
  | 'DEP_ELECTRICA'
  | 'FACIAL'
  | 'MEDICINA'
  | 'MICROPIGMENTACION'
  | 'SHR'
  | 'VENTA'
  | 'OTROS'

const TREATMENT_COLOR_PALETTES: Record<TreatmentThemeKey, AppointmentColorTheme> = {
  CEJAS_Y_PESTANAS: {
    background: '#7C3AED',
    text: '#F5F3FF',
    softBackground: '#EDE9FE',
    border: '#C4B5FD'
  },
  CERA_HOMBRE: {
    background: '#92400E',
    text: '#FFFBEB',
    softBackground: '#FEF3C7',
    border: '#FCD34D'
  },
  CERA_MUJER: {
    background: '#BE123C',
    text: '#FFF1F2',
    softBackground: '#FFE4E6',
    border: '#FDA4AF'
  },
  CORPORAL: {
    background: '#0F766E',
    text: '#F0FDFA',
    softBackground: '#CCFBF1',
    border: '#5EEAD4'
  },
  DEP_ELECTRICA: {
    background: '#1D4ED8',
    text: '#EFF6FF',
    softBackground: '#DBEAFE',
    border: '#93C5FD'
  },
  FACIAL: {
    background: '#15803D',
    text: '#F0FDF4',
    softBackground: '#DCFCE7',
    border: '#86EFAC'
  },
  MEDICINA: {
    background: '#475569',
    text: '#F8FAFC',
    softBackground: '#E2E8F0',
    border: '#94A3B8'
  },
  MICROPIGMENTACION: {
    background: '#C026D3',
    text: '#FDF4FF',
    softBackground: '#FAE8FF',
    border: '#E879F9'
  },
  SHR: {
    background: '#EA580C',
    text: '#FFF7ED',
    softBackground: '#FFEDD5',
    border: '#FDBA74'
  },
  VENTA: {
    background: '#0284C7',
    text: '#F0F9FF',
    softBackground: '#E0F2FE',
    border: '#7DD3FC'
  },
  OTROS: {
    background: '#4338CA',
    text: '#EEF2FF',
    softBackground: '#E0E7FF',
    border: '#A5B4FC'
  }
}

export const TREATMENT_CATEGORY_LABELS: Array<{ key: TreatmentThemeKey; label: string }> = [
  { key: 'CEJAS_Y_PESTANAS', label: 'Cejas y pestañas' },
  { key: 'CERA_HOMBRE', label: 'Cera hombre' },
  { key: 'CERA_MUJER', label: 'Cera mujer' },
  { key: 'CORPORAL', label: 'Corporal' },
  { key: 'DEP_ELECTRICA', label: 'Dep. electrica' },
  { key: 'FACIAL', label: 'Facial' },
  { key: 'MEDICINA', label: 'Medicina' },
  { key: 'MICROPIGMENTACION', label: 'Micropigmentacion' },
  { key: 'SHR', label: 'SHR' },
  { key: 'VENTA', label: 'Venta' }
]

const normalizeText = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()

const resolveTreatmentThemeKey = (
  serviceCategory: string | null | undefined,
  serviceName: string | null | undefined
): TreatmentThemeKey => {
  const category = normalizeText(serviceCategory)
  const name = normalizeText(serviceName)
  const haystack = `${category} ${name}`

  if (haystack.includes('cejasypestanas')) return 'CEJAS_Y_PESTANAS'
  if (haystack.includes('cerahombre')) return 'CERA_HOMBRE'
  if (haystack.includes('ceramujer')) return 'CERA_MUJER'
  if (haystack.includes('corporal')) return 'CORPORAL'
  if (haystack.includes('depelectrica') || haystack.includes('depilacionelectrica') || haystack.includes('electrica')) {
    return 'DEP_ELECTRICA'
  }
  if (haystack.includes('facial')) return 'FACIAL'
  if (haystack.includes('medicina')) return 'MEDICINA'
  if (haystack.includes('micropigmentacion')) return 'MICROPIGMENTACION'
  if (haystack.includes('shr')) return 'SHR'
  if (haystack.includes('venta')) return 'VENTA'

  return 'OTROS'
}

export const getAppointmentColorTheme = (
  serviceCategory: string | null | undefined,
  serviceName: string | null | undefined
): AppointmentColorTheme => {
  const themeKey = resolveTreatmentThemeKey(serviceCategory, serviceName)
  return TREATMENT_COLOR_PALETTES[themeKey]
}
