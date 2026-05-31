import api from '../../utils/api'
import type {
  CashAnalyticsRow,
  CashClientOption,
  CashDateRange,
  CashFilterOptions,
  CashFilters,
  CashHistoryEntry,
  CashOverview,
  CashRanking,
  CashSummary,
  Period,
  PrivateNoTicketCashResponse
} from './types'

const CLIENT_FILTER_LIMIT = 50

const buildCashAnalyticsParams = (
  period: Period,
  filters: CashFilters,
  dateRange?: CashDateRange
) => {
  const apiPeriod = period === 'CUSTOM' ? 'DAY' : period

  return {
    period: apiPeriod,
    startDate: dateRange?.startDate || undefined,
    endDate: dateRange?.endDate || undefined,
    ...filters,
    clientId: filters.clientId || undefined,
    serviceId: filters.serviceId || undefined,
    productId: filters.productId || undefined,
    paymentMethod: filters.paymentMethod || undefined
  }
}

export const fetchCashSummary = async (): Promise<CashSummary> => {
  const response = await api.get('/cash/summary')
  return response.data
}

export const fetchCashFilterOptions = async (): Promise<CashFilterOptions> => {
  const [servicesRes, productsRes] = await Promise.all([
    api.get('/services?isActive=true'),
    api.get('/products?isActive=true')
  ])

  return {
    clients: [],
    products: productsRes.data,
    services: servicesRes.data
  }
}

export const fetchCashClients = async (search = ''): Promise<CashClientOption[]> => {
  const params = new URLSearchParams({
    isActive: 'true',
    limit: String(CLIENT_FILTER_LIMIT)
  })
  const normalizedSearch = search.trim()
  if (normalizedSearch) {
    params.set('search', normalizedSearch)
  }

  const response = await api.get(`/clients/catalog?${params.toString()}`)
  return Array.isArray(response.data) ? response.data : []
}

export const fetchCashAnalytics = async (
  period: Period,
  filters: CashFilters,
  dateRange?: CashDateRange
): Promise<{ rows: CashAnalyticsRow[] }> => {
  const response = await api.get<{ rows: CashAnalyticsRow[] }>('/cash/analytics', {
    params: buildCashAnalyticsParams(period, filters, dateRange)
  })

  return response.data
}

export const fetchCashRanking = async (
  period: Period,
  filters: CashFilters,
  dateRange?: CashDateRange
): Promise<CashRanking> => {
  const response = await api.get<CashRanking>('/cash/analytics/ranking', {
    params: buildCashAnalyticsParams(period, filters, dateRange)
  })

  return response.data
}

export const fetchCashOverview = async (
  period: Period,
  filters: CashFilters,
  dateRange?: CashDateRange
): Promise<CashOverview> => {
  const response = await api.get<CashOverview>('/cash/overview', {
    params: buildCashAnalyticsParams(period, filters, dateRange)
  })

  return response.data
}

export const fetchCashHistory = async (): Promise<CashHistoryEntry[]> => {
  const response = await api.get<CashHistoryEntry[]>('/cash')
  return response.data
}

export const fetchPrivateNoTicketCash = async (payload: {
  pin: string
  startDate: string
  endDate: string
}): Promise<PrivateNoTicketCashResponse> => {
  const response = await api.get<PrivateNoTicketCashResponse>('/cash/private/no-ticket-cash', {
    params: payload
  })

  return response.data
}

export const openCashRegister = async (payload: {
  openingBalance?: number
  notes?: string | null
  useLastClosureFloat?: boolean
}) => {
  await api.post('/cash/open', payload)
}

export const addCashRegisterMovement = async (
  cashRegisterId: string,
  payload: {
    type: 'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'
    amount: number
    category: string
    description: string
    paymentMethod?: 'CASH' | 'CARD' | 'BIZUM' | 'OTHER' | null
    reference?: string | null
  }
) => {
  await api.post(`/cash/${cashRegisterId}/movements`, payload)
}

export const updateCashOpeningBalance = async (
  cashRegisterId: string,
  payload: {
    openingBalance: number
    notes?: string | null
  }
) => {
  await api.put(`/cash/${cashRegisterId}/opening-balance`, payload)
}

export const saveCashCount = async (
  cashRegisterId: string,
  payload: {
    denominations: Record<string, number>
    isBlind: boolean
    appliedAsClose?: boolean
    notes?: string | null
  }
) => {
  await api.post(`/cash/${cashRegisterId}/counts`, payload)
}

export const closeCashRegister = async (
  cashRegisterId: string,
  payload: {
    countedTotal: number
    countedDenominations: Record<string, number>
    nextDayFloat: number
    nextDayFloatDenominations: Record<string, number>
    differenceReason?: string | null
    notes?: string | null
  }
) => {
  await api.post(`/cash/${cashRegisterId}/close`, payload)
}
