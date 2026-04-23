import { useEffect, useState } from 'react'
import type { View } from 'react-big-calendar'
import toast from 'react-hot-toast'
import {
  loadAppointmentLegendItems,
  loadAppointmentLegendCategories,
  loadBonoTemplates,
  preloadAppointmentFormCatalogs,
  type AppointmentLegendCatalogItem
} from '../../utils/appointmentCatalogs'
import {
  getAppointmentBonoCandidates,
  getConsumedAppointmentBono,
  type AppointmentBonoCandidate,
  type AppointmentConsumedBono
} from '../../utils/appointmentBonos'
import { fetchAppointmentsInRange, fetchClientBonos } from './appointmentsApi'

type UseAppointmentsPageDataArgs = {
  currentDate: Date
  view: View
  editingAppointment: any
}

export const useAppointmentsPageData = ({
  currentDate,
  view,
  editingAppointment
}: UseAppointmentsPageDataArgs) => {
  const [appointments, setAppointments] = useState<any[]>([])
  const [agendaBlocks, setAgendaBlocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [legendLoading, setLegendLoading] = useState(true)
  const [legendItems, setLegendItems] = useState<AppointmentLegendCatalogItem[]>([])
  const [legendCategories, setLegendCategories] = useState<string[]>([])
  const [appointmentBonosLoading, setAppointmentBonosLoading] = useState(false)
  const [appointmentBonoCandidates, setAppointmentBonoCandidates] = useState<AppointmentBonoCandidate[]>([])
  const [consumedAppointmentBono, setConsumedAppointmentBono] = useState<AppointmentConsumedBono | null>(null)
  const [selectedAppointmentBonoId, setSelectedAppointmentBonoId] = useState('')

  const refreshAppointments = async () => {
    try {
      setLoading(true)
      const nextData = await fetchAppointmentsInRange({ currentDate, view })
      setAppointments(nextData.appointments)
      setAgendaBlocks(nextData.agendaBlocks)
    } catch (error) {
      console.error('Error fetching appointments:', error)
      toast.error('Error al cargar la agenda')
    } finally {
      setLoading(false)
    }
  }

  const refreshAppointmentLegends = async () => {
    try {
      setLegendLoading(true)
      const nextLegendItems = await loadAppointmentLegendItems()
      setLegendItems(nextLegendItems)
    } catch (error) {
      console.error('Error fetching appointment legends:', error)
      toast.error('No se pudo cargar la leyenda de citas')
    } finally {
      setLegendLoading(false)
    }
  }

  const refreshAppointmentLegendCategories = async () => {
    try {
      const nextLegendCategories = await loadAppointmentLegendCategories()
      setLegendCategories(nextLegendCategories)
    } catch (error) {
      console.error('Error fetching appointment legend categories:', error)
      toast.error('No se pudieron cargar las categorías de tratamientos')
    }
  }

  useEffect(() => {
    void refreshAppointments()
  }, [currentDate, view])

  useEffect(() => {
    void preloadAppointmentFormCatalogs()
    void refreshAppointmentLegends()
    void refreshAppointmentLegendCategories()
  }, [])

  useEffect(() => {
    if (!editingAppointment?.id || !editingAppointment.clientId || editingAppointment.sale) {
      setAppointmentBonosLoading(false)
      setAppointmentBonoCandidates([])
      setConsumedAppointmentBono(null)
      setSelectedAppointmentBonoId('')
      return
    }

    let cancelled = false

    const loadAppointmentBonos = async () => {
      try {
        setAppointmentBonosLoading(true)
        const [bonoPacks, bonoTemplates] = await Promise.all([
          fetchClientBonos(editingAppointment.clientId),
          loadBonoTemplates().catch(() => [])
        ])
        if (cancelled) return

        const nextConsumedBono = getConsumedAppointmentBono(editingAppointment, bonoPacks)
        const nextCandidates = getAppointmentBonoCandidates(editingAppointment, bonoPacks, {
          bonoTemplates
        })

        setConsumedAppointmentBono(nextConsumedBono)
        setAppointmentBonoCandidates(nextCandidates)
        setSelectedAppointmentBonoId((currentValue) => {
          if (nextCandidates.length === 0) return ''
          if (currentValue && nextCandidates.some((bonoPack) => bonoPack.id === currentValue)) {
            return currentValue
          }
          return nextCandidates[0].id
        })
      } catch {
        if (!cancelled) {
          setAppointmentBonoCandidates([])
          setConsumedAppointmentBono(null)
          setSelectedAppointmentBonoId('')
        }
      } finally {
        if (!cancelled) {
          setAppointmentBonosLoading(false)
        }
      }
    }

    void loadAppointmentBonos()

    return () => {
      cancelled = true
    }
  }, [editingAppointment])

  return {
    agendaBlocks,
    appointmentBonoCandidates,
    appointmentBonosLoading,
    appointments,
    consumedAppointmentBono,
    legendCategories,
    legendItems,
    legendLoading,
    loading,
    refreshAppointments,
    refreshAppointmentLegendCategories,
    refreshAppointmentLegends,
    selectedAppointmentBonoId,
    setLegendItems,
    setSelectedAppointmentBonoId
  }
}
