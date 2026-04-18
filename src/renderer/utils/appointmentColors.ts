export type AppointmentColorTheme = {
  background: string
  text: string
  softBackground: string
  border: string
}

export type AppointmentLegendItem = {
  id: string
  category: string
  color: string
  sortOrder?: number | null
}

const FALLBACK_APPOINTMENT_COLOR = '#4338CA'
const LIGHT_THEME_MIX = 0.86
const BORDER_THEME_MIX = 0.58

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const normalizeText = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()

const normalizeHexColor = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  return FALLBACK_APPOINTMENT_COLOR
}

const hexToRgb = (value: string) => {
  const normalized = normalizeHexColor(value)
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16)
  }
}

const rgbToHex = (red: number, green: number, blue: number) =>
  `#${[red, green, blue]
    .map((item) => clamp(Math.round(item), 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`

const mixHexColors = (baseColor: string, targetColor: string, ratio: number) => {
  const base = hexToRgb(baseColor)
  const target = hexToRgb(targetColor)

  return rgbToHex(
    base.red + (target.red - base.red) * ratio,
    base.green + (target.green - base.green) * ratio,
    base.blue + (target.blue - base.blue) * ratio
  )
}

const getContrastingTextColor = (color: string) => {
  const { red, green, blue } = hexToRgb(color)
  const relativeLuminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

  return relativeLuminance > 0.6 ? '#111827' : '#F8FAFC'
}

const sortLegendItemsForMatching = (legendItems: AppointmentLegendItem[]) =>
  [...legendItems].sort((left, right) => {
    const leftKey = normalizeText(left.category)
    const rightKey = normalizeText(right.category)
    const lengthCompare = rightKey.length - leftKey.length
    if (lengthCompare !== 0) return lengthCompare

    const leftOrder = Number(left.sortOrder ?? Number.MAX_SAFE_INTEGER)
    const rightOrder = Number(right.sortOrder ?? Number.MAX_SAFE_INTEGER)
    if (leftOrder !== rightOrder) return leftOrder - rightOrder

    return String(left.category || '').localeCompare(String(right.category || ''), 'es', {
      sensitivity: 'base'
    })
  })

export const resolveAppointmentLegend = (legendItems: AppointmentLegendItem[], serviceCategory: string | null | undefined) => {
  const category = normalizeText(serviceCategory)

  if (!category) {
    return null
  }

  return (
    sortLegendItemsForMatching(legendItems).find((item) => {
      const normalizedLegendName = normalizeText(item.category)
      return normalizedLegendName ? normalizedLegendName === category : false
    }) || null
  )
}

export const getAppointmentColorTheme = (
  legendItems: AppointmentLegendItem[],
  serviceCategory: string | null | undefined
): AppointmentColorTheme => {
  const matchedLegend = resolveAppointmentLegend(legendItems, serviceCategory)
  const background = normalizeHexColor(matchedLegend?.color || FALLBACK_APPOINTMENT_COLOR)

  return {
    background,
    text: getContrastingTextColor(background),
    softBackground: mixHexColors(background, '#FFFFFF', LIGHT_THEME_MIX),
    border: mixHexColors(background, '#FFFFFF', BORDER_THEME_MIX)
  }
}
