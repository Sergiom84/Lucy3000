import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserPermissions } from '../utils/permissions'

export type { UserPermissions } from '../utils/permissions'

interface User {
  id: string
  email: string
  username?: string | null
  name: string
  role: string
  tenantId?: string
  permissions?: UserPermissions | null
  tenant?: {
    id: string
    name: string
    slug: string
    tenantCode?: number | null
  } | null
  license?: {
    status: string
    reason: string
    trialEndsAt: string
  } | null
  isPlatformAdmin?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  bootstrapRequired: boolean
  bootstrapChecked: boolean
  login: (user: User, token: string) => void
  logout: () => void
  updateUser: (user: User) => void
  setBootstrapStatus: (required: boolean) => void
  resetBootstrapStatus: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      bootstrapRequired: false,
      bootstrapChecked: false,
      login: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
          bootstrapRequired: false,
          bootstrapChecked: true
        }),
      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          bootstrapRequired: false,
          bootstrapChecked: false
        }),
      updateUser: (user) => set({ user }),
      setBootstrapStatus: (required) =>
        set({
          bootstrapRequired: required,
          bootstrapChecked: true
        }),
      resetBootstrapStatus: () =>
        set({
          bootstrapRequired: false,
          bootstrapChecked: false
        })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)
