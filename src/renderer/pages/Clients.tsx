import { Suspense, lazy, useEffect, useState } from 'react'
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
  Receipt,
  Search,
  Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import ClientForm from '../components/ClientForm'
import Modal from '../components/Modal'
import api from '../utils/api'
import { getPrintTicketSuccessMessage, printTicket } from '../utils/desktop'
import { exportClientsWorkbook } from '../utils/exports'
import { formatCurrency, formatDate, formatPhone } from '../utils/format'
import { invalidateAppointmentClientsCache } from '../utils/appointmentCatalogs'
import { buildSaleTicketPayload, salePaymentMethodLabel } from '../utils/tickets'
import { useAuthStore } from '../stores/authStore'

const PAGE_SIZE = 50
const ClientCalendarDock = lazy(() => import('../components/ClientCalendarDock'))
const ImportClientsModal = lazy(() => import('../components/ImportClientsModal'))
const CLIENT_SORT_OPTIONS = [
  { value: 'lastVisit', label: 'Última visita' },
  { value: 'name', label: 'Cliente' },
  { value: 'clientNumber', label: 'Nº cliente' },
  { value: 'totalSpent', label: 'Facturado' },
  { value: 'pendingAmount', label: 'Pendiente' }
] as const

type ClientSortBy = (typeof CLIENT_SORT_OPTIONS)[number]['value']
type ClientSortDirection = 'asc' | 'desc'

type ClientListPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

type ClientListSummary = {
  total: number
  debtAlerts: number
}

function LazyPanelLoader() {
  return <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando agenda...</div>
}

