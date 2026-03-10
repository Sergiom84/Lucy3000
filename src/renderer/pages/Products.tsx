import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Edit, Trash2, Package, AlertTriangle, TrendingUp, TrendingDown, Upload, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../utils/api'
import { formatCurrency } from '../utils/format'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ProductForm from '../components/ProductForm'
import ImportProductsModal from '../components/ImportProductsModal'

const formatFamilyLabel = (value: string): string =>
  value
    .toLowerCase()
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

type ViewMode = 'all' | 'lowStock' | null

export default function Products() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(null)
  const [showFamilies, setShowFamilies] = useState(false)
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

  const lowStockProducts = useMemo(
    () => products.filter(p => p.stock <= p.minStock && p.isActive),
    [products]
  )

  const activeCount = useMemo(
    () => products.filter(p => p.isActive).length,
    [products]
  )

  const familyCards = useMemo(() => {
    const grouped = products.reduce<Record<string, number>>((acc, product) => {
      const family = String(product.category || '').trim() || 'Sin categoría'
      acc[family] = (acc[family] || 0) + 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([family, total]) => ({
        family,
        label: formatFamilyLabel(family),
        total
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [products])

  const filteredProducts = useMemo(() => {
    const searchLower = search.toLowerCase().trim()

    // If search has text, filter all products by search (+ optional family filter)
    if (searchLower) {
      return products
        .filter((product) => {
          const matchesSearch =
            String(product.name || '').toLowerCase().includes(searchLower) ||
            String(product.sku || '').toLowerCase().includes(searchLower) ||
            String(product.brand || '').toLowerCase().includes(searchLower) ||
            String(product.category || '').toLowerCase().includes(searchLower)
          const matchesFamily = selectedFamily
            ? String(product.category || '') === selectedFamily
            : true
          return matchesSearch && matchesFamily
        })
        .sort((a, b) => String(a.sku || '').localeCompare(b.sku || ''))
    }

    // viewMode takes priority over family
    if (viewMode === 'all') {
      const base = selectedFamily
        ? products.filter(p => String(p.category || '') === selectedFamily)
        : products
      return [...base].sort((a, b) => String(a.sku || '').localeCompare(b.sku || ''))
    }

    if (viewMode === 'lowStock') {
      const base = selectedFamily
        ? lowStockProducts.filter(p => String(p.category || '') === selectedFamily)
        : lowStockProducts
      return [...base].sort((a, b) => String(a.sku || '').localeCompare(b.sku || ''))
    }

    // Family-only filter
    if (selectedFamily) {
      return products
        .filter(p => String(p.category || '') === selectedFamily)
        .sort((a, b) => String(a.sku || '').localeCompare(b.sku || ''))
    }

    // Nothing active
    return []
  }, [products, search, selectedFamily, viewMode, lowStockProducts])

  const hasActiveFilter = search.trim() !== '' || viewMode !== null || selectedFamily !== null

  // Table title
  const tableTitle = useMemo(() => {
    if (search.trim()) return 'Resultados de búsqueda'
    if (viewMode === 'all') return selectedFamily ? `Todos: ${formatFamilyLabel(selectedFamily)}` : 'Todos los productos'
    if (viewMode === 'lowStock') return selectedFamily ? `Stock bajo: ${formatFamilyLabel(selectedFamily)}` : 'Productos con stock bajo'
    if (selectedFamily) return `Familia: ${formatFamilyLabel(selectedFamily)}`
    return ''
  }, [search, viewMode, selectedFamily])

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(prev => prev === mode ? null : mode)
  }

  const handleSelectFamily = (family: string) => {
    setSelectedFamily(prev => prev === family ? null : family)
  }

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

      {/* Search - always enabled */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, marca, familia o descripción..."
            className="input pl-10"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Productos - clickable */}
        <button
          type="button"
          onClick={() => handleViewMode('all')}
          className={`card text-left transition-all border ${
            viewMode === 'all'
              ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
              : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
          }`}
        >
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
        </button>

        {/* Stock Bajo - clickable */}
        <button
          type="button"
          onClick={() => handleViewMode('lowStock')}
          className={`card text-left transition-all border ${
            viewMode === 'lowStock'
              ? 'border-orange-500 ring-2 ring-orange-200 dark:ring-orange-800'
              : 'border-gray-200 dark:border-gray-700 hover:border-orange-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
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
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>
        </button>

        {/* Productos Activos - not clickable */}
        <div className="card border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Productos Activos
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {activeCount}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible family section */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowFamilies(prev => !prev)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          {showFamilies ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          {showFamilies ? 'Ocultar familias' : 'Mostrar familias'}
          {selectedFamily && (
            <span className="ml-2 text-xs px-2 py-0.5 bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 rounded-full">
              {formatFamilyLabel(selectedFamily)}
            </span>
          )}
        </button>

        {showFamilies && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {familyCards.map((item) => (
              <button
                key={item.family}
                type="button"
                onClick={() => handleSelectFamily(item.family)}
                className={`text-left card transition-all border ${
                  selectedFamily === item.family
                    ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{item.label}</p>
                  <Package className="w-4 h-4 text-primary-600" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {item.total} productos
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products Table */}
      {!hasActiveFilter ? (
        <div className="card">
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">
            Usa el buscador o pulsa una tarjeta para ver productos
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {tableTitle}
            </h3>
            <span className="badge badge-secondary">{filteredProducts.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    ID
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Marca
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Familia
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Descripción
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Cantidad
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    PVP
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
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
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                          {product.sku}
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-gray-900 dark:text-white">{product.brand || '-'}</p>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {product.category}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                          {product.name}
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
                            {isLowStock && (
                              <span className="text-xs text-orange-500 flex items-center mt-1">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Bajo
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(Number(product.price))}
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
      )}

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
      const parsedQuantity = parseInt(formData.quantity, 10)

      if (!Number.isInteger(parsedQuantity) || parsedQuantity === 0) {
        toast.error('La cantidad debe ser un número entero distinto de 0')
        setLoading(false)
        return
      }

      if (formData.type !== 'ADJUSTMENT' && parsedQuantity < 0) {
        toast.error('La cantidad debe ser positiva para este tipo de movimiento')
        setLoading(false)
        return
      }

      await api.post(`/products/${product.id}/stock-movements`, {
        type: formData.type,
        quantity: parsedQuantity,
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
          placeholder={formData.type === 'ADJUSTMENT' ? '-5 o 5' : '10'}
          min={formData.type === 'ADJUSTMENT' ? undefined : '1'}
          required
        />
        {formData.type === 'ADJUSTMENT' && (
          <p className="text-xs text-gray-500 mt-1">
            Usa negativo para disminuir stock y positivo para aumentarlo.
          </p>
        )}
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
