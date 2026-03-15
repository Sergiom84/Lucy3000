import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Clock,
  CreditCard,
  DollarSign,
  Package,
  Plus,
  Receipt,
  Scissors,
  Search,
  ShoppingCart,
  Trash2
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import api from '../utils/api'
import { printTicket } from '../utils/desktop'
import { getPrintTicketSuccessMessage } from '../utils/desktop'
import { formatCurrency } from '../utils/format'
import { buildSaleTicketPayload, paymentMethodLabel } from '../utils/tickets'

interface CartItem {
  id: string
  type: 'product' | 'service'
  name: string
  price: number
  quantity: number
  stock?: number
  productId?: string
  serviceId?: string
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
}

interface Service {
  id: string
  name: string
  price: number
  duration: number
  category: string
}

interface Sale {
  id: string
  saleNumber: string
  date: string
  client?: Client
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  status: string
  items: any[]
}

type CatalogItem = (Product & { type: 'product' }) | (Service & { type: 'service' })
type SalePaymentMethod = 'CASH' | 'CARD' | 'BIZUM' | 'OTHER'
type PendingSaleExecutionOptions = {
  paymentMethodOverride?: SalePaymentMethod
  accountBalanceUsageAmount?: number
}

const formatFamilyLabel = (value: string): string =>
  value
    .toLowerCase()
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export default function Sales() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<'pos' | 'history'>(searchParams.get('view') === 'history' ? 'history' : 'pos')

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH')
  const [notes, setNotes] = useState('')
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(searchParams.get('appointmentId'))
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogType, setCatalogType] = useState<'all' | 'products' | 'services'>('services')
  const [selectedServiceFamily, setSelectedServiceFamily] = useState<string | null>(null)
  const [selectedProductFamily, setSelectedProductFamily] = useState<string | null>(null)
  const [servicesExpanded, setServicesExpanded] = useState(false)
  const [productsExpanded, setProductsExpanded] = useState(false)

  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')

  const [sales, setSales] = useState<Sale[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' })
  const [cashTicketDecisionModalOpen, setCashTicketDecisionModalOpen] = useState(false)
  const [accountBalanceRemainderModalOpen, setAccountBalanceRemainderModalOpen] = useState(false)
  const [pendingSaleExecution, setPendingSaleExecution] = useState<PendingSaleExecutionOptions | null>(null)
  const [pendingAccountBalanceUsage, setPendingAccountBalanceUsage] = useState(0)
  const [pendingRemainderAmount, setPendingRemainderAmount] = useState(0)

  const [loading, setLoading] = useState(false)
  const prefillApplied = useRef({ client: false, service: false, sale: false })

  const prefilledClientId = searchParams.get('clientId')
  const prefilledServiceId = searchParams.get('serviceId')
  const prefilledSaleId = searchParams.get('openSaleId')

  useEffect(() => {
    if (view === 'pos') {
      void loadCatalog()
      if (prefilledClientId) {
        void loadClients()
      }
      return
    }

    void loadSales()
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

  const loadCatalog = async () => {
    try {
      const [productsRes, servicesRes] = await Promise.all([
        api.get('/products?isActive=true'),
        api.get('/services?isActive=true')
      ])
      setProducts(productsRes.data)
      setServices(servicesRes.data)
    } catch (error) {
      console.error('Error loading catalog:', error)
      toast.error('Error al cargar el catálogo')
    }
  }

  const loadClients = async () => {
    try {
      const response = await api.get('/clients?isActive=true')
      setClients(response.data)
    } catch (error) {
      console.error('Error loading clients:', error)
      toast.error('Error al cargar clientes')
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

  const addToCart = (item: Product | Service, type: 'product' | 'service') => {
    const existing = cart.find(
      (cartItem) =>
        cartItem.type === type &&
        (type === 'product' ? cartItem.productId === item.id : cartItem.serviceId === item.id)
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
        name: item.name,
        price: Number(item.price),
        quantity: 1,
        ...(type === 'product' ? { stock: (item as Product).stock, productId: item.id } : { serviceId: item.id })
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

  const completeSaleRequest = async (options: {
    printTicketAfterSale: boolean
    showInOfficialCash: boolean
    paymentMethodOverride?: SalePaymentMethod
    accountBalanceUsageAmount?: number
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

    const effectivePaymentMethod = options.paymentMethodOverride || paymentMethod

    const shouldUseAccountBalance = options.accountBalanceUsageAmount !== undefined || effectivePaymentMethod === 'OTHER'

    if (shouldUseAccountBalance) {
      if (!selectedClient?.id) {
        toast.error('Selecciona un cliente para usar abono')
        return
      }

      const automaticAmount = roundCurrency(options.accountBalanceUsageAmount ?? automaticOtherPaymentAmount)
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
        referenceItem: automaticOtherPaymentReference.slice(0, 250) || 'Venta en caja',
        amount: automaticAmount,
        notes: null
      }
    }

    try {
      setLoading(true)
      const { subtotal, discountAmount } = calculateTotals()
      const response = await api.post('/sales', {
        clientId: selectedClient?.id || null,
        appointmentId: linkedAppointmentId,
        items: cart.map((item) => ({
          productId: item.productId || null,
          serviceId: item.serviceId || null,
          description: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        subtotal,
        discount: discountAmount,
        tax: 0,
        paymentMethod: effectivePaymentMethod,
        accountBalanceUsage: accountBalanceUsagePayload,
        showInOfficialCash: options.showInOfficialCash,
        notes
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
      toast.success(`Venta completada: ${createdSale.saleNumber}`)
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

    if (paymentMethod === 'OTHER') {
      if (!selectedClient?.id) {
        toast.error('Selecciona un cliente para usar abono')
        return
      }

      if (automaticOtherPaymentAmount <= 0) {
        toast.error('El importe de la venta debe ser mayor a 0 para usar abono')
        return
      }

      const usableAccountBalance = roundCurrency(Math.min(availableAccountBalance, automaticOtherPaymentAmount))
      if (usableAccountBalance <= 0) {
        toast.error('El cliente no tiene saldo disponible en su abono')
        return
      }

      const remainder = roundCurrency(automaticOtherPaymentAmount - usableAccountBalance)
      if (remainder > 0) {
        setPendingAccountBalanceUsage(usableAccountBalance)
        setPendingRemainderAmount(remainder)
        setAccountBalanceRemainderModalOpen(true)
        return
      }

      await completeSaleRequest({
        printTicketAfterSale: false,
        showInOfficialCash: false,
        paymentMethodOverride: 'OTHER',
        accountBalanceUsageAmount: usableAccountBalance
      })
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

  const filteredCatalog = useMemo(() => {
    let items: CatalogItem[] = []

    if (catalogType === 'all' || catalogType === 'products') {
      items = [...items, ...products.map((product) => ({ ...product, type: 'product' as const }))]
    }
    if (catalogType === 'all' || catalogType === 'services') {
      items = [...items, ...services.map((service) => ({ ...service, type: 'service' as const }))]
    }

    if (catalogType === 'products' && selectedProductFamily) {
      items = items.filter((item) => item.type === 'product' && item.category === selectedProductFamily)
    }

    if (catalogType === 'services' && selectedServiceFamily) {
      items = items.filter((item) => item.type === 'service' && item.category === selectedServiceFamily)
    }

    if (catalogSearch.trim()) {
      const term = catalogSearch.toLowerCase().trim()
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(term) || String(item.category || '').toLowerCase().includes(term)
      )
    }

    return items.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }, [
    catalogSearch,
    catalogType,
    products,
    selectedProductFamily,
    selectedServiceFamily,
    services
  ])

  const activeFamilyCards = catalogType === 'services' ? serviceFamilyCards : productFamilyCards
  const activeFamily = catalogType === 'services' ? selectedServiceFamily : selectedProductFamily
  const catalogItemsExpanded =
    catalogType === 'all' ? true : catalogType === 'services' ? servicesExpanded : productsExpanded

  const filteredClients = useMemo(
    () =>
      clients.filter((client) =>
        `${client.firstName} ${client.lastName}`.toLowerCase().includes(clientSearch.toLowerCase()) ||
        client.phone.includes(clientSearch) ||
        (client.email && client.email.toLowerCase().includes(clientSearch.toLowerCase()))
      ),
    [clientSearch, clients]
  )

  const filteredSales = useMemo(
    () =>
      sales.filter(
        (sale) =>
          sale.saleNumber.toLowerCase().includes(historySearch.toLowerCase()) ||
          (sale.client &&
            `${sale.client.firstName} ${sale.client.lastName}`.toLowerCase().includes(historySearch.toLowerCase()))
      ),
    [historySearch, sales]
  )

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
    }
  }

  const toggleCatalogItems = () => {
    if (catalogType === 'services') {
      setServicesExpanded((current) => !current)
      return
    }

    if (catalogType === 'products') {
      setProductsExpanded((current) => !current)
    }
  }

  const availableAccountBalance = Number(selectedClient?.accountBalance || 0)
  const { subtotal, discountAmount, total } = calculateTotals()
  const automaticOtherPaymentAmount = Math.round((total + Number.EPSILON) * 100) / 100
  const automaticOtherPaymentReference = useMemo(
    () =>
      cart
        .map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
        .join(', ')
        .trim(),
    [cart]
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ventas</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Cobro rápido desde clientes y agenda.
          </p>
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
                    placeholder="Buscar productos o servicios..."
                    value={catalogSearch}
                    onChange={(event) => setCatalogSearch(event.target.value)}
                    className="input pl-10 w-full"
                  />
                </div>

                <div className="flex gap-2">
                  {[
                    { value: 'services', label: 'Servicios', icon: Scissors },
                    { value: 'products', label: 'Productos', icon: Package },
                    { value: 'all', label: 'Todos', icon: null }
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleCatalogTypeChange(option.value as typeof catalogType)}
                      className={`btn ${catalogType === option.value ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {option.icon && <option.icon className="w-4 h-4 mr-2" />}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {catalogType !== 'all' && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Familias de {catalogType === 'services' ? 'servicios' : 'productos'}
                    </p>
                    {activeFamily && (
                      <button
                        type="button"
                        onClick={() =>
                          catalogType === 'services'
                            ? setSelectedServiceFamily(null)
                            : setSelectedProductFamily(null)
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
                        <button
                          key={card.family}
                          type="button"
                          onClick={() => handleToggleFamily(card.family)}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            activeFamily === card.family
                              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {card.label}
                            </p>
                            {catalogType === 'services' ? (
                              <Scissors className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Package className="w-4 h-4 text-primary-600" />
                            )}
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {card.total} {catalogType === 'services' ? 'tratamientos' : 'productos'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {catalogType !== 'all' && (
                <div className="mb-4 flex justify-end">
                  <button type="button" onClick={toggleCatalogItems} className="btn btn-secondary btn-sm">
                    {catalogItemsExpanded
                      ? `Ocultar ${catalogType === 'services' ? 'servicios' : 'productos'}`
                      : `Mostrar ${catalogType === 'services' ? 'servicios' : 'productos'}`}
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
                        <div className="flex items-center gap-2 mb-2">
                          {item.type === 'product' ? (
                            <Package className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Scissors className="w-5 h-5 text-purple-600" />
                          )}
                          <span className="font-semibold text-gray-900 dark:text-white">{item.name}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{item.category}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            €{Number(item.price).toFixed(2)}
                          </span>
                          {item.type === 'product' && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">Stock: {item.stock}</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {catalogType === 'services'
                    ? 'Pulsa "Mostrar servicios" para desplegar el listado.'
                    : 'Pulsa "Mostrar productos" para desplegar el listado.'}
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
                <button
                  onClick={() => {
                    void loadClients()
                    setClientModalOpen(true)
                  }}
                  className="btn btn-secondary w-full"
                >
                  Seleccionar Cliente
                </button>
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

                <div>
                  <label className="label">Método de pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'CASH', label: 'Efectivo', icon: DollarSign },
                      { value: 'CARD', label: 'Tarjeta', icon: CreditCard },
                      { value: 'BIZUM', label: 'Bizum', icon: Receipt },
                      { value: 'OTHER', label: 'Otros', icon: Receipt }
                    ].map((option) => {
                      const Icon = option.icon
                      return (
                        <button
                          key={option.value}
                          onClick={() => setPaymentMethod(option.value as typeof paymentMethod)}
                          className={`btn ${paymentMethod === option.value ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
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

                <button onClick={handleCompleteSale} disabled={cart.length === 0 || loading} className="btn btn-primary w-full">
                  <Receipt className="w-5 h-5 mr-2" />
                  {loading ? 'Procesando...' : 'Completar Venta'}
                </button>
              </div>
            </div>

            {lastCompletedSale && (
              <div className="card border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
                <p className="font-semibold text-green-900 dark:text-green-200">
                  Venta {lastCompletedSale.saleNumber} completada.
                </p>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => void handlePrintSale(lastCompletedSale)} className="btn btn-primary flex-1">
                    Emitir ticket
                  </button>
                  <button onClick={() => void viewSaleDetail(lastCompletedSale.id)} className="btn btn-secondary flex-1">
                    Ver detalle
                  </button>
                </div>
              </div>
            )}
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
                        <td>{sale.client ? `${sale.client.firstName} ${sale.client.lastName}` : 'Cliente general'}</td>
                        <td className="font-semibold">€{Number(sale.total).toFixed(2)}</td>
                        <td>{paymentMethodLabel(sale.paymentMethod)}</td>
                        <td>{sale.status}</td>
                        <td>
                          <div className="flex gap-2">
                            <button onClick={() => void viewSaleDetail(sale.id)} className="btn btn-sm btn-secondary">
                              Ver detalle
                            </button>
                            <button onClick={() => void handlePrintSale(sale)} className="btn btn-sm btn-primary">
                              Ticket
                            </button>
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
      )}

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
        isOpen={cashTicketDecisionModalOpen}
        onClose={() => {
          if (loading) return
          setCashTicketDecisionModalOpen(false)
          setPendingSaleExecution(null)
        }}
        title="Venta en efectivo"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            ¿Quieres imprimir ticket para esta venta en efectivo?
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Si seleccionas <strong>No imprimir ticket</strong>, la operación se guardará en la sección privada de caja y no afectará a los movimientos oficiales.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => {
                setCashTicketDecisionModalOpen(false)
                void completeSaleRequest({
                  printTicketAfterSale: true,
                  showInOfficialCash: true,
                  paymentMethodOverride: pendingSaleExecution?.paymentMethodOverride,
                  accountBalanceUsageAmount: pendingSaleExecution?.accountBalanceUsageAmount
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
                  showInOfficialCash: false,
                  paymentMethodOverride: pendingSaleExecution?.paymentMethodOverride,
                  accountBalanceUsageAmount: pendingSaleExecution?.accountBalanceUsageAmount
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
            {filteredClients.map((client) => (
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
            ))}
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
                  {selectedSale.client ? `${selectedSale.client.firstName} ${selectedSale.client.lastName}` : 'Cliente general'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Método de pago</p>
                <p className="font-semibold">{paymentMethodLabel(selectedSale.paymentMethod)}</p>
              </div>
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

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => void handlePrintSale(selectedSale)} className="btn btn-primary flex-1">
                <Receipt className="w-4 h-4 mr-2" />
                Imprimir Ticket
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