export default function Clients() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<ClientSortBy>('lastVisit')
  const [sortDirection, setSortDirection] = useState<ClientSortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState<ClientListPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1
  })
  const [summary, setSummary] = useState<ClientListSummary>({
    total: 0,
    debtAlerts: 0
  })
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingClient, setEditingClient] = useState<any>(null)
  const [billingModalClient, setBillingModalClient] = useState<any>(null)
  const [clientSales, setClientSales] = useState<any[]>([])
  const [billingLoading, setBillingLoading] = useState(false)
  const [showCalendarDock, setShowCalendarDock] = useState(false)
  const [highlightedClientId, setHighlightedClientId] = useState<string | null>(null)
  const [selectedCalendarClientName, setSelectedCalendarClientName] = useState<string | null>(null)
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const isAdmin = user?.role === 'ADMIN'
  const compactFilters = showCalendarDock

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
    void fetchClients(currentPage, debouncedSearch, sortBy, sortDirection, showPendingOnly)
  }, [currentPage, debouncedSearch, sortBy, sortDirection, showPendingOnly])

  const fetchClients = async (
    page = currentPage,
    searchTerm = debouncedSearch,
    requestedSortBy = sortBy,
    requestedSortDirection = sortDirection,
    pendingOnly = showPendingOnly
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        paginated: 'true',
        includeCounts: 'true',
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy: requestedSortBy,
        sortDirection: requestedSortDirection,
        pendingOnly: String(pendingOnly)
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
      setHasLoadedOnce(true)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) return

    try {
      await api.delete(`/clients/${id}`)
      invalidateAppointmentClientsCache()
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

  const handleViewClientCalendar = (client: any) => {
    const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Cliente'
    setShowPendingOnly(false)
    setHighlightedClientId(client.id)
    setSelectedCalendarClientName(clientName)
    setShowCalendarDock(true)
  }

  const handleExportClients = async () => {
    try {
      const params = new URLSearchParams({
        includeCounts: 'false',
        sortBy,
        sortDirection,
        pendingOnly: String(showPendingOnly)
      })

      if (debouncedSearch) {
        params.set('search', debouncedSearch)
      }

      const response = await api.get(`/clients?${params.toString()}`)
      const rows = Array.isArray(response.data) ? response.data : []

      if (rows.length === 0) {
        toast.error('No hay clientes para exportar con el filtro actual')
        return
      }

      await exportClientsWorkbook(rows)
      toast.success('Clientes exportados a Excel')
    } catch (error) {
      console.error('Clients export error:', error)
      toast.error('No se pudo exportar el listado de clientes')
    }
  }

  const handleCloseCalendarDock = () => {
    setShowCalendarDock(false)
    setHighlightedClientId(null)
    setSelectedCalendarClientName(null)
  }

  const handleTogglePendingOnly = () => {
    if (showCalendarDock) return
    setCurrentPage(1)
    setShowPendingOnly((current) => !current)
  }

  const showingFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const showingTo = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total)
  const emptyStateMessage = showPendingOnly
    ? debouncedSearch
      ? 'No se encontraron clientes pendientes para esta búsqueda'
      : 'No hay clientes con pagos pendientes'
    : debouncedSearch
      ? 'No se encontraron clientes para esta búsqueda'
      : 'No hay clientes registrados'
  const pendingCardClassName = `card text-left transition-all ${
    showCalendarDock
      ? 'cursor-default border-l-4 border-l-rose-300 bg-rose-50/70 shadow-[inset_6px_0_18px_-12px_rgba(251,113,133,0.85)] dark:border-l-rose-400 dark:bg-rose-950/20'
      : showPendingOnly
        ? 'cursor-pointer border-l-4 border-l-rose-500 border-rose-200 bg-rose-50/80 shadow-[inset_6px_0_18px_-12px_rgba(244,63,94,0.95),0_8px_24px_-12px_rgba(244,63,94,0.28)] hover:border-rose-300 hover:shadow-[inset_6px_0_18px_-12px_rgba(244,63,94,0.95),0_12px_28px_-16px_rgba(244,63,94,0.32)] dark:border-l-rose-400 dark:border-rose-900 dark:bg-rose-950/20'
        : 'cursor-pointer border-l-4 border-l-rose-300 bg-rose-50/70 shadow-[inset_6px_0_18px_-12px_rgba(251,113,133,0.85)] hover:border-rose-200 hover:shadow-[inset_6px_0_18px_-12px_rgba(251,113,133,0.92),0_8px_24px_-12px_rgba(251,113,133,0.24)] dark:border-l-rose-400 dark:bg-rose-950/20'
  }`

  if (loading && !hasLoadedOnce) {
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
            ? 'grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_44rem]'
            : 'grid-cols-1'
        }`}
      >
        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Clientes</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  if (showCalendarDock) {
                    handleCloseCalendarDock()
                    return
                  }

                  setShowPendingOnly(false)
                  setShowCalendarDock(true)
                }}
                className="btn btn-secondary"
              >
                {showCalendarDock ? 'Ocultar agenda' : 'Mostrar agenda'}
              </button>

              {isAdmin ? (
                <>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="btn btn-secondary"
                  >
                    Importar
                  </button>

                  <button
                    onClick={() => void handleExportClients()}
                    className="btn btn-secondary"
                  >
                    Exportar
                  </button>
                </>
              ) : null}

              <button
                onClick={() => {
                  setEditingClient(null)
                  setShowModal(true)
                }}
                className="btn btn-primary"
              >
                Nuevo Cliente
              </button>
            </div>
          </div>

          <div className="card">
            <div
              className={`flex flex-col gap-4 ${
                compactFilters ? '' : 'xl:flex-row xl:items-end'
              }`}
            >
              <div className={`relative ${compactFilters ? 'w-full' : 'flex-1'}`}>
                <Search
                  className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${
                    compactFilters ? 'text-primary-500' : 'text-gray-400'
                  }`}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, email o teléfono..."
                  className={`input h-12 pl-12 ${compactFilters ? 'text-base' : ''}`}
                />
              </div>

              <div
                className={`grid gap-3 ${
                  compactFilters ? 'w-full sm:max-w-[24rem] sm:grid-cols-2' : 'sm:grid-cols-2 xl:w-auto'
                }`}
              >
                <div className={compactFilters ? 'min-w-0' : 'min-w-[180px]'}>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {compactFilters ? 'Orden' : 'Ordenar por'}
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const nextSortBy = e.target.value as ClientSortBy
                      const nextSortDirection: ClientSortDirection =
                        nextSortBy === 'name' || nextSortBy === 'clientNumber' ? 'asc' : 'desc'
                      setSortBy(nextSortBy)
                      setSortDirection(nextSortDirection)
                      setCurrentPage(1)
                    }}
                    className={`input ${compactFilters ? 'h-11 text-sm' : ''}`}
                  >
                    {CLIENT_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={compactFilters ? 'min-w-0' : 'min-w-[160px]'}>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Sentido
                  </label>
                  <select
                    value={sortDirection}
                    onChange={(e) => {
                      setSortDirection(e.target.value as ClientSortDirection)
                      setCurrentPage(1)
                    }}
                    className={`input ${compactFilters ? 'h-11 text-sm' : ''}`}
                  >
                    <option value="desc">Descendente</option>
                    <option value="asc">Ascendente</option>
                  </select>
                </div>
              </div>
            </div>

            {loading && hasLoadedOnce ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Actualizando listado...
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="card">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Clientes</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
            </div>
            <button
              type="button"
              onClick={handleTogglePendingOnly}
              disabled={showCalendarDock}
              className={pendingCardClassName}
              title={
                showCalendarDock
                  ? 'Disponible solo en la vista completa'
                  : showPendingOnly
                    ? 'Mostrar todos los clientes'
                    : 'Mostrar clientes pendientes de pago'
              }
            >
              <p className="text-sm text-gray-600 dark:text-gray-400">Pendiente</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{summary.debtAlerts}</p>
              {!showCalendarDock ? (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {showPendingOnly ? 'Mostrando solo clientes pendientes' : 'Pulsa para ver pendientes'}
                </p>
              ) : null}
            </button>
          </div>

          <div className="card">
            {showPendingOnly && !showCalendarDock ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Mostrando solo clientes con pagos pendientes
                </p>
                <button
                  type="button"
                  onClick={handleTogglePendingOnly}
                  className="btn btn-secondary btn-sm"
                >
                  Mostrar todos
                </button>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Nº Cliente
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Contacto
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Relación
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Última visita
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
                      <td colSpan={9} className="py-8 text-center text-gray-500 dark:text-gray-400">
                        {emptyStateMessage}
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
                          {showCalendarDock ? (
                            <button
                              type="button"
                              onClick={() => handleViewClientCalendar(client)}
                              className="block w-full rounded-lg p-2 text-left transition hover:bg-cyan-50 dark:hover:bg-cyan-900/20"
                              title="Filtrar agenda por este cliente"
                            >
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {client.firstName} {client.lastName}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{client._count?.appointments ?? 0} citas • {client._count?.sales ?? 0} ventas</span>
                              </div>
                            </button>
                          ) : (
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {client.firstName} {client.lastName}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{client._count?.appointments ?? 0} citas • {client._count?.sales ?? 0} ventas</span>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {client.externalCode ? `#${client.externalCode}` : '-'}
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
                          {client.effectiveLastVisit ? (
                            <span>{formatDate(client.effectiveLastVisit)}</span>
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
                              onClick={() => handleViewClientCalendar(client)}
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
          <Suspense fallback={<LazyPanelLoader />}>
            <ClientCalendarDock
              onClose={handleCloseCalendarDock}
              selectedClientId={highlightedClientId}
              selectedClientName={selectedCalendarClientName}
            />
          </Suspense>
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

      {isAdmin ? (
        <Modal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="Importar Clientes desde Excel"
          maxWidth="xl"
        >
          {showImportModal ? (
            <Suspense fallback={<LazyPanelLoader />}>
              <ImportClientsModal
                onSuccess={() => {
                  setShowImportModal(false)
                  void fetchClients(currentPage, debouncedSearch)
                }}
                onCancel={() => setShowImportModal(false)}
              />
            </Suspense>
          ) : null}
        </Modal>
      ) : null}

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
                      <td>{salePaymentMethodLabel(sale)}</td>
                      <td className="font-semibold">{formatCurrency(Number(sale.total))}</td>
                      <td>
                        {sale.status !== 'PENDING' ? (
                          <button onClick={() => handlePrintSale(sale.id)} className="btn btn-sm btn-secondary">
                            <Receipt className="mr-2 h-4 w-4" />
                            Ticket
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
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
