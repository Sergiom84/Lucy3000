import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchGlobalAccountBalanceHistory,
  fetchPendingCollectionSaleDetail,
  fetchSaleDetail,
  fetchSalesCatalog,
  fetchSalesClients,
  fetchSalesHistory
} from './salesApi'
import type {
  AccountBalanceHistoryRow,
  AppointmentLegendCatalogItem,
  BonoTemplate,
  Client,
  Product,
  Sale,
  Service
} from './types'

export const useSalesPageData = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [bonoTemplates, setBonoTemplates] = useState<BonoTemplate[]>([])
  const [legendItems, setLegendItems] = useState<AppointmentLegendCatalogItem[]>([])
  const [professionals, setProfessionals] = useState<string[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [sales, setSales] = useState<Sale[]>([])
  const [accountBalanceHistory, setAccountBalanceHistory] = useState<AccountBalanceHistoryRow[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [pendingCollectionSale, setPendingCollectionSale] = useState<Sale | null>(null)
  const [pendingCollectionLoading, setPendingCollectionLoading] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadCatalog = async () => {
    try {
      const catalogState = await fetchSalesCatalog()
      setProducts(catalogState.products)
      setServices(catalogState.services)
      setBonoTemplates(catalogState.bonoTemplates)
      setProfessionals(catalogState.professionals)
      setLegendItems(catalogState.legendItems)
    } catch (error) {
      console.error('Error loading catalog:', error)
      toast.error('Error al cargar el catálogo')
    }
  }

  const loadClients = async () => {
    try {
      setClientsLoading(true)
      const nextClients = await fetchSalesClients()
      setClients(nextClients)
    } catch (error) {
      console.error('Error loading clients:', error)
      toast.error('Error al cargar clientes')
    } finally {
      setClientsLoading(false)
    }
  }

  const loadSales = async (dateFilter: { startDate: string; endDate: string }) => {
    try {
      setLoading(true)
      const history = await fetchSalesHistory(dateFilter)
      setSales(history)
    } catch (error) {
      console.error('Error loading sales:', error)
      toast.error('Error al cargar ventas')
    } finally {
      setLoading(false)
    }
  }

  const viewSaleDetail = async (saleId: string) => {
    try {
      const sale = await fetchSaleDetail(saleId)
      setSelectedSale(sale)
      setSaleDetailOpen(true)
    } catch (error) {
      console.error('Error loading sale detail:', error)
      toast.error('Error al cargar detalle de venta')
    }
  }

  const loadAccountBalanceHistory = async () => {
    try {
      setLoading(true)
      const movements = await fetchGlobalAccountBalanceHistory()
      setAccountBalanceHistory(movements)
    } catch (error) {
      console.error('Error loading account balance history:', error)
      toast.error('Error al cargar el historial de abonos')
      setAccountBalanceHistory([])
    } finally {
      setLoading(false)
    }
  }

  const loadPendingCollectionSale = async (saleId: string) => {
    try {
      setPendingCollectionLoading(true)
      const sale = await fetchPendingCollectionSaleDetail(saleId)
      setPendingCollectionSale(sale)
      return sale
    } catch (error) {
      console.error('Error loading pending collection sale:', error)
      toast.error('No se pudo cargar la venta pendiente')
      return null
    } finally {
      setPendingCollectionLoading(false)
    }
  }

  return {
    accountBalanceHistory,
    bonoTemplates,
    clients,
    clientsLoading,
    legendItems,
    loadAccountBalanceHistory,
    loadCatalog,
    loadClients,
    loadPendingCollectionSale,
    loadSales,
    loading,
    pendingCollectionLoading,
    pendingCollectionSale,
    products,
    professionals,
    saleDetailOpen,
    sales,
    selectedSale,
    services,
    setPendingCollectionSale,
    setSaleDetailOpen,
    viewSaleDetail
  }
}
