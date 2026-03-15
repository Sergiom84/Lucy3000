import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Link2,
  Mail,
  Phone,
  Plus,
  Receipt,
  Search,
  Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import ClientCalendarDock from '../components/ClientCalendarDock'
import ClientForm from '../components/ClientForm'
import Modal from '../components/Modal'
import api from '../utils/api'
import { getPrintTicketSuccessMessage, printTicket } from '../utils/desktop'
import { formatCurrency, formatDate, formatPhone } from '../utils/format'
import { buildSaleTicketPayload, paymentMethodLabel } from '../utils/tickets'

const PAGE_SIZE = 50

type ClientListPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

type ClientListSummary = {
  total: number
  active: number
  debtAlerts: number
}

export default function Clients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState<ClientListPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1
  })
  const [summary, setSummary] = useState<ClientListSummary>({
    total: 0,
    active: 0,
    debtAlerts: 0
  })
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<any>(null)
  const [billingModalClient, setBillingModalClient] = useState<any>(null)
  const [clientSales, setClientSales] = useState<any[]>([])
  const [billingLoading, setBillingLoading] = useState(false)
  const [showCalendarDock, setShowCalendarDock] = useState(false)
  const [highlightedClientId, setHighlightedClientId] = useState<string | null>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCurrentPage(1)
      setDebouncedSearch(search.trim())
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [search])

  useEffect(() => {
    void fetchClients(currentPage, debouncedSearch)
  }, [currentPage, debouncedSearch])

  const fetchClients = async (page = currentPage, searchTerm = debouncedSearch) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        paginated: 'true',
        includeCounts: 'true',
        page: String(page),
        limit: String(PAGE_SIZE)
      })

      if (searchTerm) {
        params.set('search', searchTerm)
      }

      const response = await api.get(`/clients?${params.toString()}`)
      const payload = response.data

      setClients(Array.isArray(payload?.data) ? payload.data : [])
      setPagination(
        payload?.pagination || {
          page,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 1
        }
      )
      setSummary(
        payload?.summary || {
          total: 0,
          active: 0,
          debtAlerts: 0
        }
      )

      if (payload?.pagination?.totalPages && page > payload.pagination.totalPages) {
        setCurrentPage(payload.pagination.totalPages)
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
      toast.error('Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) return

    try {
      await api.delete(`/clients/${id}`)
      toast.success('Cliente eliminado')
      void fetchClients(currentPage, debouncedSearch)
    } catch (error) {
      toast.error('Error al eliminar cliente')
    }
  }

  const handleEdit = (client: any) => {
    setEditingClient(client)
    setShowModal(true)
  }

  const handleView = (id: string) => {
    navigate(`/clients/${id}`)
  }

  const handleViewBilling = async (client: any) => {
    try {
      setBillingLoading(true)
      const response = await api.get(`/sales?clientId=${client.id}`)
      setBillingModalClient(client)
      setClientSales(response.data)
    } catch (error) {
      toast.error('No se pudo cargar la facturación del cliente')
    } finally {
      setBillingLoading(false)
    }
  }

  const handlePrintSale = async (saleId: string) => {
    try {
      const response = await api.get(`/sales/${saleId}`)
      const printResult = await printTicket(buildSaleTicketPayload(response.data))
      toast.success(getPrintTicketSuccessMessage(printResult))
    } catch (error: any) {
      toast.error(error.message || 'No se pudo imprimir el ticket')
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingClient(null)
  }

  const handleFormSuccess = () => {
    handleCloseModal()
    void fetchClients(currentPage, debouncedSearch)
  }

  const handleViewClientCalendar = (clientId: string) => {
    setHighlightedClientId(clientId)
    setShowCalendarDock(true)
  }

  const handleCloseCalendarDock = () => {
    setShowCalendarDock(false)
    setHighlightedClientId(null)
  }

  const showingFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const showingTo = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div
        className={`grid gap-6 transition-all duration-300 ${
          showCalendarDock
            ? 'xl:grid-cols-[minmax(0,1fr)_42rem] 2xl:grid-cols-[minmax(0,1fr)_48rem]'
            : 'grid-cols-1'
        }`}
      >
        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Clientes</h1>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                Gestiona tu base de clientes y abre la agenda sin salir de esta pantalla.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowCalendarDock((current) => !current)}
                className="btn btn-secondary"
              >
                {showCalendarDock ? (
                  <>
                    <ChevronRight className="mr-2 h-4 w-4" />
                    Ocultar agenda
                  </>
                ) : (
                  <>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Mostrar agenda
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setEditingClient(null)
                  setShowModal(true)
                }}
                className="btn btn-primary"
              >
                <Plus className="mr-2 h-5 w-5" />
                Nuevo Cliente
              </button>
            </div>
          </div>

          <div className="card">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, email o teléfono..."
                className="input pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="card">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Clientes</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-600 dark:text-gray-400">Clientes Activos</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{summary.active}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-600 dark:text-gray-400">Alertas de Deuda</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{summary.debtAlerts}</p>
            </div>
          </div>

          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Contacto
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Relación
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Cumpleaños
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                      Facturado
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                      Pendiente
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500 dark:text-gray-400">
                        {debouncedSearch ? 'No se encontraron clientes para esta búsqueda' : 'No hay clientes registrados'}
                      </td>
                    </tr>
                  ) : (
                    clients.map((client) => (
                      <tr
                        key={client.id}
                        className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          highlightedClientId === client.id ? 'bg-cyan-50 dark:bg-cyan-900/20' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {client.firstName} {client.lastName}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              {client.externalCode && <span>#{client.externalCode}</span>}
                              <span>{client._count?.appointments ?? 0} citas • {client._count?.sales ?? 0} ventas</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {client.phone && (
                              <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                                <Phone className="mr-1 h-3 w-3" />
                                {formatPhone(client.phone)}
                              </div>
                            )}
                            {client.email && (
                              <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                                <Mail className="mr-1 h-3 w-3" />
                                {client.email}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {client.relationshipType ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center">
                                <Link2 className="mr-1 h-3 w-3" />
                                {client.relationshipType}
                              </span>
                              {client.linkedClient && (
                                <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  con {client.linkedClient.firstName} {client.linkedClient.lastName}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {client.birthDate ? (
                            <div className="flex items-center">
                              <Calendar className="mr-1 h-4 w-4" />
                              {formatDate(client.birthDate)}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">
                          <div className="inline-flex items-center gap-2">
                            <span>{formatCurrency(client.totalSpent)}</span>
                            <button
                              onClick={() => handleViewBilling(client)}
                              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                              title="Ver detalle facturado"
                            >
                              <Eye className="h-4 w-4 text-primary-600" />
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          {Number(client.pendingAmount || 0) > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="badge badge-danger">
                                {formatCurrency(client.pendingAmount)}
                              </span>
                              {client.debtAlertEnabled && (
                                <span className="inline-flex items-center text-xs text-red-600">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Alerta
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${client.isActive ? 'badge-success' : 'badge-danger'}`}>
                            {client.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleViewClientCalendar(client.id)}
                              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                              title="Ver citas en calendario"
                            >
                              <Calendar className="h-4 w-4 text-primary-600" />
                            </button>
                            <button
                              onClick={() => handleView(client.id)}
                              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                              title="Ver detalles"
                            >
                              <Eye className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleEdit(client)}
                              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                              title="Editar"
                            >
                              <Edit className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleDelete(client.id)}
                              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Mostrando {showingFrom} - {showingTo} de {pagination.total}
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={pagination.page <= 1}
                  className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Anterior
                </button>
                <span className="text-xs sm:text-sm">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                  <ChevronRight className="ml-1 h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {showCalendarDock && (
          <ClientCalendarDock
            onClose={handleCloseCalendarDock}
            selectedClientId={highlightedClientId}
          />
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
        maxWidth="2xl"
      >
        <ClientForm
          client={editingClient}
          onSuccess={handleFormSuccess}
          onCancel={handleCloseModal}
        />
      </Modal>

      <Modal
        isOpen={!!billingModalClient}
        onClose={() => {
          setBillingModalClient(null)
          setClientSales([])
        }}
        title={
          billingModalClient
            ? `Facturación de ${billingModalClient.firstName} ${billingModalClient.lastName}`
            : 'Facturación'
        }
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total facturado:{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(clientSales.reduce((sum, sale) => sum + Number(sale.total), 0))}
              </span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{clientSales.length} ventas</p>
          </div>

          {billingLoading ? (
            <div className="py-10 text-center text-gray-500 dark:text-gray-400">
              Cargando facturación...
            </div>
          ) : clientSales.length === 0 ? (
            <div className="py-10 text-center text-gray-500 dark:text-gray-400">
              No hay ventas registradas para este cliente.
            </div>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Fecha</th>
                    <th>Pago</th>
                    <th>Total</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clientSales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="font-mono text-sm">{sale.saleNumber}</td>
                      <td>{formatDate(sale.date)}</td>
                      <td>{paymentMethodLabel(sale.paymentMethod)}</td>
                      <td className="font-semibold">{formatCurrency(Number(sale.total))}</td>
                      <td>
                        <button onClick={() => handlePrintSale(sale.id)} className="btn btn-sm btn-secondary">
                          <Receipt className="mr-2 h-4 w-4" />
                          Ticket
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
