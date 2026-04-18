import { Check, Pencil, Save, Trash2, X } from 'lucide-react'
import { FormEvent, SyntheticEvent, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'

type AgendaDayNote = {
  id: string
  dayKey: string
  text: string
  isCompleted: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

type AgendaDayNotesPanelProps = {
  dayKey: string
}

export default function AgendaDayNotesPanel({ dayKey }: AgendaDayNotesPanelProps) {
  const [notes, setNotes] = useState<AgendaDayNote[]>([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadNotes = async () => {
      try {
        setLoading(true)
        const response = await api.get('/appointments/day-notes', {
          params: { dayKey }
        })

        if (!cancelled) {
          setNotes(Array.isArray(response.data) ? response.data : [])
        }
      } catch (error) {
        console.error('Error fetching agenda day notes:', error)
        if (!cancelled) {
          toast.error('No se pudieron cargar las notas del día')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadNotes()

    return () => {
      cancelled = true
    }
  }, [dayKey])

  const stopEditorEvent = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const handleCreateNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = newText.trim()
    if (!text) {
      toast.error('Escribe una nota antes de guardarla')
      return
    }

    try {
      setIsCreating(true)
      const response = await api.post('/appointments/day-notes', {
        dayKey,
        text
      })
      setNotes((current) => [...current, response.data])
      setNewText('')
    } catch (error) {
      console.error('Error creating agenda day note:', error)
      toast.error('No se pudo guardar la nota')
    } finally {
      setIsCreating(false)
    }
  }

  const beginEditing = (note: AgendaDayNote) => {
    setEditingNoteId(note.id)
    setEditingText(note.text)
  }

  const cancelEditing = () => {
    setEditingNoteId(null)
    setEditingText('')
  }

  const handleSaveEdit = async (noteId: string) => {
    const text = editingText.trim()
    if (!text) {
      toast.error('La nota no puede estar vacía')
      return
    }

    try {
      setActiveNoteId(noteId)
      const response = await api.put(`/appointments/day-notes/${noteId}`, {
        text
      })
      setNotes((current) =>
        current.map((note) => (note.id === noteId ? response.data : note))
      )
      cancelEditing()
    } catch (error) {
      console.error('Error updating agenda day note:', error)
      toast.error('No se pudo actualizar la nota')
    } finally {
      setActiveNoteId(null)
    }
  }

  const handleToggleNote = async (note: AgendaDayNote) => {
    try {
      setActiveNoteId(note.id)
      const response = await api.patch(`/appointments/day-notes/${note.id}/toggle`, {
        isCompleted: !note.isCompleted
      })
      setNotes((current) =>
        current.map((currentNote) => (currentNote.id === note.id ? response.data : currentNote))
      )
    } catch (error) {
      console.error('Error toggling agenda day note:', error)
      toast.error('No se pudo actualizar el estado de la nota')
    } finally {
      setActiveNoteId(null)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('¿Eliminar esta nota del día?')) {
      return
    }

    try {
      setActiveNoteId(noteId)
      await api.delete(`/appointments/day-notes/${noteId}`)
      setNotes((current) => current.filter((note) => note.id !== noteId))
      if (editingNoteId === noteId) {
        cancelEditing()
      }
    } catch (error) {
      console.error('Error deleting agenda day note:', error)
      toast.error('No se pudo eliminar la nota')
    } finally {
      setActiveNoteId(null)
    }
  }

  return (
    <div className="card p-3">
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Cargando notas del día...
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 pr-1">
          <form
            onSubmit={handleCreateNote}
            className="flex min-h-[6.75rem] w-[250px] flex-shrink-0 flex-col rounded-xl border border-dashed border-primary-200 bg-primary-50/60 p-2.5 dark:border-primary-900/50 dark:bg-primary-950/20"
          >
            <div className="flex items-center justify-between gap-2">
              <label className="label text-xs">Nueva nota</label>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {newText.trim().length}/500
              </span>
            </div>

            <textarea
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
              onPointerDown={stopEditorEvent}
              onMouseDown={stopEditorEvent}
              onClick={stopEditorEvent}
              onFocus={stopEditorEvent}
              onKeyDown={stopEditorEvent}
              className="input mt-2 min-h-[52px] flex-1 resize-none px-3 py-2 text-sm leading-5"
              placeholder="Escribe una nota para este día..."
              maxLength={500}
              rows={2}
            />

            <div className="mt-2 flex items-center justify-end">
              <button
                type="submit"
                className="btn btn-primary inline-flex items-center justify-center whitespace-nowrap"
                disabled={isCreating}
              >
                {isCreating ? 'Guardando...' : 'Añadir nota'}
              </button>
            </div>
          </form>

          {notes.length === 0 ? (
            <div className="flex min-h-[6.75rem] min-w-[220px] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
              No hay notas creadas para este día.
            </div>
          ) : (
            <>
              {notes.map((note) => {
                const isEditing = editingNoteId === note.id
                const isBusy = activeNoteId === note.id

                return (
                  <article
                    key={note.id}
                    className={`flex min-h-[6.75rem] w-[220px] flex-shrink-0 flex-col rounded-xl border p-2.5 transition ${
                      note.isCompleted
                        ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void handleToggleNote(note)}
                        disabled={isBusy}
                        className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition ${
                          note.isCompleted
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-gray-300 bg-white text-transparent hover:border-primary-500 hover:text-primary-500 dark:border-gray-600 dark:bg-gray-900'
                        }`}
                        title={note.isCompleted ? 'Marcar como pendiente' : 'Marcar como finalizada'}
                      >
                        <Check className="h-4 w-4" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`badge ${note.isCompleted ? 'badge-success' : 'badge-warning'}`}>
                            {note.isCompleted ? 'Finalizada' : 'Pendiente'}
                          </span>
                          <div className="flex items-center gap-1">
                            {isEditing ? null : (
                              <button
                                type="button"
                                onClick={() => beginEditing(note)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                                title="Editar nota"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteNote(note.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                              title="Eliminar nota"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="mt-2 flex min-h-[52px] flex-1 flex-col gap-2">
                            <textarea
                              value={editingText}
                              onChange={(event) => setEditingText(event.target.value)}
                              onPointerDown={stopEditorEvent}
                              onMouseDown={stopEditorEvent}
                              onClick={stopEditorEvent}
                              onFocus={stopEditorEvent}
                              onKeyDown={stopEditorEvent}
                              className="input min-h-0 flex-1 resize-none px-3 py-2 text-sm leading-5"
                              maxLength={500}
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEditing}
                                className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSaveEdit(note.id)}
                                className="btn btn-primary btn-sm inline-flex items-center gap-1"
                                disabled={isBusy}
                              >
                                <Save className="h-3.5 w-3.5" />
                                Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 min-h-[52px] flex-1 overflow-y-auto pr-1 text-sm text-gray-700 dark:text-gray-200">
                            <p className="whitespace-pre-wrap break-words">{note.text}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
