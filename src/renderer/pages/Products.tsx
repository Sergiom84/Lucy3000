import { useEffect, useState } from 'react'
import { Plus, Search, Edit, Trash2, Package, AlertTriangle, TrendingUp, TrendingDown, Upload } from 'lucide-react'
import api from '../utils/api'
import { formatCurrency } from '../utils/format'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ProductForm from '../components/ProductForm'
import ImportProductsModal from '../components/ImportProductsModal'

export default function Products() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [showStockModal, setShowStockModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [showImportModal, setShowImportModal] = useState(false)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products')
      setProducts(response.data)
    } catch (error) {
      console.error('Error fetching products:', error)
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return

    try {
      await api.delete(`/products/${id}`)
      toast.success('Producto eliminado')
      fetchProducts()
    } catch (error) {
      toast.error('Error al eliminar producto')
    }
  }

  const handleEdit = (product: any) => {
    setEditingProduct(product)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProduct(null)
  }

  const handleFormSuccess = () => {
    handleCloseModal()
    fetchProducts()
  }

  const handleStockMovement = (product: any) => {
    setSelectedProduct(product)
    setShowStockModal(true)
  }

  const handleCloseStockModal = () => {
    setShowStockModal(false)
    setSelectedProduct(null)
  }

  // Filtrar productos
  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku.toLowerCase().includes(search.toLowerCase()) ||
      product.brand?.toLowerCase().includes(search.toLowerCase())

    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter

    return matchesSearch && matchesCategory
  })

  // Obtener categorías únicas
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))]

  // Productos con stock bajo
  const lowStockProducts = products.filter(p => p.stock <= p.minStock && p.isActive)

  // Valor total del inventario
  const totalInventoryValue = products.reduce((sum, p) => sum + (Number(p.cost) * p.stock), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Productos y Almacén
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Control de inventario y stock
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary"
          >
            <Upload className="w-5 h-5 mr-2" />
            Importar Excel
          </button>
          <button
            onClick={() => {
              setEditingProduct(null)
              setShowModal(true)
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Search */}
        <div className="card">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o marca..."
              className="input pl-10"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="card">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input"
          >
            <option value="all">Todas las categorías</option>
            {categories.filter(c => c !== 'all').map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Total Productos
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {products.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Stock Bajo
          </p>
          <p className="text-2xl font-bold text-orange-500 mt-1">
            {lowStockProducts.length}
          </p>
          {lowStockProducts.length > 0 && (
            <p className="text-xs text-orange-500 mt-1 flex items-center">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Requiere atención
            </p>
          )}
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Valor Inventario
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatCurrency(totalInventoryValue)}
          </p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Productos Activos
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {products.filter(p => p.isActive).length}
          </p>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <div className="card bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-orange-500 mr-3 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                {lowStockProducts.length} productos con stock bajo
              </h3>
              <div className="mt-2 text-sm text-orange-700 dark:text-orange-300">
                {lowStockProducts.slice(0, 3).map(p => (
                  <div key={p.id}>
                    • {p.name} - {p.stock} {p.unit} (mínimo: {p.minStock})
                  </div>
                ))}
                {lowStockProducts.length > 3 && (
                  <div className="mt-1 font-medium">
                    y {lowStockProducts.length - 3} más...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Producto
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  SKU / Barcode
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Categoría
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Stock
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Costo
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Precio
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Estado
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No hay productos registrados
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const isLowStock = product.stock <= product.minStock
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {product.name}
                          </p>
                          {product.brand && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {product.brand}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          <p className="text-gray-900 dark:text-white">{product.sku}</p>
                          {product.barcode && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {product.barcode}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {product.category}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center">
                          <span
                            className={`font-bold ${
                              isLowStock ? 'text-orange-500' : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {product.stock}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {product.unit}
                          </span>
                          {isLowStock && (
                            <span className="text-xs text-orange-500 flex items-center mt-1">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Bajo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-400">
                        {formatCurrency(Number(product.cost))}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                        {formatCurrency(Number(product.price))}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`badge ${
                            product.isActive ? 'badge-success' : 'badge-danger'
                          }`}
                        >
                          {product.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleStockMovement(product)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            title="Ajustar stock"
                          >
                            <Package className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Formulario de Producto */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
        maxWidth="2xl"
      >
        <ProductForm
          product={editingProduct}
          onSuccess={handleFormSuccess}
          onCancel={handleCloseModal}
        />
      </Modal>

      {/* Modal de Movimiento de Stock */}
      <Modal
        isOpen={showStockModal}
        onClose={handleCloseStockModal}
        title="Ajustar Stock"
        maxWidth="md"
      >
        <StockMovementForm
          product={selectedProduct}
          onSuccess={() => {
            handleCloseStockModal()
            fetchProducts()
          }}
          onCancel={handleCloseStockModal}
        />
      </Modal>

      {/* Modal de Importación */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Importar Productos desde Excel"
        maxWidth="xl"
      >
        <ImportProductsModal
          onSuccess={() => {
            setShowImportModal(false)
            fetchProducts()
          }}
          onCancel={() => setShowImportModal(false)}
        />
      </Modal>
    </div>
  )
}

// Componente para ajuste de stock
function StockMovementForm({ product, onSuccess, onCancel }: any) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    type: 'PURCHASE',
    quantity: '',
    reason: '',
    reference: ''
  })

  const movementTypes = [
    { value: 'PURCHASE', label: 'Compra', icon: TrendingUp },
    { value: 'SALE', label: 'Venta', icon: TrendingDown },
    { value: 'ADJUSTMENT', label: 'Ajuste', icon: Package },
    { value: 'RETURN', label: 'Devolución', icon: TrendingUp },
    { value: 'DAMAGED', label: 'Dañado', icon: TrendingDown }
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.quantity || parseInt(formData.quantity) <= 0) {
        toast.error('La cantidad debe ser mayor a 0')
        setLoading(false)
        return
      }

      await api.post(`/products/${product.id}/stock-movements`, {
        type: formData.type,
        quantity: parseInt(formData.quantity),
        reason: formData.reason.trim() || null,
        reference: formData.reference.trim() || null
      })

      toast.success('Movimiento de stock registrado')
      onSuccess()
    } catch (error: any) {
      console.error('Error adding stock movement:', error)
      toast.error(error.response?.data?.error || 'Error al registrar movimiento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-gray-400">Producto</p>
        <p className="text-lg font-medium text-gray-900 dark:text-white">{product?.name}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Stock actual: <span className="font-bold">{product?.stock} {product?.unit}</span>
        </p>
      </div>

      <div>
        <label className="label">Tipo de Movimiento</label>
        <select
          value={formData.type}
          onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
          className="input"
        >
          {movementTypes.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">
          Cantidad <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          value={formData.quantity}
          onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
          className="input"
          placeholder="10"
          min="1"
          required
        />
      </div>

      <div>
        <label className="label">Referencia</label>
        <input
          type="text"
          value={formData.reference}
          onChange={(e) => setFormData(prev => ({ ...prev, reference: e.target.value }))}
          className="input"
          placeholder="Ej: Factura #1234"
        />
      </div>

      <div>
        <label className="label">Motivo</label>
        <textarea
          value={formData.reason}
          onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
          className="input resize-none"
          rows={3}
          placeholder="Descripción del movimiento..."
        />
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Guardando...' : 'Registrar Movimiento'}
        </button>
      </div>
    </form>
  )
}
