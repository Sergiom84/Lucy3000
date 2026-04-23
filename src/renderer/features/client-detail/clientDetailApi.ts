import type { ClientAssetsResponse } from '../../utils/desktop'
import { isDesktop, listClientAssets } from '../../utils/desktop'
import api from '../../utils/api'

export const fetchClientDetail = async (clientId: string) => {
  const response = await api.get(`/clients/${clientId}`)
  return response.data
}

export const fetchAccountBalanceHistory = async (clientId: string, limit = 60) => {
  const response = await api.get(`/bonos/account-balance/${clientId}/history`, {
    params: { limit }
  })
  return response.data
}

export const fetchClientQuotes = async (clientId: string) => {
  const response = await api.get(`/quotes/client/${clientId}`)
  return Array.isArray(response.data) ? response.data : []
}

export const fetchClientAssets = async (client: {
  id: string
  firstName?: string | null
  lastName?: string | null
}): Promise<ClientAssetsResponse | null> => {
  if (!isDesktop()) {
    return null
  }

  return listClientAssets(client.id, `${client.firstName || ''} ${client.lastName || ''}`.trim())
}

export const deleteClientQuote = async (quoteId: string) => {
  await api.delete(`/quotes/${quoteId}`)
}

export const updateClientAppointmentStatus = async (
  appointmentId: string,
  status: 'CANCELLED' | 'NO_SHOW'
) => {
  await api.put(`/appointments/${appointmentId}`, { status })
}

export const collectPendingSale = async (
  saleId: string,
  payload: {
    amount: number
    operationDate: string
    paymentMethod: 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
    showInOfficialCash?: boolean
    accountBalanceUsageAmount?: number
  }
) => {
  const response = await api.post(`/sales/${saleId}/collect-pending`, payload)
  return response.data
}

export const fetchSaleDetail = async (saleId: string) => {
  const response = await api.get(`/sales/${saleId}`)
  return response.data
}

export const consumeBonoPack = async (bonoPackId: string) => {
  await api.put(`/bonos/${bonoPackId}/consume`)
}

export const deleteBonoPack = async (bonoPackId: string) => {
  await api.delete(`/bonos/${bonoPackId}`)
}

export const updateClientRecord = async (clientId: string, payload: Record<string, unknown>) => {
  const response = await api.put(`/clients/${clientId}`, payload)
  return response.data
}

export const createAccountBalanceTopUp = async (
  clientId: string,
  payload: {
    amount: number
    paymentMethod: 'CASH' | 'CARD' | 'BIZUM'
    operationDate: string
    description?: string | null
    notes?: string | null
  }
) => {
  await api.post(`/bonos/account-balance/${clientId}/top-up`, payload)
}
