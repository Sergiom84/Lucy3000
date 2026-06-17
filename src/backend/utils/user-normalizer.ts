export const parseUserPermissions = (permissions: unknown): Record<string, unknown> => {
  if (!permissions) {
    return {}
  }
  if (typeof permissions === 'string') {
    try {
      return JSON.parse(permissions)
    } catch {
      return {}
    }
  }
  if (typeof permissions === 'object') {
    return permissions as Record<string, unknown>
  }
  return {}
}

export const normalizeUser = (user: any) => {
  if (!user) {
    return user
  }
  return {
    ...user,
    permissions: parseUserPermissions(user.permissions)
  }
}

export const normalizeUsers = (users: any[]) => {
  return users.map(normalizeUser)
}
