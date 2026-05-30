import { useState } from 'react'
import { AlertTriangle, Cake, Check, FileText, Mail, MapPin, Pencil, Phone, Trash2, X } from 'lucide-react'
import { formatCurrency, formatDate, formatPhone, getInitials } from '../../../utils/format'
import Modal from '../../../components/Modal'
import type { ClientDetailClient, ClientDetailSaleNote } from '../types'

type ClientDetailProfileCardProps = {
  client: ClientDetailClient
  pendingTotal: number
  profileImageUrl: string | null
  saleNotes: ClientDetailSaleNote[]
  saleNoteSavingId: string | null
  onDeleteSaleNote: (saleId: string) => Promise<boolean>
  onUpdateSaleNote: (saleId: string, nextNote: string) => Promise<boolean>
}

export default function ClientDetailProfileCard({
  client,
  onDeleteSaleNote,
  onUpdateSaleNote,
  pendingTotal,
  profileImageUrl,
  saleNoteSavingId,
  saleNotes
}: ClientDetailProfileCardProps) {
  const fullName = `${client.firstName} ${client.lastName}`.trim()
  const [detailModal, setDetailModal] = useState<'allergies' | 'sale-notes' | null>(null)
  const [editingSaleNoteId, setEditingSaleNoteId] = useState<string | null>(null)
  const [saleNoteDraft, setSaleNoteDraft] = useState('')
  const allergyText = String(client.allergies || '').trim()
  const allergyItems = allergyText
    ? allergyText
        .split(/\r?\n|[;,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const allergyPreview = allergyText || 'Sin alergias registradas'
  const saleNotesPreview =
    saleNotes.length === 0
      ? 'Sin notas de ventas'
      : saleNotes.length === 1
        ? `${saleNotes[0].treatment} · ${formatDate(saleNotes[0].date)} · ${saleNotes[0].note}`
        : `${saleNotes.length} notas · ${saleNotes[0].treatment} · ${formatDate(saleNotes[0].date)} · ${saleNotes[0].note}`
  const allergyScrollClassName = allergyItems.length > 5 ? 'max-h-64 overflow-y-auto pr-1' : ''
  const saleNotesScrollClassName = saleNotes.length > 5 ? 'max-h-96 overflow-y-auto pr-1' : ''

  const startEditingSaleNote = (saleNote: ClientDetailSaleNote) => {
    setEditingSaleNoteId(saleNote.id)
    setSaleNoteDraft(saleNote.note)
  }

  const cancelEditingSaleNote = () => {
    setEditingSaleNoteId(null)
    setSaleNoteDraft('')
  }

  const saveEditingSaleNote = async (saleNote: ClientDetailSaleNote) => {
    const nextNote = saleNoteDraft.trim()
    if (!nextNote) {
      const shouldDelete = window.confirm('La nota quedará vacía. ¿Quieres eliminarla?')
      if (!shouldDelete) return
      const deleted = await onDeleteSaleNote(saleNote.id)
      if (deleted) cancelEditingSaleNote()
      return
    }

    const saved = await onUpdateSaleNote(saleNote.id, nextNote)
    if (saved) cancelEditingSaleNote()
  }

  const deleteSaleNote = async (saleNote: ClientDetailSaleNote) => {
    if (!window.confirm('¿Eliminar esta nota de venta?')) return
    const deleted = await onDeleteSaleNote(saleNote.id)
    if (deleted && editingSaleNoteId === saleNote.id) {
      cancelEditingSaleNote()
    }
  }

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

          <div className="mb-3 grid gap-3 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setDetailModal('allergies')}
              className={`min-w-0 rounded-xl border px-4 py-3 text-left transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                client.allergies
                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    client.allergies
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                      client.allergies ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    Alergias
                  </p>
                  <p
                    className={`mt-1 truncate text-sm ${
                      client.allergies ? 'text-red-700 dark:text-red-200' : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {allergyPreview}
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDetailModal('sale-notes')}
              className={`min-w-0 rounded-xl border px-4 py-3 text-left transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                saleNotes.length > 0
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    saleNotes.length > 0
                      ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                      saleNotes.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    Notas de ventas
                  </p>
                  <p
                    className={`mt-1 truncate text-sm ${
                      saleNotes.length > 0 ? 'text-amber-900 dark:text-amber-100' : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {saleNotesPreview}
                  </p>
                </div>
              </div>
            </button>
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

      <Modal
        isOpen={detailModal === 'allergies'}
        onClose={() => setDetailModal(null)}
        title="Alergias"
        maxWidth="md"
      >
        <div
          className={`max-h-[60vh] overflow-y-auto rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap ${
            allergyText
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100'
              : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300'
          }`}
        >
          {allergyItems.length > 1 ? (
            <div className={`space-y-2 ${allergyScrollClassName}`}>
              {allergyItems.map((allergy, index) => (
                <p key={`${allergy}-${index}`} className="break-words">
                  {allergy}
                </p>
              ))}
            </div>
          ) : (
            allergyPreview
          )}
        </div>
      </Modal>

      <Modal
        isOpen={detailModal === 'sale-notes'}
        onClose={() => setDetailModal(null)}
        title="Notas de ventas"
        maxWidth="md"
      >
        {saleNotes.length > 0 ? (
          <div className={`space-y-3 ${saleNotesScrollClassName}`}>
            {saleNotes.map((saleNote) => (
              <div
                key={saleNote.id}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    {saleNote.treatment} · {formatDate(saleNote.date)}
                  </p>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {editingSaleNoteId === saleNote.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void saveEditingSaleNote(saleNote)}
                          className="rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-900/40"
                          disabled={saleNoteSavingId === saleNote.id}
                          title="Guardar nota"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingSaleNote}
                          className="rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-900/40"
                          disabled={saleNoteSavingId === saleNote.id}
                          title="Cancelar edición"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingSaleNote(saleNote)}
                        className="rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        disabled={Boolean(saleNoteSavingId)}
                        title="Editar nota"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteSaleNote(saleNote)}
                      className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-900/40"
                      disabled={Boolean(saleNoteSavingId)}
                      title="Eliminar nota"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {editingSaleNoteId === saleNote.id ? (
                  <textarea
                    value={saleNoteDraft}
                    onChange={(event) => setSaleNoteDraft(event.target.value)}
                    className="input mt-3 min-h-[7rem] resize-y bg-white text-gray-900 dark:bg-gray-950 dark:text-white"
                    disabled={saleNoteSavingId === saleNote.id}
                  />
                ) : (
                  <p className="mt-1 whitespace-pre-wrap break-words">{saleNote.note}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
            Sin notas de ventas
          </div>
        )}
      </Modal>
    </div>
  )
}
