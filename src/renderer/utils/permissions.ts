export const SECTION_KEYS = [
  'dashboard',
  'clients',
  'ranking',
  'appointments',
  'services',
  'products',
  'sales',
  'cash',
  'settings'
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

export interface UserPermissions {
  sections?: SectionKey[] | string[]
  cash?: {
    showPaymentsByMethod?: boolean
    showCurrentBalance?: boolean
  }
}

type PermissionUser = {
  role?: string | null
  permissions?: UserPermissions | string | null
}

export const SECTION_ROUTE_PATHS: Array<{ section: SectionKey; path: string }> = [
  { section: 'dashboard', path: '/app/dashboard' },
  { section: 'clients', path: '/clients' },
  { section: 'ranking', path: '/ranking' },
  { section: 'appointments', path: '/appointments' },
  { section: 'services', path: '/services' },
  { section: 'products', path: '/products' },
  { section: 'sales', path: '/sales' },
  { section: 'cash', path: '/cash' },
  { section: 'settings', path: '/settings' }
]

const parsePermissions = (permissions: PermissionUser['permissions']): UserPermissions | null => {
  if (!permissions) return null
  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions)
      return parsed && typeof parsed === 'object' ? (parsed as UserPermissions) : null
    } catch {
      return null
    }
  }
  return permissions
}

export const getAllowedSections = (user: PermissionUser | null | undefined): string[] => {
  if (user?.role === 'ADMIN') {
    return [...SECTION_KEYS]
  }

  const sections = parsePermissions(user?.permissions)?.sections
  if (!Array.isArray(sections)) {
    return []
  }

  return sections.filter((section): section is string => typeof section === 'string')
}

export const hasSectionAccess = (
  user: PermissionUser | null | undefined,
  section: SectionKey
) => {
  if (user?.role === 'ADMIN') return true
  return getAllowedSections(user).includes(section)
}

export const hasAnySectionAccess = (
  user: PermissionUser | null | undefined,
  sections: SectionKey[]
) => {
  if (user?.role === 'ADMIN') return true
  const allowedSections = getAllowedSections(user)
  return sections.some((section) => allowedSections.includes(section))
}

export const getFirstAccessiblePath = (user: PermissionUser | null | undefined) => {
  if (user?.role === 'ADMIN') return '/app/dashboard'

  const allowedSections = getAllowedSections(user)
  return SECTION_ROUTE_PATHS.find(({ section }) => allowedSections.includes(section))?.path ?? '/no-access'
}
