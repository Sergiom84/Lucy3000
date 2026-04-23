import { AlertTriangle, Cake, Mail, MapPin, Phone } from 'lucide-react'
import { formatCurrency, formatDate, formatPhone, getInitials } from '../../../utils/format'
import type { ClientDetailClient } from '../types'

type ClientDetailProfileCardProps = {
  client: ClientDetailClient
  pendingTotal: number
  profileImageUrl: string | null
}

export default function ClientDetailProfileCard({
  client,
  pendingTotal,
  profileImageUrl
}: ClientDetailProfileCardProps) {
  const fullName = `${client.firstName} ${client.lastName}`.trim()

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-shrink-0 flex justify-center sm:justify-start">
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt={fullName}
              className="w-24 h-24 rounded-full object-cover ring-4 ring-primary-100 dark:ring-primary-900"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center ring-4 ring-primary-100 dark:ring-primary-900">
              <span className="text-3xl font-bold text-white">{getInitials(fullName)}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {client.firstName} {client.lastName}
            </h2>
            <span className={`badge ${client.isActive ? 'badge-success' : 'badge-danger'}`}>
              {client.isActive ? 'Activo' : 'Inactivo'}
            </span>
            {client.externalCode && (
              <span className="text-sm text-gray-500 dark:text-gray-400">#{client.externalCode}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
            {client.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {formatPhone(client.phone)}
              </span>
            )}
            {client.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" />
                {client.email}
              </span>
            )}
            {client.birthDate && (
              <span className="inline-flex items-center gap-1">
                <Cake className="w-3.5 h-3.5" />
                {formatDate(client.birthDate)}
              </span>
            )}
            {(client.address || client.city) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {[client.address, client.city, client.postalCode].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          <div
            className={`mb-3 rounded-xl border px-4 py-3 ${
              client.allergies
                ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  client.allergies
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                    client.allergies ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Alergias
                </p>
                <p
                  className={`mt-1 text-sm whitespace-pre-wrap ${
                    client.allergies ? 'text-red-700 dark:text-red-200' : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {client.allergies || 'Sin alergias registradas'}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Gastado</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(Number(client.totalSpent || 0))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Puntos</p>
                <p className="text-lg font-bold text-purple-600">{client.loyaltyPoints || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Citas</p>
                <p className="text-lg font-bold text-blue-600">{client.appointments?.length || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Ventas</p>
                <p className="text-lg font-bold text-orange-600">{client.sales?.length || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Abono</p>
                <p className="text-lg font-bold text-amber-600">
                  {formatCurrency(Number(client.accountBalance || 0))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Pendiente</p>
                <p className={`text-lg font-bold ${pendingTotal > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                  {formatCurrency(pendingTotal)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
