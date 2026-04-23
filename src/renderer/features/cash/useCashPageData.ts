import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchCashAnalytics,
  fetchCashFilterOptions,
  fetchCashHistory,
  fetchCashRanking,
  fetchCashSummary,
  fetchPrivateNoTicketCash
} from './cashApi'
import type {
  CashAnalyticsRow,
  CashClientOption,
  CashFilters,
  CashHistoryEntry,
  CashProductOption,
  CashRanking,
  CashRegister,
  CashServiceOption,
  CashSummary,
  Period,
  PrivateCashRow
} from './types'

type UseCashPageDataArgs = {
  filters: CashFilters
  period: Period
}

export const useCashPageData = ({ filters, period }: UseCashPageDataArgs) => {
  const [activeCashRegister, setActiveCashRegister] = useState<CashRegister | null>(null)
  const [summary, setSummary] = useState<CashSummary | null>(null)
  const [analyticsRows, setAnalyticsRows] = useState<CashAnalyticsRow[]>([])
  const [ranking, setRanking] = useState<CashRanking | null>(null)
  const [initialDataLoaded, setInitialDataLoaded] = useState(false)
  const [clients, setClients] = useState<CashClientOption[]>([])
  const [services, setServices] = useState<CashServiceOption[]>([])
  const [products, setProducts] = useState<CashProductOption[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [privateCashRows, setPrivateCashRows] = useState<PrivateCashRow[]>([])
  const [privateCashTotal, setPrivateCashTotal] = useState(0)
  const [privateCashLoading, setPrivateCashLoading] = useState(false)
  const [cashHistory, setCashHistory] = useState<CashHistoryEntry[]>([])

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
      setClients(nextOptions.clients)
      setServices(nextOptions.services)
      setProducts(nextOptions.products)
    } catch {
      toast.error('No se pudieron cargar los filtros de caja')
    }
  }

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true)
      const nextAnalytics = await fetchCashAnalytics(period, filters)
      setAnalyticsRows(nextAnalytics.rows)
    } catch {
      toast.error('No se pudo cargar la analítica de caja')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const loadRanking = async () => {
    try {
      const nextRanking = await fetchCashRanking(period, filters)
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
    void Promise.all([loadAnalytics(), loadRanking()])
  }, [filters, initialDataLoaded, period])

  return {
    activeCashRegister,
    analyticsLoading,
    analyticsRows,
    cashHistory,
    clearPrivateCashData,
    clients,
    loadCashHistory,
    loadAnalytics,
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
