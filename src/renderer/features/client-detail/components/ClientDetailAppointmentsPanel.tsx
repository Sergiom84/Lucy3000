import type { ReactNode } from 'react'
import { Calendar } from 'lucide-react'
import { formatDate } from '../../../utils/format'
import type { ClientDetailAppointment } from '../types'

type ClientDetailAppointmentsPanelProps = {
  formatAppointmentCabin: (cabin: string | null | undefined) => string
  getAppointmentDisplayStatus: (appointment: ClientDetailAppointment) => string
  getAppointmentStatusBadgeClassName: (status: string) => string
  getAppointmentStatusLabel: (status: string) => string
  remainingAppointments: ClientDetailAppointment[]
  renderAppointmentActions: (appointment: ClientDetailAppointment) => ReactNode
  upcomingAppointments: ClientDetailAppointment[]
}

export default function ClientDetailAppointmentsPanel({
  formatAppointmentCabin,
  getAppointmentDisplayStatus,
  getAppointmentStatusBadgeClassName,
  getAppointmentStatusLabel,
  remainingAppointments,
  renderAppointmentActions,
  upcomingAppointments
}: ClientDetailAppointmentsPanelProps) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Citas</h3>
      <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">Próximas citas</p>
        {upcomingAppointments.length > 0 ? (
          <div className="space-y-2">
            {upcomingAppointments.map((appointment, index) => {
              const displayStatus = getAppointmentDisplayStatus(appointment)

              return (
                <div
                  key={`upcoming-${appointment.id}`}
                  className="rounded-md bg-white/80 px-4 py-3 dark:bg-gray-900/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {index === 0 ? 'Próxima:' : 'Siguiente:'} {appointment.service?.name || 'Servicio'}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {formatAppointmentCabin(appointment.cabin)} · {appointment.user?.name || 'Sin profesional'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                      <p className="text-sm text-blue-900 dark:text-blue-200">
                        {formatDate(appointment.date)}
                        <span className="text-blue-300 dark:text-blue-700"> · </span>
                        {appointment.startTime} - {appointment.endTime}
                      </p>
                      <span className={`badge ${getAppointmentStatusBadgeClassName(displayStatus)}`}>
                        {getAppointmentStatusLabel(displayStatus)}
                      </span>
                      {renderAppointmentActions(appointment)}
                    </div>
                  </div>
                  {appointment.notes && (
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{appointment.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-blue-800 dark:text-blue-300">No hay próximas citas registradas.</p>
        )}
      </div>

      {remainingAppointments.length > 0 ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Resto de citas</p>
          </div>
          <div className="space-y-3">
            {remainingAppointments.map((appointment) => {
              const displayStatus = getAppointmentDisplayStatus(appointment)

              return (
                <div
                  key={appointment.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Calendar className="h-5 w-5 shrink-0 text-primary-600" />
                      <div className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-3">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {appointment.service?.name || 'Servicio'}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          Con {appointment.user?.name || 'Sin profesional'} · {formatAppointmentCabin(appointment.cabin)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                      <p className="text-sm text-gray-900 dark:text-white">
                        {formatDate(appointment.date)}
                        <span className="text-gray-400"> · </span>
                        {appointment.startTime} - {appointment.endTime}
                      </p>

                      <span className={`badge ${getAppointmentStatusBadgeClassName(displayStatus)}`}>
                        {getAppointmentStatusLabel(displayStatus)}
                      </span>

                      {renderAppointmentActions(appointment)}
                    </div>
                  </div>
                  {appointment.notes && (
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{appointment.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : upcomingAppointments.length === 0 ? (
        <p className="text-center py-8 text-gray-500 dark:text-gray-400">No hay citas registradas</p>
      ) : null}
    </div>
  )
}
