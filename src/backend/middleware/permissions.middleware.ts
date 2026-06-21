import type { Response, NextFunction } from 'express'
import type { AuthRequest } from './auth.middleware'

export type SectionPermission =
  | 'dashboard'
  | 'clients'
  | 'ranking'
  | 'appointments'
  | 'services'
  | 'products'
  | 'sales'
  | 'cash'
  | 'settings'

const getAllowedSections = (permissions: unknown): string[] => {
  if (!permissions || typeof permissions !== 'object') {
    return []
  }

  const sections = (permissions as { sections?: unknown }).sections
  if (!Array.isArray(sections)) {
    return []
  }

  return sections.filter((section): section is string => typeof section === 'string')
}

export const requireSectionAccess =
  (...sections: SectionPermission[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (req.user.role === 'ADMIN') {
      return next()
    }

    const allowedSections = getAllowedSections(req.user.permissions)
    const hasAccess = sections.some((section) => allowedSections.includes(section))

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Section access required',
        sections
      })
    }

    return next()
  }
