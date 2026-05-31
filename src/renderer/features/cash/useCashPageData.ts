import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchCashAnalytics,
  fetchCashClients,
  fetchCashFilterOptions,
  fetchCashHistory,
  fetchCashOverview,
  fetchCashRanking,
  fetchCashSummary,
  fetchPrivateNoTicketCash
} from './cashApi'
import type {
  CashAnalyticsRow,
  CashClientOption,
  CashDateRange,
  CashFilters,
  CashHistoryEntry,
  CashOverview,
  CashProductOption,
  CashRanking,
  CashRegister,
  CashServiceOption,
  CashSummary,
  Period,
  PrivateCashRow
} from './types'

type UseCashPageDataArgs = {
  dateRange: CashDateRange
  filters: CashFilters
  period: Period
}

export const useCashPageData = ({ dateRange, filters, period }: UseCashPageDataArgs) => {
  const [activeCashRegister, setActiveCashRegister] = useState<CashRegister | null>(null)
  const [summary, setSummary] = useState<CashSummary | null>(null)
  const [analyticsRows, setAnalyticsRows] = useState<CashAnalyticsRow[]>([])
  const [ranking, setRanking] = useState<CashRanking | null>(null)
  const [initialDataLoaded, setInitialDataLoaded] = useState(false)
  const [clients, setClients] = useState<CashClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [services, setServices] = useState<CashServiceOption[]>([])
  const [products, setProducts] = useState<CashProductOption[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [privateCashRows, setPrivateCashRows] = useState<PrivateCashRow[]>([])
  const [privateCashTotal, setPrivateCashTotal] = useState(0)
  const [privateCashLoading, setPrivateCashLoading] = useState(false)
  const [cashHistory, setCashHistory] = useState<CashHistoryEntry[]>([])
  const [cashOverview, setCashOverview] = useState<CashOverview | null>(null)
  const [cashOverviewLoading, setCashOverviewLoading] = useState(false)
  const clientOptionsRequest = useRef(0)

  const loadSummary = async () => {
    try {
      const nextSummary = await fetchCashSummary()
      setSummary(nextSummary)
      setActiveCashRegister(nextSummary.activeCashRegister || null)
    } catch {
      toast.error('No se pudo cargar el resumen de caja')
    }
  }

  const loadFilterOptions = async () => {
    try {
      const nextOptions = await fetchCashFilterOptions()
      setServices(nextOptions.services)
      setProducts(nextOptions.products)
    } catch {
      toast.error('No se pudieron cargar los filtros de caja')
    }
  }

  const loadClientOptions = async (search = '') => {
    const requestId = clientOptionsRequest.current + 1
    clientOptionsRequest.current = requestId

    try {
      setClientsLoading(true)
      const nextClients = await fetchCashClients(search)
      if (requestId === clientOptionsRequest.current) {
        setClients(nextClients)
      }
    } catch {
      if (requestId === clientOptionsRequest.current) {
        setClients([])
      }
      toast.error('No se pudieron cargar las clientas')
    } finally {
      if (requestId === clientOptionsRequest.current) {
        setClientsLoading(false)
      }
    }
  }

  const loadAnalytics = async (nextDateRange: CashDateRange = dateRange) => {
    try {
      setAnalyticsLoading(true)
      const nextAnalytics = await fetchCashAnalytics(period, filters, nextDateRange)
      setAnalyticsRows(nextAnalytics.rows)
    } catch {
      toast.error('No se pudo cargar la analítica de caja')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const loadRanking = async (nextDateRange: CashDateRange = dateRange) => {
    try {
      const nextRanking = await fetchCashRanking(period, filters, nextDateRange)
      setRanking(nextRanking)
    } catch {
      toast.error('No se pudo cargar el ranking')
    }
  }

  const loadCashHistory = async () => {
    try {
      const nextHistory = await fetchCashHistory()
      setCashHistory(nextHistory)
      return true
    } catch {
      toast.error('No se pudo cargar el historial de caja')
      return false
    }
  }

  const loadCashOverview = async (nextDateRange: CashDateRange = dateRange) => {
    try {
      setCashOverviewLoading(true)
      const nextOverview = await fetchCashOverview(period, filters, nextDateRange)
      setCashOverview(nextOverview)
      return true
    } catch {
      toast.error('No se pudo cargar el resumen de caja')
      return false
    } finally {
      setCashOverviewLoading(false)
    }
  }

  const clearPrivateCashData = () => {
    setPrivateCashRows([])
    setPrivateCashTotal(0)
  }

  const loadPrivateNoTicketCash = async (options: {
    pin: string
    startDate: string
    endDate: string
  }) => {
    try {
      setPrivateCashLoading(true)
      const response = await fetchPrivateNoTicketCash(options)
      setPrivateCashRows(response.rows || [])
      setPrivateCashTotal(Number(response.totalAmount || 0))
      return true
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo abrir la sección privada')
      return false
    } finally {
      setPrivateCashLoading(false)
    }
  }

  useEffect(() => {
    const bootstrapCashPage = async () => {
      await loadSummary()
      await loadFilterOptions()
      setInitialDataLoaded(true)
    }

    void bootstrapCashPage()
  }, [])

  useEffect(() => {
    if (!initialDataLoaded) return
    void Promise.all([loadAnalytics(), loadRanking(), loadCashOverview()])
  }, [dateRange.endDate, dateRange.startDate, filters, initialDataLoaded, period])

  return {
    activeCashRegister,
    analyticsLoading,
    analyticsRows,
    cashHistory,
    cashOverview,
    cashOverviewLoading,
    clearPrivateCashData,
    clients,
    clientsLoading,
    loadCashHistory,
    loadAnalytics,
    loadCashOverview,
    loadClientOptions,
    loadPrivateNoTicketCash,
    loadRanking,
    loadSummary,
    privateCashLoading,
    privateCashRows,
    privateCashTotal,
    products,
    ranking,
    services,
    summary
  }
}
