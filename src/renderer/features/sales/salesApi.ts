import api from '../../utils/api'
import {
  loadActiveProducts,
  loadAppointmentClients,
  loadAppointmentLegendItems,
  loadAppointmentProfessionals,
  loadAppointmentServices,
  loadBonoTemplates,
  preloadPointOfSaleCatalogs
} from '../../utils/appointmentCatalogs'
import type {
  AccountBalanceHistoryRow,
  Client,
  Sale,
  SalesCatalogState
} from './types'

export const preloadSalesCatalogs = () => preloadPointOfSaleCatalogs()

export const fetchSalesCatalog = async (): Promise<SalesCatalogState> => {
  const [productsResult, servicesResult, bonosResult, professionalsResult, legendItemsResult] = await Promise.allSettled([
    loadActiveProducts(),
    loadAppointmentServices(),
    loadBonoTemplates(),
    loadAppointmentProfessionals(),
    loadAppointmentLegendItems()
  ])

  return {
    products: productsResult.status === 'fulfilled' ? (productsResult.value as SalesCatalogState['products']) : [],
    services: servicesResult.status === 'fulfilled' ? (servicesResult.value as SalesCatalogState['services']) : [],
    bonoTemplates: bonosResult.status === 'fulfilled' ? (bonosResult.value as SalesCatalogState['bonoTemplates']) : [],
    professionals: professionalsResult.status === 'fulfilled' ? professionalsResult.value : [],
    legendItems: legendItemsResult.status === 'fulfilled' ? legendItemsResult.value : []
  }
}

export const fetchSalesClients = async (): Promise<Client[]> => {
  const nextClients = await loadAppointmentClients()
  return nextClients as Client[]
}

export const fetchSalesHistory = async (dateFilter: { startDate: string; endDate: string }) => {
  const params = new URLSearchParams()
  if (dateFilter.startDate) params.append('startDate', dateFilter.startDate)
  if (dateFilter.endDate) params.append('endDate', dateFilter.endDate)
  const response = await api.get(`/sales?${params.toString()}`)
  return response.data as Sale[]
}

export const createSaleRecord = async (payload: Record<string, unknown>) => {
  const response = await api.post('/sales', payload)
  return response.data as Sale
}

export const collectPendingSaleRecord = async (saleId: string, payload: Record<string, unknown>) => {
  const response = await api.post(`/sales/${saleId}/collect-pending`, payload)
  return response.data as Sale
}

export const fetchSaleDetail = async (saleId: string) => {
  const response = await api.get(`/sales/${saleId}`)
  return response.data as Sale
}

export const createQuoteRecord = async (payload: Record<string, unknown>) => {
  const response = await api.post('/quotes', payload)
  return response.data
}

export const fetchGlobalAccountBalanceHistory = async () => {
  const response = await api.get('/bonos/account-balance/history')
  const movements = Array.isArray(response.data?.movements) ? response.data.movements : []
  return movements as AccountBalanceHistoryRow[]
}

export const fetchPendingCollectionSaleDetail = async (saleId: string) => {
  const response = await api.get(`/sales/${saleId}`)
  return response.data as Sale
}
