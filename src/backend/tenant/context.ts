import { AsyncLocalStorage } from 'async_hooks'

export type TenantContext = {
  tenantId: string
  userId?: string
  isPlatformAdmin?: boolean
  licenseStatus?: string
}

const tenantStorage = new AsyncLocalStorage<TenantContext>()

export const runWithTenantContext = <T>(context: TenantContext, callback: () => T) =>
  tenantStorage.run(context, callback)

export const getTenantContext = () => tenantStorage.getStore() ?? null

export const getTenantId = () => getTenantContext()?.tenantId ?? null

export const requireTenantId = () => {
  const tenantId = getTenantId()
  if (!tenantId) {
    throw new Error('Tenant context is required for this operation')
  }
  return tenantId
}
