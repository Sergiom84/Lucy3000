import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import type { DashboardReminder } from '../types/reminder'

const formatReminderTimestamp = (value: string) =>
  new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit'
  })

export default function DashboardReminderCard() {
  const [reminders, setReminders] = useState<DashboardReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeReminderId, setActiveReminderId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadReminders = async () => {
      try {
        setLoading(true)
        const response = await api.get('/reminders')

        if (!cancelled) {
          setReminders(Array.isArray(response.data) ? response.data : [])
        }
      } catch (error) {
        console.error('Error fetching dashboard reminders:', error)
        if (!cancelled) {
          setReminders([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadReminders()

    return () => {
      cancelled = true
    }
  }, [])

  const handleCompleteReminder = async (reminder: DashboardReminder) => {
    try {
      setActiveReminderId(reminder.id)
      await api.patch(`/reminders/${reminder.id}/toggle`, {
        isCompleted: true
      })
      setReminders((current) => current.filter((item) => item.id !== reminder.id))
    } catch (error) {
      console.error('Error completing reminder:', error)
      toast.error('No se pudo finalizar el recordatorio')
    } finally {
      setActiveReminderId(null)
    }
  }

  const pendingCount = reminders.length

  return (
    <div className="card flex min-h-[10rem] flex-col p-4 xl:min-h-[10.5rem]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Recordatorios</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {loading ? '...' : pendingCount}
          </p>
        </div>
        {loading || pendingCount > 0 ? (
          <span className="badge badge-warning">
            {loading ? 'Cargando' : pendingCount === 1 ? '1 pendiente' : `${pendingCount} pendientes`}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 gap-2 overflow-x-auto pb-1 pr-1">
        {loading ? (
          <div className="flex min-h-[5.75rem] min-w-[220px] flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
            Cargando recordatorios...
          </div>
        ) : reminders.length === 0 ? (
          <div className="flex min-h-[5.75rem] min-w-[220px] flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
            No hay recordatorios pendientes.
          </div>
        ) : (
          reminders.map((reminder) => {
            const isBusy = activeReminderId === reminder.id

            return (
              <label
                key={reminder.id}
                className={`flex min-h-[5.75rem] w-[220px] flex-shrink-0 gap-3 rounded-xl border bg-white p-3 transition dark:bg-gray-800 ${
                  isBusy ? 'opacity-60' : ''
                } border-gray-200 dark:border-gray-700`}
              >
                <input
                  type="checkbox"
                  checked={isBusy}
                  onChange={() => void handleCompleteReminder(reminder)}
                  disabled={isBusy}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  aria-label={`Finalizar recordatorio: ${reminder.text}`}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="max-h-[4.25rem] overflow-y-auto pr-1 text-sm text-gray-700 dark:text-gray-200">
                    <p className="whitespace-pre-wrap break-words">{reminder.text}</p>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    Creado {formatReminderTimestamp(reminder.createdAt)}
                  </p>
                </div>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
