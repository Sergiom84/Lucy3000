import type { Client, SalesView } from './types'

export const resolveSalesView = (queryView: string | null): SalesView => {
  if (queryView === 'history') return 'history'
  if (queryView === 'account-balance') return 'account-balance'
  return 'pos'
}

export const formatFamilyLabel = (value: string): string =>
  value
    .toLowerCase()
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

export const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export const parsePositiveNumericInput = (value: string): number => {
  const parsed = Number.parseFloat(String(value || '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export const mapSaleClient = (client: any): Client | null => {
  if (!client?.id) return null

  return {
    id: client.id,
    firstName: String(client.firstName || ''),
    lastName: String(client.lastName || ''),
    phone: String(client.phone || client.mobilePhone || client.landlinePhone || ''),
    email: client.email || undefined,
    loyaltyPoints: Number(client.loyaltyPoints || 0),
    accountBalance:
      client.accountBalance === null || client.accountBalance === undefined
        ? null
        : Number(client.accountBalance || 0)
  }
}

export const getSaleItemLabel = (item: any) =>
  String(item?.service?.name || item?.product?.name || item?.description || 'Item').trim()
