import { useState, useEffect, useMemo } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import {
  invalidateAppointmentClientsCache,
  loadAppointmentClients
} from '../utils/appointmentCatalogs'
import { buildSearchTokens, filterRankedItems } from '../utils/searchableOptions'

interface ClientFormProps {
  client?: any
  onSuccess: () => void
  onCancel: () => void
}

const relationshipOptions = [
  'Hijo/a',
  'Padre/Madre',
  'Hermano/a',
  'Primo/a',
  'Pareja',
  'Amigo/a',
  'Otro'
]

const genderOptions = [
  { value: 'HOMBRE', label: 'Hombre' },
  { value: 'MUJER', label: 'Mujer' }
]

const parseDecimalInput = (value: string): number | null => {
  if (!value.trim()) return null
  const normalized = value.replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export default function ClientForm({ client, onSuccess, onCancel }: ClientFormProps) {
  const [loading, setLoading] = useState(false)
  const [linkedClients, setLinkedClients] = useState<any[]>([])
  const [linkedClientSearch, setLinkedClientSearch] = useState('')
  const [formData, setFormData] = useState({
    externalCode: '',
    dni: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    mobilePhone: '',
    landlinePhone: '',
    gender: '',
    birthDate: '',
    registrationDate: '',
    lastVisit: '',
    address: '',
    city: '',
    postalCode: '',
    province: '',
    notes: '',
    allergies: '',
    gifts: '',
    activeTreatmentCount: '',
    activeTreatmentNames: '',
    bondCount: '',
    giftVoucher: '',
    serviceCount: '',
    accountBalance: '',
    billedAmount: '',
    pendingAmount: '',
    debtAlertEnabled: false,
    linkedClientId: '',
    relationshipType: '',
    isActive: true
  })

  useEffect(() => {
    if (client) {
      setFormData({
        externalCode: client.externalCode || '',
        dni: client.dni || '',
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        email: client.email || '',
        phone: client.phone || '',
        mobilePhone: client.mobilePhone || '',
        landlinePhone: client.landlinePhone || '',
        gender: client.gender || '',
        birthDate: client.birthDate ? new Date(client.birthDate).toISOString().split('T')[0] : '',
        registrationDate: client.registrationDate ? new Date(client.registrationDate).toISOString().split('T')[0] : '',
        lastVisit: client.lastVisit ? new Date(client.lastVisit).toISOString().split('T')[0] : '',
        address: client.address || '',
        city: client.city || '',
        postalCode: client.postalCode || '',
        province: client.province || '',
        notes: client.notes || '',
        allergies: client.allergies || '',
        gifts: client.gifts || '',
        activeTreatmentCount: client.activeTreatmentCount?.toString() || '',
        activeTreatmentNames: client.activeTreatmentNames || '',
        bondCount: client.bondCount?.toString() || '',
        giftVoucher: client.giftVoucher || '',
        serviceCount: client.serviceCount?.toString() || '',
        accountBalance: client.accountBalance?.toString() || '',
        billedAmount: client.billedAmount?.toString() || '',
        pendingAmount: client.pendingAmount?.toString() || '',
        debtAlertEnabled: client.debtAlertEnabled ?? false,
        linkedClientId: client.linkedClientId || '',
        relationshipType: client.relationshipType || '',
        isActive: client.isActive ?? true
      })
    }
  }, [client])

  useEffect(() => {
    const fetchLinkedClients = async () => {
      try {
        const allClients = await loadAppointmentClients()
        setLinkedClients(allClients.filter((item: any) => item.id !== client?.id))
      } catch (error) {
        console.error('Error loading clients for linking:', error)
      }
    }

    fetchLinkedClients()
  }, [client?.id])

  const filteredLinkedClients = useMemo(() => {
    return filterRankedItems(linkedClients, linkedClientSearch, (item: any) => {
      const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim()

      return {
        label: fullName,
        labelTokens: buildSearchTokens(fullName),
        searchText: [fullName, item.externalCode, item.phone, item.email].filter(Boolean).join(' ')
      }
    })
  }, [linkedClients, linkedClientSearch])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.firstName.trim()) {
        toast.error('El nombre es requerido')
        setLoading(false)
        return
      }

      if (!formData.lastName.trim()) {
        toast.error('El apellido es requerido')
        setLoading(false)
        return
      }

      if (!formData.gender) {
        toast.error('El sexo es requerido')
        setLoading(false)
        return
      }

      const selectedPhone =
        formData.phone.trim() ||
        formData.mobilePhone.trim() ||
        formData.landlinePhone.trim()

      if (!selectedPhone) {
        toast.error('Debes informar teléfono o móvil')
        setLoading(false)
        return
      }

      const pendingAmount = parseDecimalInput(formData.pendingAmount) || 0
      const billedAmount = parseDecimalInput(formData.billedAmount)
      const accountBalance = parseDecimalInput(formData.accountBalance)
      const birthDateValue = formData.birthDate ? new Date(`${formData.birthDate}T00:00:00`) : null
      const birthMonthName = birthDateValue
        ? birthDateValue.toLocaleDateString('es-ES', { month: 'long' })
        : null
      const normalizedBirthMonthName = birthMonthName
        ? birthMonthName.charAt(0).toUpperCase() + birthMonthName.slice(1)
        : null

      const dataToSend: any = {
        externalCode: formData.externalCode.trim() || null,
        dni: formData.dni.trim() || null,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: selectedPhone,
        mobilePhone: formData.mobilePhone.trim() || null,
        landlinePhone: formData.landlinePhone.trim() || null,
        email: formData.email.trim() || null,
        gender: formData.gender || null,
        birthDate: birthDateValue ? birthDateValue.toISOString() : null,
        birthDay: birthDateValue ? birthDateValue.getDate() : null,
        birthMonthNumber: birthDateValue ? birthDateValue.getMonth() + 1 : null,
        birthMonthName: normalizedBirthMonthName,
        birthYear: birthDateValue ? birthDateValue.getFullYear() : null,
        registrationDate: formData.registrationDate ? new Date(formData.registrationDate).toISOString() : null,
        lastVisit: formData.lastVisit ? new Date(formData.lastVisit).toISOString() : null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        postalCode: formData.postalCode.trim() || null,
        province: formData.province.trim() || null,
        notes: formData.notes.trim() || null,
        allergies: formData.allergies.trim() || null,
        gifts: formData.gifts.trim() || null,
        activeTreatmentCount: formData.activeTreatmentCount
          ? Number.parseInt(formData.activeTreatmentCount, 10)
          : null,
        activeTreatmentNames: formData.activeTreatmentNames.trim() || null,
        bondCount: formData.bondCount ? Number.parseInt(formData.bondCount, 10) : null,
        giftVoucher: formData.giftVoucher.trim() || null,
        serviceCount: formData.serviceCount ? Number.parseInt(formData.serviceCount, 10) : null,
        accountBalance,
        billedAmount,
        totalSpent: billedAmount,
        pendingAmount,
        debtAlertEnabled: formData.debtAlertEnabled,
        linkedClientId: formData.linkedClientId || null,
        relationshipType: formData.relationshipType.trim() || null,
        isActive: formData.isActive
      }

      if (client) {
        await api.put(`/clients/${client.id}`, dataToSend)
        invalidateAppointmentClientsCache()
        toast.success('Cliente actualizado exitosamente')
      } else {
        await api.post('/clients', dataToSend)
        invalidateAppointmentClientsCache()
        toast.success('Cliente creado exitosamente')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving client:', error)
      toast.error(error.response?.data?.error || 'Error al guardar el cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Identificación
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nº Cliente</label>
            <input
              type="text"
              name="externalCode"
              value={formData.externalCode}
              onChange={handleChange}
              className="input"
              placeholder="Ej: 1234"
            />
          </div>
          <div>
            <label className="label">DNI</label>
            <input
              type="text"
              name="dni"
              value={formData.dni}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">
              Apellidos <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Contacto
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Teléfono principal</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="input"
              placeholder="Se usará móvil o fijo si queda vacío"
            />
          </div>
          <div>
            <label className="label">Móvil</label>
            <input
              type="tel"
              name="mobilePhone"
              value={formData.mobilePhone}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">Teléfono fijo</label>
            <input
              type="tel"
              name="landlinePhone"
              value={formData.landlinePhone}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Perfil
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">
              Sexo <span className="text-red-500">*</span>
            </label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Selecciona sexo</option>
              {genderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fecha nacimiento</label>
            <input
              type="date"
              name="birthDate"
              value={formData.birthDate}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">Fecha de alta</label>
            <input
              type="date"
              name="registrationDate"
              value={formData.registrationDate}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">Última visita</label>
            <input
              type="date"
              name="lastVisit"
              value={formData.lastVisit}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Dirección
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">Dirección</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Ciudad</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">CP</label>
              <input
                type="text"
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">Provincia</label>
              <input
                type="text"
                name="province"
                value={formData.province}
                onChange={handleChange}
                className="input"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Tratamientos y Bonos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nº tratamientos activos</label>
            <input
              type="number"
              name="activeTreatmentCount"
              value={formData.activeTreatmentCount}
              onChange={handleChange}
              className="input"
              min="0"
            />
          </div>
          <div>
            <label className="label">Nº abonos</label>
            <input
              type="number"
              name="bondCount"
              value={formData.bondCount}
              onChange={handleChange}
              className="input"
              min="0"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Tratamientos activos</label>
            <textarea
              name="activeTreatmentNames"
              value={formData.activeTreatmentNames}
              onChange={handleChange}
              className="input resize-none"
              rows={2}
              placeholder="Puede incluir varios separados por coma"
            />
          </div>
          <div>
            <label className="label">Cheque regalo</label>
            <input
              type="text"
              name="giftVoucher"
              value={formData.giftVoucher}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">Obsequios</label>
            <input
              type="text"
              name="gifts"
              value={formData.gifts}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Facturación y deuda
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Cantidad de servicios</label>
            <input
              type="number"
              name="serviceCount"
              value={formData.serviceCount}
              onChange={handleChange}
              className="input"
              min="0"
            />
          </div>
          <div>
            <label className="label">Importe facturado (€)</label>
            <input
              type="text"
              name="billedAmount"
              value={formData.billedAmount}
              onChange={handleChange}
              className="input"
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="label">Importe pendiente (€)</label>
            <input
              type="text"
              name="pendingAmount"
              value={formData.pendingAmount}
              onChange={handleChange}
              className="input"
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="label">Saldo a cuenta (€)</label>
            <input
              type="text"
              name="accountBalance"
              value={formData.accountBalance}
              onChange={handleChange}
              className="input"
              placeholder="0,00"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
            <input
              type="checkbox"
              name="debtAlertEnabled"
              checked={formData.debtAlertEnabled}
              onChange={handleChange}
              className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
            />
            Avisar con alerta cuando tenga importe pendiente
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Enlazar cliente
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Buscar cliente</label>
            <input
              type="text"
              value={linkedClientSearch}
              onChange={(e) => setLinkedClientSearch(e.target.value)}
              className="input mb-3"
              placeholder="Nombre, código o teléfono..."
            />
            <label className="label">Cliente vinculado</label>
            <select
              name="linkedClientId"
              value={formData.linkedClientId}
              onChange={handleChange}
              className="input"
            >
              <option value="">Sin vincular</option>
              {filteredLinkedClients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.firstName} {item.lastName}
                  {item.externalCode ? ` (#${item.externalCode})` : ''}
                </option>
              ))}
            </select>
            {linkedClientSearch.trim() && filteredLinkedClients.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                No se encontraron clientes con ese criterio.
              </p>
            )}
          </div>
          <div>
            <label className="label">Tipo de relación</label>
            <select
              name="relationshipType"
              value={formData.relationshipType}
              onChange={handleChange}
              className="input"
            >
              <option value="">Sin especificar</option>
              {relationshipOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="label">Alergias</label>
        <textarea
          name="allergies"
          value={formData.allergies}
          onChange={handleChange}
          className="input resize-none"
          rows={2}
          placeholder="Ej: Látex, Parabenos, Níquel..."
        />
      </div>

      <div>
        <label className="label">Notas</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          className="input resize-none"
          rows={3}
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="isActive"
          name="isActive"
          checked={formData.isActive}
          onChange={handleChange}
          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="isActive" className="ml-2 text-sm text-gray-900 dark:text-white">
          Cliente activo
        </label>
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          <X className="w-4 h-4 mr-2" />
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Guardando...' : client ? 'Actualizar' : 'Crear Cliente'}
        </button>
      </div>
    </form>
  )
}
