import { getSettingByKey, saveSettingByKey } from './settings'

const CABINS_SETTING_KEY = 'center_cabins'

export type CabinEntry = { key: string; label: string }

const DEFAULT_CABINS: CabinEntry[] = [
  { key: 'LUCY', label: 'Lucy' },
  { key: 'TAMARA', label: 'Tamara' },
  { key: 'CABINA_1', label: 'Cabina 1' },
  { key: 'CABINA_2', label: 'Cabina 2' }
]

export const toCabinKey = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')

const parseStoredCabins = (value: string | null | undefined): CabinEntry[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CabinEntry =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.key === 'string' &&
        item.key.trim().length > 0 &&
        typeof item.label === 'string' &&
        item.label.trim().length > 0
    )
  } catch {
    return []
  }
}

export const getCabinCatalog = async (): Promise<CabinEntry[]> => {
  const setting = await getSettingByKey(CABINS_SETTING_KEY)
  const stored = parseStoredCabins(setting?.value)
  return stored.length > 0 ? stored : DEFAULT_CABINS
}

export const saveCabinCatalog = async (cabins: CabinEntry[]): Promise<CabinEntry[]> => {
  const unique = cabins.reduce<CabinEntry[]>((acc, item) => {
    const key = item.key.trim()
    const label = item.label.trim()
    if (!key || !label || acc.some((c) => c.key === key)) return acc
    acc.push({ key, label })
    return acc
  }, [])

  await saveSettingByKey({
    key: CABINS_SETTING_KEY,
    value: JSON.stringify(unique),
    description: 'Cabinas configuradas para agenda y citas'
  })

  return unique
}
