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

export default function Sales() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<'pos' | 'history'>(searchParams.get('view') === 'history' ? 'history' : 'pos')

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'BIZUM' | 'OTHER'>('CASH')
  const [notes, setNotes] = useState('')
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(searchParams.get('appointmentId'))
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogType, setCatalogType] = useState<'all' | 'products' | 'services'>('all')

  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')

  const [sales, setSales] = useState<Sale[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' })

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

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
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
        paymentMethod,
        notes
      })

      const createdSale = response.data
      setLastCompletedSale(createdSale)
      setCart([])
      setDiscount(0)
      setNotes('')
      setPaymentMethod('CASH')
      setLinkedAppointmentId(null)
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
      await printTicket(buildSaleTicketPayload(sale))
      toast.success('Ticket enviado a la impresora')
    } catch (error: any) {
      toast.error(error.message || 'No se pudo imprimir el ticket')
    }
  }

  const filteredCatalog = useMemo(() => {
    let items: any[] = []
    if (catalogType === 'all' || catalogType === 'products') {
      items = [...items, ...products.map((product) => ({ ...product, type: 'product' }))]
    }
    if (catalogType === 'all' || catalogType === 'services') {
      items = [...items, ...services.map((service) => ({ ...service, type: 'service' }))]
    }
    if (catalogSearch) {
      const term = catalogSearch.toLowerCase()
      items = items.filter(
        (item) => item.name.toLowerCase().includes(term) || item.category.toLowerCase().includes(term)
      )
    }
    return items
  }, [catalogSearch, catalogType, products, services])

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

  const { subtotal, discountAmount, total } = calculateTotals()

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
                    { value: 'all', label: 'Todos' },
                    { value: 'products', label: 'Productos' },
                    { value: 'services', label: 'Servicios' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setCatalogType(option.value as typeof catalogType)}
                      className={`btn ${catalogType === option.value ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {option.value === 'products' && <Package className="w-4 h-4 mr-2" />}
                      {option.value === 'services' && <Scissors className="w-4 h-4 mr-2" />}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                {filteredCatalog.map((item) => (
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
                ))}
              </div>
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
