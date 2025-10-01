import { useState, useEffect } from 'react'
import { ShoppingCart, User, Package, Scissors, Plus, Minus, Trash2, CreditCard, DollarSign, Receipt, Clock, Filter, Search } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

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
  const [view, setView] = useState<'pos' | 'history'>('pos')

  // POS State
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'MIXED'>('CASH')
  const [notes, setNotes] = useState('')

  // Catalog State
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogType, setCatalogType] = useState<'all' | 'products' | 'services'>('all')

  // Client Modal
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')

  // History State
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' })

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (view === 'pos') {
      loadCatalog()
    } else {
      loadSales()
    }
  }, [view])

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
    const existingItem = cart.find(
      cartItem =>
        cartItem.type === type &&
        (type === 'product' ? cartItem.productId === item.id : cartItem.serviceId === item.id)
    )

    if (existingItem) {
      if (type === 'product') {
        const product = item as Product
        if (existingItem.quantity >= product.stock) {
          toast.error('Stock insuficiente')
          return
        }
      }

      setCart(cart.map(cartItem =>
        cartItem.id === existingItem.id
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      ))
      toast.success('Cantidad actualizada')
    } else {
      const newItem: CartItem = {
        id: `${type}-${item.id}-${Date.now()}`,
        type,
        name: item.name,
        price: Number(item.price),
        quantity: 1,
        ...(type === 'product' && { stock: (item as Product).stock, productId: item.id }),
        ...(type === 'service' && { serviceId: item.id })
      }
      setCart([...cart, newItem])
      toast.success('Agregado al carrito')
    }
  }

  const updateCartItemQuantity = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQuantity = item.quantity + delta

        if (newQuantity <= 0) return item

        if (item.type === 'product' && item.stock && newQuantity > item.stock) {
          toast.error('Stock insuficiente')
          return item
        }

        return { ...item, quantity: newQuantity }
      }
      return item
    }))
  }

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id))
    toast.success('Eliminado del carrito')
  }

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    const discountAmount = (subtotal * discount) / 100
    const total = subtotal - discountAmount

    return { subtotal, discountAmount, total }
  }

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }

    try {
      setLoading(true)

      const { subtotal, discountAmount, total } = calculateTotals()

      const saleData = {
        clientId: selectedClient?.id || null,
        items: cart.map(item => ({
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
      }

      const response = await api.post('/sales', saleData)

      toast.success(`Venta completada: ${response.data.saleNumber}`)

      // Reset form
      setCart([])
      setSelectedClient(null)
      setDiscount(0)
      setPaymentMethod('CASH')
      setNotes('')

      // Reload catalog to update stock
      loadCatalog()
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

  const filteredCatalog = () => {
    let items: any[] = []

    if (catalogType === 'all' || catalogType === 'products') {
      items = [...items, ...products.map(p => ({ ...p, type: 'product' }))]
    }
    if (catalogType === 'all' || catalogType === 'services') {
      items = [...items, ...services.map(s => ({ ...s, type: 'service' }))]
    }

    if (catalogSearch) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        item.category.toLowerCase().includes(catalogSearch.toLowerCase())
      )
    }

    return items
  }

  const filteredClients = clients.filter(client =>
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.phone.includes(clientSearch) ||
    (client.email && client.email.toLowerCase().includes(clientSearch.toLowerCase()))
  )

  const filteredSales = sales.filter(sale =>
    sale.saleNumber.toLowerCase().includes(historySearch.toLowerCase()) ||
    (sale.client && `${sale.client.firstName} ${sale.client.lastName}`.toLowerCase().includes(historySearch.toLowerCase()))
  )

  const { subtotal, discountAmount, total } = calculateTotals()

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Ventas
        </h1>

        {/* View Toggle */}
        <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setView('pos')}
            className={`px-4 py-2 rounded-md transition-colors ${
              view === 'pos'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <ShoppingCart className="w-5 h-5 inline-block mr-2" />
            Punto de Venta
          </button>
          <button
            onClick={() => setView('history')}
            className={`px-4 py-2 rounded-md transition-colors ${
              view === 'history'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-5 h-5 inline-block mr-2" />
            Historial
          </button>
        </div>
      </div>

      {/* POS View */}
      {view === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Catalog */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar productos o servicios..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="input pl-10 w-full"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setCatalogType('all')}
                    className={`btn ${catalogType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setCatalogType('products')}
                    className={`btn ${catalogType === 'products' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Productos
                  </button>
                  <button
                    onClick={() => setCatalogType('services')}
                    className={`btn ${catalogType === 'services' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    <Scissors className="w-4 h-4 mr-2" />
                    Servicios
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                {filteredCatalog().map((item) => (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item, item.type)}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center">
                        {item.type === 'product' ? (
                          <Package className="w-5 h-5 text-blue-600 mr-2" />
                        ) : (
                          <Scissors className="w-5 h-5 text-purple-600 mr-2" />
                        )}
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {item.name}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {item.category}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        €{Number(item.price).toFixed(2)}
                      </span>
                      {item.type === 'product' && (
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.stock > 10
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : item.stock > 0
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}>
                          Stock: {item.stock}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cart & Checkout */}
          <div className="space-y-4">
            {/* Client Selection */}
            <div className="card">
              <label className="label">Cliente</label>
              {selectedClient ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {selectedClient.firstName} {selectedClient.lastName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedClient.phone}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {selectedClient.loyaltyPoints} puntos
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedClient(null)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    loadClients()
                    setClientModalOpen(true)
                  }}
                  className="btn btn-secondary w-full"
                >
                  <User className="w-4 h-4 mr-2" />
                  Seleccionar Cliente (Opcional)
                </button>
              )}
            </div>

            {/* Cart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Carrito
                </h3>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {cart.length} items
                </span>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto mb-4">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Carrito vacío</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {item.name}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          €{item.price.toFixed(2)} × {item.quantity}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartItemQuantity(item.id, -1)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateCartItemQuantity(item.id, 1)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          disabled={item.type === 'product' && item.stock !== undefined && item.quantity >= item.stock}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 rounded ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Discount */}
              <div className="mb-4">
                <label className="label">Descuento (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="input"
                  placeholder="0"
                />
              </div>

              {/* Payment Method */}
              <div className="mb-4">
                <label className="label">Método de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMethod('CASH')}
                    className={`btn ${paymentMethod === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Efectivo
                  </button>
                  <button
                    onClick={() => setPaymentMethod('CARD')}
                    className={`btn ${paymentMethod === 'CARD' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Tarjeta
                  </button>
                  <button
                    onClick={() => setPaymentMethod('TRANSFER')}
                    className={`btn ${paymentMethod === 'TRANSFER' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Transferencia
                  </button>
                  <button
                    onClick={() => setPaymentMethod('MIXED')}
                    className={`btn ${paymentMethod === 'MIXED' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Mixto
                  </button>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                  <span className="font-semibold">€{subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>Descuento ({discount}%):</span>
                    <span>-€{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span>Total:</span>
                  <span className="text-blue-600 dark:text-blue-400">€{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Complete Sale Button */}
              <button
                onClick={handleCompleteSale}
                disabled={cart.length === 0 || loading}
                className="btn btn-primary w-full mt-4"
              >
                <Receipt className="w-5 h-5 mr-2" />
                {loading ? 'Procesando...' : 'Completar Venta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History View */}
      {view === 'history' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por número o cliente..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="input pl-10 w-full"
                />
              </div>
              <div>
                <input
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                  className="input"
                  placeholder="Fecha inicio"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                  className="input flex-1"
                  placeholder="Fecha fin"
                />
                <button
                  onClick={loadSales}
                  className="btn btn-primary"
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Sales List */}
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
                        <td>
                          {sale.client
                            ? `${sale.client.firstName} ${sale.client.lastName}`
                            : 'Cliente general'}
                        </td>
                        <td className="font-semibold">€{Number(sale.total).toFixed(2)}</td>
                        <td>
                          <span className={`badge ${
                            sale.paymentMethod === 'CASH' ? 'badge-success' :
                            sale.paymentMethod === 'CARD' ? 'badge-info' :
                            'badge-warning'
                          }`}>
                            {sale.paymentMethod === 'CASH' ? 'Efectivo' :
                             sale.paymentMethod === 'CARD' ? 'Tarjeta' :
                             sale.paymentMethod === 'TRANSFER' ? 'Transferencia' : 'Mixto'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${
                            sale.status === 'COMPLETED' ? 'badge-success' :
                            sale.status === 'PENDING' ? 'badge-warning' :
                            'badge-error'
                          }`}>
                            {sale.status === 'COMPLETED' ? 'Completada' :
                             sale.status === 'PENDING' ? 'Pendiente' :
                             sale.status === 'CANCELLED' ? 'Cancelada' : 'Reembolsada'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => viewSaleDetail(sale.id)}
                            className="btn btn-sm btn-secondary"
                          >
                            Ver detalle
                          </button>
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

      {/* Client Selection Modal */}
      <Modal
        isOpen={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        title="Seleccionar Cliente"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => {
                  setSelectedClient(client)
                  setClientModalOpen(false)
                  setClientSearch('')
                }}
                className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {client.firstName} {client.lastName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {client.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {client.loyaltyPoints} puntos
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Sale Detail Modal */}
      <Modal
        isOpen={saleDetailOpen}
        onClose={() => setSaleDetailOpen(false)}
        title="Detalle de Venta"
        maxWidth="2xl"
      >
        {selectedSale && (
          <div className="space-y-6">
            {/* Header Info */}
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
                  {selectedSale.client
                    ? `${selectedSale.client.firstName} ${selectedSale.client.lastName}`
                    : 'Cliente general'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Método de pago</p>
                <p className="font-semibold">
                  {selectedSale.paymentMethod === 'CASH' ? 'Efectivo' :
                   selectedSale.paymentMethod === 'CARD' ? 'Tarjeta' :
                   selectedSale.paymentMethod === 'TRANSFER' ? 'Transferencia' : 'Mixto'}
                </p>
              </div>
            </div>

            {/* Items */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Items</h4>
              <div className="space-y-2">
                {selectedSale.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.description}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        €{Number(item.price).toFixed(2)} × {item.quantity}
                      </p>
                    </div>
                    <p className="font-semibold">
                      €{Number(item.subtotal).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-semibold">€{Number(selectedSale.subtotal).toFixed(2)}</span>
              </div>
              {Number(selectedSale.discount) > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Descuento:</span>
                  <span>-€{Number(selectedSale.discount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
                <span>Total:</span>
                <span className="text-blue-600 dark:text-blue-400">
                  €{Number(selectedSale.total).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => window.print()}
                className="btn btn-primary flex-1"
              >
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
