import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Clock,
  CreditCard,
  FileText,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import api from '../utils/api'
import {
  loadActiveProducts,
  loadAppointmentClients,
  loadAppointmentLegendItems,
  loadAppointmentProfessionals,
  loadAppointmentServices,
  loadBonoTemplates,
  preloadPointOfSaleCatalogs,
  type AppointmentLegendCatalogItem
} from '../utils/appointmentCatalogs'
import { printTicket } from '../utils/desktop'
import { getPrintTicketSuccessMessage } from '../utils/desktop'
import { formatCurrency } from '../utils/format'
import { resolveAppointmentLegend } from '../utils/appointmentColors'
import { buildSearchTokens, filterRankedItems } from '../utils/searchableOptions'
import {
  buildSaleTicketPayload,
  buildQuoteHtml,
  getSaleAccountBalanceMovement,
  salePaymentMethodLabel
} from '../utils/tickets'
import { getSaleDisplayName } from '../../shared/customerDisplay'

interface CartItem {
  id: string
  type: 'product' | 'service' | 'bono'
  name: string
  detail?: string
  category?: string
  price: number
  quantity: number
  stock?: number
  productId?: string
  serviceId?: string
  bonoTemplateId?: string
}

interface Client {
  id: string
  firstName: string
  lastName: string
  phone: string
  email?: string
  loyaltyPoints: number
  accountBalance?: number | null
}

interface Product {
  id: string
  name: string
  price: number
  stock: number
  category: string
  sku?: string | null
  brand?: string | null
  description?: string | null
}

interface Service {
  id: string
  name: string
  price: number
  duration: number
  category: string
  serviceCode?: string | null
  description?: string | null
}

interface BonoTemplate {
  id: string
  category: string
  description: string
  serviceId: string
  serviceName: string
  serviceLookup: string
  totalSessions: number
  price: number
  isActive: boolean
  createdAt: string
}

interface Sale {
  id: string
  saleNumber: string
  date: string
  client?: Client
  appointment?: {
    guestName?: string | null
  } | null
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  paymentBreakdown?: string | null
  status: string
  items: any[]
  pendingPayment?: {
    id: string
    amount: number | string
    status: string
    createdAt: string
    settledAt?: string | null
    settledPaymentMethod?: string | null
    collections?: Array<{
      id: string
      amount: number | string
      paymentMethod: string
      showInOfficialCash?: boolean
      operationDate: string
      createdAt: string
    }>
  } | null
  accountBalanceMovements?: Array<{
    id: string
    type: string
    amount: number | string
    balanceAfter: number | string
    operationDate: string
    referenceItem?: string | null
    notes?: string | null
  }>
}

interface AccountBalanceHistoryRow {
  id: string
  type: 'TOP_UP' | 'CONSUMPTION' | 'ADJUSTMENT'
  operationDate: string
  description: string
  referenceItem?: string | null
  amount: number
  balanceAfter: number
  notes?: string | null
  client: {
    id: string
    firstName: string
    lastName: string
  }
  sale?: {
    id: string
    saleNumber: string
    paymentMethod: string
    paymentBreakdown?: string | null
    status?: string
    pendingPayment?: {
      collections?: Array<{
        amount: number | string
        paymentMethod: string
        showInOfficialCash?: boolean
        operationDate?: string
        createdAt?: string
      }>
    } | null
  } | null
}

type CatalogItem =
  | (Product & { type: 'product' })
  | (Service & { type: 'service' })
  | (BonoTemplate & { type: 'bono'; name: string })
type CatalogType = 'all' | 'products' | 'services' | 'bonos'
type SalesView = 'pos' | 'history' | 'account-balance'
type SalePaymentMethod = 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
type CombinedSecondaryPaymentMethod = SalePaymentMethod | 'PENDING'
type SaleMode = 'NORMAL' | 'PENDING' | 'ON_HOLD' | 'QUOTE'
type ResolvedCombinedPayment = {
  primaryMethod: SalePaymentMethod
  primaryAmount: number
  secondaryMethod: CombinedSecondaryPaymentMethod
  secondaryAmount: number
  cashShowInOfficialCash?: boolean
}
type PendingSaleExecutionOptions = {
  paymentMethodOverride?: SalePaymentMethod
  accountBalanceUsageAmount?: number
  combinedPayment?: ResolvedCombinedPayment
}
type CombinedPaymentDraft = {
  primaryMethod: SalePaymentMethod
  primaryAmount: string
  secondaryMethod: CombinedSecondaryPaymentMethod
}

const formatFamilyLabel = (value: string): string =>
  value
    .toLowerCase()
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

