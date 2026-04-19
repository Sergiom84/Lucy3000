import { FormEvent, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import Modal from './Modal'
import type { DashboardReminder } from '../types/reminder'

interface ReminderModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (reminder: DashboardReminder) => void
}

export default function ReminderModal({ isOpen, onClose, onCreated }: ReminderModalProps) {
  const [text, setText] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setText('')
      setIsSaving(false)
    }
  }, [isOpen])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedText = text.trim()
    if (!trimmedText) {
      toast.error('Escribe un recordatorio antes de guardarlo')
      return
    }

    try {
      setIsSaving(true)
      const response = await api.post('/reminders', {
        text: trimmedText
      })
      onCreated?.(response.data)
      toast.success('Recordatorio creado')
      onClose()
    } catch (error) {
      console.error('Error creating reminder:', error)
      toast.error('No se pudo guardar el recordatorio')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo recordatorio" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Recordatorio</label>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="input min-h-[120px] resize-none px-4 py-3 text-sm leading-6"
            placeholder="Escribe el recordatorio..."
            maxLength={500}
            autoFocus
          />
          <div className="mt-2 text-right text-xs text-gray-500 dark:text-gray-400">
            {text.trim().length}/500
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Añadir recordatorio'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