const catalogTypeLabels: Record<Exclude<CatalogType, 'all'>, string> = {
  services: 'servicios',
  products: 'productos',
  bonos: 'bonos'
}

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export default function Sales() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const resolvedView = (() => {
    const queryView = searchParams.get('view')
    if (queryView === 'history') return 'history'
    if (queryView === 'account-balance') return 'account-balance'
    return 'pos'
  })()
  const [view, setView] = useState<SalesView>(resolvedView)

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH')
  const [paymentMode, setPaymentMode] = useState<'SINGLE' | 'COMBINED'>('SINGLE')
  const [professional, setProfessional] = useState('')
  const [professionals, setProfessionals] = useState<string[]>([])
  const [saleMode, setSaleMode] = useState<SaleMode>('NORMAL')
  const [notes, setNotes] = useState('')
  const [lastCompletedQuote, setLastCompletedQuote] = useState<any>(null)
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(searchParams.get('appointmentId'))
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [bonoTemplates, setBonoTemplates] = useState<BonoTemplate[]>([])
  const [legendItems, setLegendItems] = useState<AppointmentLegendCatalogItem[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogType, setCatalogType] = useState<CatalogType>('services')
  const [selectedServiceFamily, setSelectedServiceFamily] = useState<string | null>(null)
  const [selectedProductFamily, setSelectedProductFamily] = useState<string | null>(null)
  const [selectedBonoFamily, setSelectedBonoFamily] = useState<string | null>(null)
  const [servicesExpanded, setServicesExpanded] = useState(false)
  const [productsExpanded, setProductsExpanded] = useState(false)
  const [bonosExpanded, setBonosExpanded] = useState(false)

  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [clientsLoading, setClientsLoading] = useState(false)

  const [sales, setSales] = useState<Sale[]>([])
  const [accountBalanceHistory, setAccountBalanceHistory] = useState<AccountBalanceHistoryRow[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' })
  const [accountBalanceConfirmModalOpen, setAccountBalanceConfirmModalOpen] = useState(false)
  const [cashTicketDecisionModalOpen, setCashTicketDecisionModalOpen] = useState(false)
  const [combinedPaymentModalOpen, setCombinedPaymentModalOpen] = useState(false)
  const [accountBalanceRemainderModalOpen, setAccountBalanceRemainderModalOpen] = useState(false)
  const [pendingSaleExecution, setPendingSaleExecution] = useState<PendingSaleExecutionOptions | null>(null)
  const [pendingAccountBalanceUsage, setPendingAccountBalanceUsage] = useState(0)
  const [pendingRemainderAmount, setPendingRemainderAmount] = useState(0)
  const [combinedPaymentDraft, setCombinedPaymentDraft] = useState<CombinedPaymentDraft>({
    primaryMethod: 'CASH',
    primaryAmount: '',
    secondaryMethod: 'CARD'
  })

  const [loading, setLoading] = useState(false)
  const prefillApplied = useRef({ client: false, service: false, sale: false })

  const prefilledClientId = searchParams.get('clientId')
  const prefilledServiceId = searchParams.get('serviceId')
  const prefilledSaleId = searchParams.get('openSaleId')

  useEffect(() => {
    if (view === 'pos') {
      void loadCatalog()
      void preloadPointOfSaleCatalogs()
      if (prefilledClientId) {
        void loadClients()
      }
      return
    }

    if (view === 'history') {
      void loadSales()
      return
    }

    void loadAccountBalanceHistory()
  }, [view])

  useEffect(() => {
    if (!prefilledClientId || prefillApplied.current.client || clients.length === 0) return
    const client = clients.find((item) => item.id === prefilledClientId)
    if (!client) return
    setSelectedClient(client)
    prefillApplied.current.client = true
  }, [clients, prefilledClientId])

  useEffect(() => {
    if (!prefilledServiceId || prefillApplied.current.service || services.length === 0) return
    const service = services.find((item) => item.id === prefilledServiceId)
    if (!service) return
    addToCart(service, 'service')
    prefillApplied.current.service = true
  }, [services, prefilledServiceId])

  useEffect(() => {
    if (view !== 'history' || !prefilledSaleId || prefillApplied.current.sale) return
    void viewSaleDetail(prefilledSaleId)
    prefillApplied.current.sale = true
  }, [view, prefilledSaleId])

  useEffect(() => {
    if (professional || professionals.length === 0) {
      return
    }

    setProfessional(professionals[0])
  }, [professional, professionals])

  const loadCatalog = async () => {
    try {
      const [productsResult, servicesResult, bonosResult, professionalsResult, legendItemsResult] = await Promise.allSettled([
        loadActiveProducts(),
        loadAppointmentServices(),
        loadBonoTemplates(),
        loadAppointmentProfessionals(),
        loadAppointmentLegendItems()
      ])

      if (productsResult.status === 'fulfilled') {
        setProducts(productsResult.value as Product[])
      } else {
        console.error('Error loading products:', productsResult.reason)
      }

      if (servicesResult.status === 'fulfilled') {
        setServices(servicesResult.value as Service[])
      } else {
        console.error('Error loading services:', servicesResult.reason)
      }

      if (bonosResult.status === 'fulfilled') {
        setBonoTemplates(bonosResult.value as BonoTemplate[])
      } else {
        console.error('Error loading bono templates:', bonosResult.reason)
        setBonoTemplates([])
      }

      if (professionalsResult.status === 'fulfilled') {
        setProfessionals(professionalsResult.value)
      } else {
        console.error('Error loading professionals:', professionalsResult.reason)
        setProfessionals([])
      }

      if (legendItemsResult.status === 'fulfilled') {
        setLegendItems(legendItemsResult.value)
      } else {
        console.error('Error loading appointment legends:', legendItemsResult.reason)
        setLegendItems([])
      }
    } catch (error) {
      console.error('Error loading catalog:', error)
      toast.error('Error al cargar el catálogo')
    }
  }

  const loadClients = async () => {
    try {
      setClientsLoading(true)
      const nextClients = await loadAppointmentClients()
      setClients(nextClients as Client[])
    } catch (error) {
      console.error('Error loading clients:', error)
      toast.error('Error al cargar clientes')
    } finally {
      setClientsLoading(false)
    }
  }

  const loadSales = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (dateFilter.startDate) params.append('startDate', dateFilter.startDate)
      if (dateFilter.endDate) params.append('endDate', dateFilter.endDate)
      const response = await api.get(`/sales?${params.toString()}`)
      setSales(response.data)
    } catch (error) {
      console.error('Error loading sales:', error)
      toast.error('Error al cargar ventas')
    } finally {
      setLoading(false)
    }
  }

  const addToCart = (item: Product | Service | BonoTemplate, type: 'product' | 'service' | 'bono') => {
    const existing = cart.find(
      (cartItem) =>
        cartItem.type === type &&
        (type === 'product'
          ? cartItem.productId === item.id
          : type === 'service'
            ? cartItem.serviceId === item.id
            : cartItem.bonoTemplateId === item.id)
    )

    if (existing) {
      if (type === 'product' && existing.quantity >= (item as Product).stock) {
        toast.error('Stock insuficiente')
        return
      }

      setCart((current) =>
        current.map((cartItem) =>
          cartItem.id === existing.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        )
      )
      return
    }

    setCart((current) => [
      ...current,
      {
        id: `${type}-${item.id}-${Date.now()}`,
        type,
        name: type === 'bono' ? (item as BonoTemplate).description : (item as Product | Service).name,
        price: Number(item.price),
        quantity: 1,
        ...(type === 'product'
          ? { stock: (item as Product).stock, productId: item.id }
          : type === 'service'
            ? { serviceId: item.id }
            : { serviceId: (item as BonoTemplate).serviceId, bonoTemplateId: item.id })
      }
    ])
  }

  const updateCartItemQuantity = (id: string, delta: number) => {
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== id) return item
          const nextQuantity = item.quantity + delta
          if (nextQuantity <= 0) return null
          if (item.type === 'product' && item.stock !== undefined && nextQuantity > item.stock) {
            toast.error('Stock insuficiente')
            return item
          }
          return { ...item, quantity: nextQuantity }
        })
        .filter(Boolean) as CartItem[]
    )
  }

  const removeFromCart = (id: string) => {
    setCart((current) => current.filter((item) => item.id !== id))
  }

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const discountAmount = (subtotal * discount) / 100
    return {
      subtotal,
      discountAmount,
      total: subtotal - discountAmount
    }
  }

  const parseCombinedPrimaryAmount = () => {
    const parsed = Number.parseFloat(combinedPaymentDraft.primaryAmount.replace(',', '.'))
    return Number.isFinite(parsed) ? roundCurrency(parsed) : 0
  }

  const getCombinedSecondaryAmount = () => {
    const { total } = calculateTotals()
    return roundCurrency(Math.max(0, total - parseCombinedPrimaryAmount()))
  }

  const resetCombinedPaymentDraft = () => {
    setCombinedPaymentDraft({
      primaryMethod: 'CASH',
      primaryAmount: '',
      secondaryMethod: 'CARD'
    })
  }

  const resolveCombinedPayment = () => {
    const { total } = calculateTotals()
    const primaryAmount = parseCombinedPrimaryAmount()
    const secondaryAmount = roundCurrency(total - primaryAmount)

    if (total <= 0) {
      toast.error('El importe de la venta debe ser mayor que cero')
      return null
    }

    if (primaryAmount <= 0 || primaryAmount >= total) {
      toast.error('La primera cuantía debe ser mayor que cero y menor que el total')
      return null
    }

    if (secondaryAmount <= 0) {
      toast.error('La segunda cuantía debe ser mayor que cero')
      return null
    }

    if (
      combinedPaymentDraft.secondaryMethod !== 'PENDING' &&
      combinedPaymentDraft.primaryMethod === combinedPaymentDraft.secondaryMethod
    ) {
      toast.error('Selecciona dos formas distintas para el pago combinado')
      return null
    }

    const accountBalanceAmount =
      (combinedPaymentDraft.primaryMethod === 'ABONO' ? primaryAmount : 0) +
      (combinedPaymentDraft.secondaryMethod === 'ABONO' ? secondaryAmount : 0)

    if (accountBalanceAmount > 0 && !selectedClient?.id) {
      toast.error('Selecciona un cliente para usar abono')
      return null
    }

    if (accountBalanceAmount > availableAccountBalance) {
      toast.error('El cliente no tiene saldo suficiente en su abono')
      return null
    }

    return {
      primaryMethod: combinedPaymentDraft.primaryMethod,
      primaryAmount,
      secondaryMethod: combinedPaymentDraft.secondaryMethod as CombinedSecondaryPaymentMethod,
      secondaryAmount
    }
  }

  const completeSaleRequest = async (options: {
    printTicketAfterSale: boolean
    showInOfficialCash: boolean
    paymentMethodOverride?: SalePaymentMethod
    accountBalanceUsageAmount?: number
    combinedPayment?: ResolvedCombinedPayment
  }) => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }

    let accountBalanceUsagePayload: {
      operationDate: string
      referenceItem: string
      amount: number
      notes?: string | null
    } | undefined

    const combinedPayment = options.combinedPayment
    const effectivePaymentMethod =
      combinedPayment
        ? combinedPayment.primaryMethod
        : saleMode === 'PENDING'
          ? 'CASH'
          : options.paymentMethodOverride || paymentMethod

    const shouldUseAccountBalance =
      !combinedPayment && (options.accountBalanceUsageAmount !== undefined || effectivePaymentMethod === 'ABONO')

    if (shouldUseAccountBalance) {
      if (!selectedClient?.id) {
        toast.error('Selecciona un cliente para usar abono')
        return
      }

      const automaticAmount = roundCurrency(options.accountBalanceUsageAmount ?? accountBalanceSaleAmount)
      if (automaticAmount <= 0) {
        toast.error('El importe de la venta debe ser mayor a 0 para usar abono')
        return
      }

      if (automaticAmount > availableAccountBalance) {
        toast.error('El cliente no tiene saldo suficiente en su abono')
        return
      }

      accountBalanceUsagePayload = {
        operationDate: new Date().toISOString(),
        referenceItem: accountBalanceReference.slice(0, 250) || 'Venta en caja',
        amount: automaticAmount,
        notes: null
      }
    }

    try {
      setLoading(true)
      const { subtotal, discountAmount } = calculateTotals()
      const saleStatus = combinedPayment
        ? combinedPayment.secondaryMethod === 'PENDING'
          ? 'PENDING'
          : 'COMPLETED'
        : saleMode === 'PENDING'
          ? 'PENDING'
          : 'COMPLETED'
      const response = await api.post('/sales', {
        clientId: selectedClient?.id || null,
        appointmentId: linkedAppointmentId,
        items: cart.map((item) => ({
          productId: item.productId || null,
          serviceId: item.serviceId || null,
          bonoTemplateId: item.bonoTemplateId || null,
          description: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        subtotal,
        discount: discountAmount,
        tax: 0,
        paymentMethod: effectivePaymentMethod,
        professional,
        status: saleStatus,
        accountBalanceUsage: accountBalanceUsagePayload,
          combinedPayment: combinedPayment
            ? {
                primaryMethod: combinedPayment.primaryMethod,
                primaryAmount: combinedPayment.primaryAmount,
                secondaryMethod: combinedPayment.secondaryMethod,
                cashShowInOfficialCash: combinedPayment.cashShowInOfficialCash
              }
            : undefined,
        showInOfficialCash: options.showInOfficialCash,
        notes: saleMode === 'ON_HOLD' ? `[EN ESPERA] ${notes}`.trim() : notes
      })

      const createdSale = response.data
      if (options.printTicketAfterSale) {
        try {
          const printResult = await printTicket(buildSaleTicketPayload(createdSale))
          toast.success(getPrintTicketSuccessMessage(printResult))
        } catch (error: any) {
          toast.error(error.message || 'La venta se guardó, pero no se pudo imprimir el ticket')
        }
      }

      setLastCompletedSale(createdSale)
      setCart([])
      setDiscount(0)
      setNotes('')
      setPaymentMethod('CASH')
      setPaymentMode('SINGLE')
      resetCombinedPaymentDraft()
      setProfessional(professionals[0] || '')
      setSaleMode('NORMAL')
      setLastCompletedQuote(null)
      setLinkedAppointmentId(null)
      setPendingSaleExecution(null)
      setPendingAccountBalanceUsage(0)
      setPendingRemainderAmount(0)
      setAccountBalanceRemainderModalOpen(false)
      if (accountBalanceUsagePayload && selectedClient?.id) {
        const usedAmount = accountBalanceUsagePayload.amount
        setSelectedClient((current) =>
          current && current.id === selectedClient.id
            ? {
                ...current,
                accountBalance: roundCurrency(Math.max(0, Number(current.accountBalance || 0) - usedAmount))
              }
            : current
        )
      }
      if (!prefilledClientId) setSelectedClient(null)
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('appointmentId')
        next.delete('serviceId')
        return next
      })
      toast.success(
        saleStatus === 'PENDING'
          ? `Venta pendiente guardada: ${createdSale.saleNumber}`
          : `Venta completada: ${createdSale.saleNumber}`
      )
      await loadCatalog()
    } catch (error: any) {
      console.error('Error completing sale:', error)
      toast.error(error.response?.data?.error || 'Error al completar la venta')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }

    if (hasBonoItems && !selectedClient?.id) {
      toast.error('Selecciona un cliente para vender bonos')
      return
    }

    if (saleMode === 'QUOTE') {
      await handleCompleteQuote()
      return
    }

    if (saleMode === 'PENDING') {
      await completeSaleRequest({
        printTicketAfterSale: false,
        showInOfficialCash: false
      })
      return
    }

    if (paymentMode === 'COMBINED') {
      const combinedPayment = resolveCombinedPayment()
      if (!combinedPayment) {
        setCombinedPaymentModalOpen(true)
        return
      }

      const hasCashInCombinedPayment =
        combinedPayment.primaryMethod === 'CASH' || combinedPayment.secondaryMethod === 'CASH'

      if (hasCashInCombinedPayment) {
        setPendingSaleExecution({ combinedPayment })
        setCashTicketDecisionModalOpen(true)
        return
      }

      await completeSaleRequest({
        printTicketAfterSale:
          combinedPayment.secondaryMethod !== 'PENDING' &&
          [combinedPayment.primaryMethod, combinedPayment.secondaryMethod].includes('CARD'),
        showInOfficialCash: true,
        combinedPayment
      })
      return
    }

    if (paymentMethod === 'ABONO') {
      if (!selectedClient?.id) {
        toast.error('Selecciona un cliente para usar abono')
        return
      }

      if (accountBalanceSaleAmount <= 0) {
        toast.error('El importe de la venta debe ser mayor a 0 para usar abono')
        return
      }

      if (accountBalanceUsableAmount <= 0) {
        toast.error('El cliente no tiene saldo disponible en su abono')
        return
      }

      setAccountBalanceConfirmModalOpen(true)
      return
    }

    if (paymentMethod === 'CASH') {
      setPendingSaleExecution(null)
      setCashTicketDecisionModalOpen(true)
      return
    }

    await completeSaleRequest({
      printTicketAfterSale: paymentMethod === 'CARD',
      showInOfficialCash: true
    })
  }

  const handleRemainderPaymentSelection = async (method: 'CASH' | 'CARD' | 'BIZUM') => {
    setAccountBalanceRemainderModalOpen(false)

    if (method === 'CASH') {
      setPendingSaleExecution({
        paymentMethodOverride: method,
        accountBalanceUsageAmount: pendingAccountBalanceUsage
      })
      setCashTicketDecisionModalOpen(true)
      return
    }

    await completeSaleRequest({
      printTicketAfterSale: method === 'CARD',
      showInOfficialCash: true,
      paymentMethodOverride: method,
      accountBalanceUsageAmount: pendingAccountBalanceUsage
    })
  }

  const viewSaleDetail = async (saleId: string) => {
    try {
      const response = await api.get(`/sales/${saleId}`)
      setSelectedSale(response.data)
      setSaleDetailOpen(true)
    } catch (error) {
      console.error('Error loading sale detail:', error)
      toast.error('Error al cargar detalle de venta')
    }
  }

  const handleCompleteQuote = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }

    if (!selectedClient?.id) {
      toast.error('Selecciona un cliente para generar un presupuesto')
      return
    }

    try {
      setLoading(true)
      const { discountAmount } = calculateTotals()
      const response = await api.post('/quotes', {
        clientId: selectedClient.id,
        professional,
        items: cart.map((item) => ({
          productId: item.productId || null,
          serviceId: item.serviceId || null,
          bonoTemplateId: item.bonoTemplateId || null,
          description: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        discount: discountAmount,
        notes
      })

      const createdQuote = response.data
      setLastCompletedQuote(createdQuote)

      const quoteHtml = buildQuoteHtml(createdQuote)
      const printWindow = window.open('', '_blank', 'width=800,height=600')
      if (printWindow) {
        printWindow.document.write(quoteHtml)
        printWindow.document.close()
        printWindow.focus()
        printWindow.print()
      }

      setCart([])
      setDiscount(0)
      setNotes('')
      setSaleMode('NORMAL')
      setProfessional(professionals[0] || '')
      if (!prefilledClientId) setSelectedClient(null)
      toast.success(`Presupuesto ${createdQuote.quoteNumber} generado`)
    } catch (error: any) {
      console.error('Error creating quote:', error)
      toast.error(error.response?.data?.error || 'Error al generar el presupuesto')
    } finally {
      setLoading(false)
    }
  }

  const handlePrintQuote = async (quote: any) => {
    const quoteHtml = buildQuoteHtml(quote)
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (printWindow) {
      printWindow.document.write(quoteHtml)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    }
  }

  const handlePrintSale = async (sale: any) => {
    try {
      const printResult = await printTicket(buildSaleTicketPayload(sale))
      toast.success(getPrintTicketSuccessMessage(printResult))
    } catch (error: any) {
      toast.error(error.message || 'No se pudo imprimir el ticket')
    }
  }

  const serviceFamilyCards = useMemo(
    () =>
      Object.entries(
        services.reduce<Record<string, number>>((acc, service) => {
          const family = String(service.category || '').trim() || 'Sin categoría'
          acc[family] = (acc[family] || 0) + 1
          return acc
        }, {})
      )
        .map(([family, total]) => ({ family, label: formatFamilyLabel(family), total }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    [services]
  )

  const productFamilyCards = useMemo(
    () =>
      Object.entries(
        products.reduce<Record<string, number>>((acc, product) => {
          const family = String(product.category || '').trim() || 'Sin categoría'
          acc[family] = (acc[family] || 0) + 1
          return acc
        }, {})
      )
        .map(([family, total]) => ({ family, label: formatFamilyLabel(family), total }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    [products]
  )

  const bonoFamilyCards = useMemo(
    () =>
      Object.entries(
        bonoTemplates.reduce<Record<string, number>>((acc, template) => {
          const family = String(template.category || '').trim() || 'Sin categoría'
          acc[family] = (acc[family] || 0) + 1
          return acc
        }, {})
      )
        .map(([family, total]) => ({ family, label: formatFamilyLabel(family), total }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    [bonoTemplates]
  )

  const filteredCatalog = useMemo(() => {
    let items: CatalogItem[] = []

    if (catalogType === 'all' || catalogType === 'products') {
      items = [...items, ...products.map((product) => ({ ...product, type: 'product' as const }))]
    }
    if (catalogType === 'all' || catalogType === 'services') {
      items = [...items, ...services.map((service) => ({ ...service, type: 'service' as const }))]
    }

    if (catalogType === 'all' || catalogType === 'bonos') {
      items = [
        ...items,
        ...bonoTemplates.map((template) => ({
          ...template,
          type: 'bono' as const,
          name: template.description
        }))
      ]
    }

    if (catalogType === 'products' && selectedProductFamily) {
      items = items.filter((item) => item.type === 'product' && item.category === selectedProductFamily)
    }

    if (catalogType === 'services' && selectedServiceFamily) {
      items = items.filter((item) => item.type === 'service' && item.category === selectedServiceFamily)
    }

    if (catalogType === 'bonos' && selectedBonoFamily) {
      items = items.filter((item) => item.type === 'bono' && item.category === selectedBonoFamily)
    }

    if (catalogSearch.trim()) {
      items = filterRankedItems(items, catalogSearch, (item) => ({
        label: item.name,
        labelTokens: buildSearchTokens(item.name),
        searchText:
          item.type === 'product'
            ? [
                item.name,
                item.category,
                item.sku,
                item.brand,
                item.description
              ]
                .filter(Boolean)
                .join(' ')
            : item.type === 'service'
              ? [
                  item.name,
                  item.category,
                  item.serviceCode,
                  item.description,
                  item.duration
                ]
                  .filter(Boolean)
                  .join(' ')
              : [
                  item.description,
                  item.category,
                  item.serviceName,
                  item.serviceLookup,
                  item.totalSessions
                ]
                  .filter(Boolean)
                  .join(' ')
      }))
    }

    return items.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }, [
    catalogSearch,
    catalogType,
    bonoTemplates,
    products,
    selectedProductFamily,
    selectedServiceFamily,
    selectedBonoFamily,
    services
  ])

  const activeFamilyCards =
    catalogType === 'services' ? serviceFamilyCards : catalogType === 'products' ? productFamilyCards : bonoFamilyCards
  const activeFamily =
    catalogType === 'services'
      ? selectedServiceFamily
      : catalogType === 'products'
        ? selectedProductFamily
        : selectedBonoFamily
  const catalogItemsExpanded =
    catalogType === 'all'
      ? true
      : catalogType === 'services'
        ? servicesExpanded
        : catalogType === 'products'
          ? productsExpanded
          : bonosExpanded

  const filteredClients = useMemo(
    () =>
      filterRankedItems(clients, clientSearch, (client) => {
        const fullName = `${client.firstName} ${client.lastName}`.trim()

        return {
          label: fullName,
          labelTokens: buildSearchTokens(fullName),
          searchText: [fullName, client.phone, client.email].filter(Boolean).join(' ')
        }
      }),
    [clientSearch, clients]
  )

  const filteredSales = useMemo(
    () =>
      filterRankedItems(sales, historySearch, (sale) => {
        const displayName = getSaleDisplayName(sale)

        return {
          label: displayName,
          labelTokens: buildSearchTokens(displayName),
          searchText: [sale.saleNumber, displayName, salePaymentMethodLabel(sale), sale.status]
            .filter(Boolean)
            .join(' ')
        }
      }),
    [historySearch, sales]
  )

  const filteredAccountBalanceHistory = useMemo(() => {
    const startTimestamp = dateFilter.startDate ? new Date(`${dateFilter.startDate}T00:00:00`).getTime() : null
    const endTimestamp = dateFilter.endDate ? new Date(`${dateFilter.endDate}T23:59:59`).getTime() : null

    const dateFiltered = accountBalanceHistory.filter((movement) => {
      const movementTimestamp = new Date(movement.operationDate).getTime()
      if (startTimestamp !== null && movementTimestamp < startTimestamp) return false
      if (endTimestamp !== null && movementTimestamp > endTimestamp) return false

      return true
    })

    return filterRankedItems(dateFiltered, historySearch, (movement) => {
      const clientName = `${movement.client?.firstName || ''} ${movement.client?.lastName || ''}`.trim()

      return {
        label: clientName || movement.description,
        labelTokens: buildSearchTokens(clientName || movement.description),
        searchText: [
          clientName,
          movement.description,
          movement.referenceItem,
          movement.sale?.saleNumber,
          salePaymentMethodLabel(movement.sale ? { ...movement.sale, accountBalanceMovements: [movement] } : null)
        ]
          .filter(Boolean)
          .join(' ')
      }
    })
  }, [accountBalanceHistory, dateFilter.endDate, dateFilter.startDate, historySearch])

  const handleCatalogTypeChange = (nextType: typeof catalogType) => {
    setCatalogType(nextType)
  }

  const handleToggleFamily = (family: string) => {
    if (catalogType === 'services') {
      setSelectedServiceFamily((current) => {
        const next = current === family ? null : family
        if (next) setServicesExpanded(true)
        return next
      })
      return
    }

    if (catalogType === 'products') {
      setSelectedProductFamily((current) => {
        const next = current === family ? null : family
        if (next) setProductsExpanded(true)
        return next
      })
      return
    }

    if (catalogType === 'bonos') {
      setSelectedBonoFamily((current) => {
        const next = current === family ? null : family
        if (next) setBonosExpanded(true)
        return next
      })
    }
  }

  const handleConfirmAccountBalanceSale = async () => {
    setAccountBalanceConfirmModalOpen(false)

    if (accountBalanceRemainderToPay > 0) {
      setPendingAccountBalanceUsage(accountBalanceUsableAmount)
      setPendingRemainderAmount(accountBalanceRemainderToPay)
      setAccountBalanceRemainderModalOpen(true)
      return
    }

    await completeSaleRequest({
      printTicketAfterSale: false,
      showInOfficialCash: false,
      paymentMethodOverride: 'ABONO',
      accountBalanceUsageAmount: accountBalanceUsableAmount
    })
  }

  const loadAccountBalanceHistory = async () => {
    try {
      setLoading(true)
      const response = await api.get('/bonos/account-balance/history')
      const movements = Array.isArray(response.data?.movements) ? response.data.movements : []
      setAccountBalanceHistory(movements)
    } catch (error) {
      console.error('Error loading account balance history:', error)
      toast.error('Error al cargar el historial de abonos')
      setAccountBalanceHistory([])
    } finally {
      setLoading(false)
    }
  }

  const toggleCatalogItems = () => {
    if (catalogType === 'services') {
      setServicesExpanded((current) => !current)
      return
    }

    if (catalogType === 'products') {
      setProductsExpanded((current) => !current)
      return
    }

    if (catalogType === 'bonos') {
      setBonosExpanded((current) => !current)
    }
  }

  const availableAccountBalance = Number(selectedClient?.accountBalance || 0)
  const hasBonoItems = cart.some((item) => item.type === 'bono')
  const { subtotal, discountAmount, total } = calculateTotals()
  const accountBalanceSaleAmount = Math.round((total + Number.EPSILON) * 100) / 100
  const accountBalanceReference = useMemo(
    () =>
      cart
        .map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
        .join(', ')
        .trim(),
    [cart]
  )
  const accountBalanceUsableAmount = roundCurrency(Math.min(availableAccountBalance, accountBalanceSaleAmount))
  const accountBalanceRemainingAfterSale = roundCurrency(Math.max(0, availableAccountBalance - accountBalanceUsableAmount))
  const accountBalanceRemainderToPay = roundCurrency(Math.max(0, accountBalanceSaleAmount - accountBalanceUsableAmount))
  const selectedSaleAccountBalanceMovement = getSaleAccountBalanceMovement(selectedSale)
  const cashDecisionIsCombinedPayment = Boolean(pendingSaleExecution?.combinedPayment)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ventas</h1>
        </div>

        <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => {
              setView('pos')
              navigate('/sales', { replace: true })
            }}
            className={`px-4 py-2 rounded-md transition-colors ${
              view === 'pos'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <ShoppingCart className="w-5 h-5 inline-block mr-2" />
            Punto de Venta
          </button>
          <button
            onClick={() => {
              setView('history')
              navigate('/sales?view=history', { replace: true })
            }}
            className={`px-4 py-2 rounded-md transition-colors ${
              view === 'history'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <Clock className="w-5 h-5 inline-block mr-2" />
            Historial
          </button>
          <button
            onClick={() => {
              setView('account-balance')
              navigate('/sales?view=account-balance', { replace: true })
            }}
            className={`px-4 py-2 rounded-md transition-colors ${
              view === 'account-balance'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <CreditCard className="w-5 h-5 inline-block mr-2" />
            Historial Abono
          </button>
        </div>
      </div>

      {view === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {linkedAppointmentId && (
              <div className="card border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  Cobro lanzado desde una cita. La venta quedará enlazada y la cita se marcará como completada.
                </p>
              </div>
            )}

            <div className="card">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar productos, servicios o bonos..."
                    value={catalogSearch}
                    onChange={(event) => setCatalogSearch(event.target.value)}
                    className="input pl-10 w-full"
                  />
                </div>

                <div className="flex gap-2">
                  {[
                    { value: 'services', label: 'Servicios' },
                    { value: 'products', label: 'Productos' },
                    { value: 'bonos', label: 'Bonos' },
                    { value: 'all', label: 'Todos' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleCatalogTypeChange(option.value as typeof catalogType)}
                      className={`btn ${catalogType === option.value ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {catalogType !== 'all' && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Familias de {catalogTypeLabels[catalogType as Exclude<CatalogType, 'all'>]}
                    </p>
                    {activeFamily && (
                      <button
                        type="button"
                        onClick={() =>
                          catalogType === 'services'
                            ? setSelectedServiceFamily(null)
                            : catalogType === 'products'
                              ? setSelectedProductFamily(null)
                              : setSelectedBonoFamily(null)
                        }
                        className="text-xs text-primary-600 hover:underline"
                      >
                        Quitar filtro de familia
                      </button>
                    )}
                  </div>

                  {activeFamilyCards.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No hay familias disponibles en este catálogo.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      {activeFamilyCards.map((card) => (
                        (() => {
                          const matchedLegend =
                            catalogType === 'services'
                              ? resolveAppointmentLegend(legendItems, card.family)
                              : null
                          const isSelected = activeFamily === card.family

                          return (
                            <button
                              key={card.family}
                              type="button"
                              onClick={() => handleToggleFamily(card.family)}
                              className={`rounded-lg border p-3 text-left transition-all ${
                                matchedLegend
                                  ? 'hover:brightness-[0.98]'
                                  : isSelected
                                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
                              }`}
                              style={
                                matchedLegend
                                  ? {
                                      borderColor: matchedLegend.color,
                                      boxShadow: isSelected ? `0 0 0 2px ${matchedLegend.color}33` : undefined
                                    }
                                  : undefined
                              }
                            >
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {card.label}
                              </p>
                              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                {card.total} {catalogTypeLabels[catalogType as Exclude<CatalogType, 'all'>]}
                              </p>
                            </button>
                          )
                        })()
                      ))}
                    </div>
                  )}
                </div>
              )}

              {catalogType !== 'all' && (
                <div className="mb-4 flex justify-end">
                  <button type="button" onClick={toggleCatalogItems} className="btn btn-secondary btn-sm">
                    {catalogItemsExpanded
                      ? `Ocultar ${catalogTypeLabels[catalogType as Exclude<CatalogType, 'all'>]}`
                      : `Mostrar ${catalogTypeLabels[catalogType as Exclude<CatalogType, 'all'>]}`}
                  </button>
                </div>
              )}

              {catalogItemsExpanded ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                  {filteredCatalog.length === 0 ? (
                    <div className="sm:col-span-2 xl:col-span-3 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      No hay elementos para este filtro.
                    </div>
                  ) : (
                    filteredCatalog.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onClick={() => addToCart(item, item.type)}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 text-left transition-colors"
                      >
                        <p className="mb-2 font-semibold text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {item.type === 'bono' ? item.serviceName : item.category}
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            €{Number(item.price).toFixed(2)}
                          </span>
                          {item.type === 'product' ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400">Stock: {item.stock}</span>
                          ) : item.type === 'bono' ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {item.totalSessions} sesiones
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {catalogType === 'all'
                    ? 'Pulsa un filtro para desplegar el listado.'
                    : `Pulsa "Mostrar ${catalogTypeLabels[catalogType as Exclude<CatalogType, 'all'>]}" para desplegar el listado.`}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card">
              <label className="label">Cliente</label>
              {selectedClient ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {selectedClient.firstName} {selectedClient.lastName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{selectedClient.phone}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {selectedClient.loyaltyPoints} puntos
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Abono: {formatCurrency(Number(selectedClient.accountBalance || 0))}
                    </p>
                  </div>
                  <button onClick={() => setSelectedClient(null)} className="text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setClientModalOpen(true)
                      if (clients.length === 0 && !clientsLoading) {
                        void loadClients()
                      }
                    }}
                    className="btn btn-secondary w-full"
                  >
                    Seleccionar Cliente
                  </button>

                  {hasBonoItems ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      Los bonos necesitan un cliente seleccionado para asignar el pack al cerrar la venta.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Carrito</h3>
                <span className="text-sm text-gray-600 dark:text-gray-400">{cart.length} items</span>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto mb-4">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Carrito vacío</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{item.name}</p>
                        {item.detail ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{item.detail}</p>
                        ) : null}
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          €{item.price.toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateCartItemQuantity(item.id, -1)} className="btn btn-secondary btn-sm">
                          -
                        </button>
                        <span className="w-8 text-center font-semibold">{item.quantity}</span>
                        <button onClick={() => updateCartItemQuantity(item.id, 1)} className="btn btn-secondary btn-sm">
                          <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeFromCart(item.id)} className="text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(event) => setDiscount(Math.max(0, Math.min(100, Number(event.target.value))))}
                    className="input"
                  />
                </div>

                {saleMode !== 'PENDING' ? (
                  <div>
                    <label className="label">Método de pago</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'CASH', label: 'Efectivo' },
                        { value: 'CARD', label: 'Tarjeta' },
                        { value: 'BIZUM', label: 'Bizum' },
                        { value: 'ABONO', label: 'Abono' }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setPaymentMode('SINGLE')
                            setPaymentMethod(option.value as typeof paymentMethod)
                          }}
                          className={`btn ${
                            paymentMode === 'SINGLE' && paymentMethod === option.value ? 'btn-primary' : 'btn-secondary'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCombinedPaymentModalOpen(true)}
                      className={`btn mt-2 w-full ${paymentMode === 'COMBINED' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      Combinado
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    La forma de pago se registrará cuando se salde la deuda desde la ficha del cliente.
                  </div>
                )}

                <div>
                  <label className="label">Profesional</label>
                  <select
                    value={professional}
                    onChange={(event) => setProfessional(event.target.value)}
                    className="input"
                  >
                    {professionals.length === 0 ? (
                      <option value="">Sin profesionales configuradas</option>
                    ) : (
                      [...new Set((professional ? [...professionals, professional] : professionals).filter(Boolean))].map(
                        (professionalOption) => (
                          <option key={professionalOption} value={professionalOption}>
                            {professionalOption}
                          </option>
                        )
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="label">Estado</label>
                  <select
                    value={saleMode}
                    onChange={(event) => {
                      const nextSaleMode = event.target.value as SaleMode
                      setSaleMode(nextSaleMode)
                      if (nextSaleMode === 'PENDING') {
                        setPaymentMode('SINGLE')
                      }
                    }}
                    className="input"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="PENDING">Pendiente</option>
                    <option value="ON_HOLD">En espera</option>
                    <option value="QUOTE">Presupuesto</option>
                  </select>
                </div>

                <div>
                  <label className="label">Notas</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="input resize-none"
                    rows={3}
                    placeholder="Notas internas del cobro..."
                  />
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                    <span className="font-semibold">€{subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Descuento</span>
                      <span>-€{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span>Total</span>
                    <span className="text-blue-600 dark:text-blue-400">€{total.toFixed(2)}</span>
                  </div>
                </div>

                <button onClick={handleCompleteSale} disabled={cart.length === 0 || loading} className={`btn w-full ${saleMode === 'QUOTE' ? 'btn-secondary' : 'btn-primary'}`}>
                  {saleMode === 'QUOTE' ? <FileText className="w-5 h-5 mr-2" /> : <Receipt className="w-5 h-5 mr-2" />}
                  {loading
                    ? 'Procesando...'
                    : saleMode === 'QUOTE'
                      ? 'Generar Presupuesto'
                      : saleMode === 'PENDING'
                        ? 'Guardar Pendiente'
                        : 'Completar Venta'}
                </button>
              </div>
            </div>

            {lastCompletedSale && (
              <div className="card border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
                <p className="font-semibold text-green-900 dark:text-green-200">
                  Venta {lastCompletedSale.saleNumber}{' '}
                  {lastCompletedSale.status === 'PENDING' ? 'guardada como pendiente.' : 'completada.'}
                </p>
                <div className="flex gap-3 mt-4">
                  {lastCompletedSale.status !== 'PENDING' ? (
                    <button onClick={() => void handlePrintSale(lastCompletedSale)} className="btn btn-primary flex-1">
                      Emitir ticket
                    </button>
                  ) : null}
                  <button onClick={() => void viewSaleDetail(lastCompletedSale.id)} className="btn btn-secondary flex-1">
                    Ver detalle
                  </button>
                </div>
              </div>
            )}

            {lastCompletedQuote && (
              <div className="card border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
                <p className="font-semibold text-blue-900 dark:text-blue-200">
                  Presupuesto {lastCompletedQuote.quoteNumber} generado.
                </p>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => void handlePrintQuote(lastCompletedQuote)} className="btn btn-primary flex-1">
                    <FileText className="w-4 h-4 mr-2" />
                    Imprimir presupuesto
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : view === 'history' ? (
        <div className="space-y-6">
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por número o cliente..."
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  className="input pl-10 w-full"
                />
              </div>
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(event) => setDateFilter({ ...dateFilter, startDate: event.target.value })}
                className="input"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(event) => setDateFilter({ ...dateFilter, endDate: event.target.value })}
                  className="input flex-1"
                />
                <button onClick={() => void loadSales()} className="btn btn-primary">
                  Buscar
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Pago</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No se encontraron ventas
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale) => (
                      <tr key={sale.id}>
                        <td className="font-mono text-sm">{sale.saleNumber}</td>
                        <td>{format(new Date(sale.date), 'dd/MM/yyyy HH:mm', { locale: es })}</td>
                        <td>{getSaleDisplayName(sale)}</td>
                        <td className="font-semibold">€{Number(sale.total).toFixed(2)}</td>
                        <td>
                          <div className="space-y-1">
                            <p>{salePaymentMethodLabel(sale)}</p>
                            {getSaleAccountBalanceMovement(sale) ? (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                Saldo restante: {formatCurrency(Number(getSaleAccountBalanceMovement(sale)?.balanceAfter || 0))}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td>{sale.status}</td>
                        <td>
                          <div className="flex gap-2">
                            <button onClick={() => void viewSaleDetail(sale.id)} className="btn btn-sm btn-secondary">
                              Ver detalle
                            </button>
                            {sale.status !== 'PENDING' ? (
                              <button onClick={() => void handlePrintSale(sale)} className="btn btn-sm btn-primary">
                                Ticket
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por cliente, concepto o venta..."
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  className="input pl-10 w-full"
                />
              </div>
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(event) => setDateFilter({ ...dateFilter, startDate: event.target.value })}
                className="input"
              />
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(event) => setDateFilter({ ...dateFilter, endDate: event.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Historial global de abonos</h2>
              <button onClick={() => void loadAccountBalanceHistory()} className="btn btn-secondary btn-sm" disabled={loading}>
                Actualizar
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>Importe</th>
                    <th>Saldo restante</th>
                    <th>Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Cargando historial de abonos...
                      </td>
                    </tr>
                  ) : filteredAccountBalanceHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No se encontraron movimientos de abono
                      </td>
                    </tr>
                  ) : (
                    filteredAccountBalanceHistory.map((movement) => (
                      <tr key={movement.id}>
                        <td>{format(new Date(movement.operationDate), 'dd/MM/yyyy HH:mm', { locale: es })}</td>
                        <td>{`${movement.client.firstName} ${movement.client.lastName}`}</td>
                        <td>
                          {movement.type === 'TOP_UP'
                            ? 'Recarga'
                            : movement.type === 'CONSUMPTION'
                              ? 'Consumo'
                              : 'Ajuste'}
                        </td>
                        <td>
                          <div className="space-y-1">
                            <p>{movement.description}</p>
                            {movement.referenceItem ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{movement.referenceItem}</p>
                            ) : null}
                          </div>
                        </td>
                        <td className={`font-semibold ${movement.type === 'CONSUMPTION' ? 'text-red-600' : 'text-green-600'}`}>
                          {movement.type === 'CONSUMPTION' ? '-' : '+'}
                          {formatCurrency(Number(movement.amount || 0))}
                        </td>
                        <td>{formatCurrency(Number(movement.balanceAfter || 0))}</td>
                        <td>
                          {movement.sale ? (
                            <div className="space-y-1">
                              <p className="font-mono text-xs">{movement.sale.saleNumber}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {salePaymentMethodLabel({ ...movement.sale, accountBalanceMovements: [movement] })}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={accountBalanceConfirmModalOpen}
        onClose={() => {
          if (loading) return
          setAccountBalanceConfirmModalOpen(false)
        }}
        title="Confirmar cobro con abono"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Cliente</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'Sin cliente'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Gasto de la venta</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(accountBalanceSaleAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Saldo actual en abono</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(availableAccountBalance)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Saldo restante tras el cobro</p>
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                {formatCurrency(accountBalanceRemainingAfterSale)}
              </p>
            </div>
          </div>

          {accountBalanceRemainderToPay > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              El abono cubrirá {formatCurrency(accountBalanceUsableAmount)} y quedarán {formatCurrency(accountBalanceRemainderToPay)} pendientes por cobrar con otro método.
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
              El importe completo se descontará del abono del cliente.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAccountBalanceConfirmModalOpen(false)}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmAccountBalanceSale()}
              className="btn btn-primary"
              disabled={loading}
            >
              Continuar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={accountBalanceRemainderModalOpen}
        onClose={() => {
          if (loading) return
          setAccountBalanceRemainderModalOpen(false)
          setPendingAccountBalanceUsage(0)
          setPendingRemainderAmount(0)
        }}
        title="Abono insuficiente"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            El abono cubre {formatCurrency(pendingAccountBalanceUsage)} y quedan {formatCurrency(pendingRemainderAmount)} por cobrar.
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">¿Cómo se va a realizar el pago del restante?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => void handleRemainderPaymentSelection('CASH')}
              className="btn btn-secondary"
              disabled={loading}
            >
              Efectivo
            </button>
            <button
              onClick={() => void handleRemainderPaymentSelection('CARD')}
              className="btn btn-secondary"
              disabled={loading}
            >
              Tarjeta
            </button>
            <button
              onClick={() => void handleRemainderPaymentSelection('BIZUM')}
              className="btn btn-secondary"
              disabled={loading}
            >
              Bizum
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={combinedPaymentModalOpen}
        onClose={() => {
          if (loading) return
          setCombinedPaymentModalOpen(false)
        }}
        title="Pago combinado"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total de la venta</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(total)}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <label className="label">Método de pago</label>
              <select
                value={combinedPaymentDraft.primaryMethod}
                onChange={(event) =>
                  setCombinedPaymentDraft((current) => ({
                    ...current,
                    primaryMethod: event.target.value as SalePaymentMethod
                  }))
                }
                className="input"
              >
                <option value="CASH">Metálico</option>
                <option value="CARD">Tarjeta</option>
                <option value="BIZUM">Bizum</option>
                <option value="ABONO">Abono</option>
              </select>
            </div>
            <div>
              <label className="label">Cuantía</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={Math.max(0, total - 0.01)}
                value={combinedPaymentDraft.primaryAmount}
                onChange={(event) =>
                  setCombinedPaymentDraft((current) => ({
                    ...current,
                    primaryAmount: event.target.value
                  }))
                }
                className="input"
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <label className="label">Segunda forma</label>
              <select
                value={combinedPaymentDraft.secondaryMethod}
                onChange={(event) =>
                  setCombinedPaymentDraft((current) => ({
                    ...current,
                    secondaryMethod: event.target.value as CombinedSecondaryPaymentMethod
                  }))
                }
                className="input"
              >
                <option value="CASH">Metálico</option>
                <option value="CARD">Tarjeta</option>
                <option value="BIZUM">Bizum</option>
                <option value="ABONO">Abono</option>
                <option value="PENDING">Pendiente</option>
              </select>
            </div>
            <div>
              <label className="label">Cuantía calculada</label>
              <input
                type="text"
                value={formatCurrency(getCombinedSecondaryAmount())}
                className="input"
                readOnly
              />
            </div>
          </div>

          {combinedPaymentDraft.secondaryMethod === 'PENDING' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              El importe restante se registrará como pendiente y aparecerá en la ficha del cliente, pestaña Pendiente - caja.
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setCombinedPaymentModalOpen(false)
                if (paymentMode !== 'COMBINED') {
                  resetCombinedPaymentDraft()
                }
              }}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const resolvedPayment = resolveCombinedPayment()
                if (!resolvedPayment) return
                setPaymentMode('COMBINED')
                setCombinedPaymentModalOpen(false)
              }}
              className="btn btn-primary"
              disabled={loading}
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={cashTicketDecisionModalOpen}
        onClose={() => {
          if (loading) return
          setCashTicketDecisionModalOpen(false)
          setPendingSaleExecution(null)
        }}
        title={cashDecisionIsCombinedPayment ? 'Pago combinado con metálico' : 'Venta en efectivo'}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {cashDecisionIsCombinedPayment
              ? '¿Quieres imprimir ticket para esta venta con pago combinado?'
              : '¿Quieres imprimir ticket para esta venta en efectivo?'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {cashDecisionIsCombinedPayment ? (
              <>
                Si seleccionas <strong>No imprimir ticket</strong>, solo la parte en metálico se guardará en la sección privada de caja. La otra forma de pago seguirá registrándose de forma normal.
              </>
            ) : (
              <>
                Si seleccionas <strong>No imprimir ticket</strong>, la operación se guardará en la sección privada de caja y no afectará a los movimientos oficiales.
              </>
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => {
                setCashTicketDecisionModalOpen(false)
                void completeSaleRequest({
                  printTicketAfterSale: true,
                  showInOfficialCash: true,
                  paymentMethodOverride: pendingSaleExecution?.paymentMethodOverride,
                  accountBalanceUsageAmount: pendingSaleExecution?.accountBalanceUsageAmount,
                  combinedPayment: pendingSaleExecution?.combinedPayment
                    ? {
                        ...pendingSaleExecution.combinedPayment,
                        cashShowInOfficialCash: true
                      }
                    : undefined
                })
              }}
              className="btn btn-primary"
              disabled={loading}
            >
              Imprimir ticket
            </button>
            <button
              onClick={() => {
                setCashTicketDecisionModalOpen(false)
                void completeSaleRequest({
                  printTicketAfterSale: false,
                  showInOfficialCash: pendingSaleExecution?.combinedPayment ? true : false,
                  paymentMethodOverride: pendingSaleExecution?.paymentMethodOverride,
                  accountBalanceUsageAmount: pendingSaleExecution?.accountBalanceUsageAmount,
                  combinedPayment: pendingSaleExecution?.combinedPayment
                    ? {
                        ...pendingSaleExecution.combinedPayment,
                        cashShowInOfficialCash: false
                      }
                    : undefined
                })
              }}
              className="btn btn-secondary"
              disabled={loading}
            >
              No imprimir ticket
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={clientModalOpen} onClose={() => setClientModalOpen(false)} title="Seleccionar Cliente">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {clientsLoading ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                Cargando clientes...
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                No se han encontrado clientes con esa búsqueda.
              </div>
            ) : (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    setSelectedClient(client)
                    setClientModalOpen(false)
                    setClientSearch('')
                  }}
                  className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 text-left transition-colors"
                >
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {client.firstName} {client.lastName}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{client.phone}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      <Modal isOpen={saleDetailOpen} onClose={() => setSaleDetailOpen(false)} title="Detalle de Venta" maxWidth="2xl">
        {selectedSale && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Número de venta</p>
                <p className="font-mono font-semibold text-lg">{selectedSale.saleNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Fecha</p>
                <p className="font-semibold">{format(new Date(selectedSale.date), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Cliente</p>
                <p className="font-semibold">
                  {getSaleDisplayName(selectedSale)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Método de pago</p>
                <p className="font-semibold">{salePaymentMethodLabel(selectedSale)}</p>
              </div>
              {selectedSaleAccountBalanceMovement ? (
                <>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Abono usado</p>
                    <p className="font-semibold text-amber-700 dark:text-amber-300">
                      {formatCurrency(Number(selectedSaleAccountBalanceMovement.amount || 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Saldo restante</p>
                    <p className="font-semibold text-amber-700 dark:text-amber-300">
                      {formatCurrency(Number(selectedSaleAccountBalanceMovement.balanceAfter || 0))}
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              {selectedSale.items.map((item: any) => (
                <div key={item.id} className="flex justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{item.description}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      €{Number(item.price).toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold">€{Number(item.subtotal).toFixed(2)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                <span className="font-semibold">€{Number(selectedSale.subtotal).toFixed(2)}</span>
              </div>
              {Number(selectedSale.discount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span>
                  <span>-€{Number(selectedSale.discount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span>
                <span className="text-blue-600 dark:text-blue-400">€{Number(selectedSale.total).toFixed(2)}</span>
              </div>
            </div>

            {selectedSale.status !== 'PENDING' ? (
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={() => void handlePrintSale(selectedSale)} className="btn btn-primary flex-1">
                  <Receipt className="w-4 h-4 mr-2" />
                  Imprimir Ticket
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  )
}
