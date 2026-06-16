import { FormEvent, ReactNode, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowLeft, ChevronDown, KeyRound, Lock, Pencil, RefreshCw, Save, Trash2, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../utils/api'

type PlatformDashboardRow = {
  id: string
  source: 'tenant' | 'trialRequest'
  tenantId: string | null
  requestId: string | null
  tenantName: string
  tenantCode: number | null
  userName: string
  email: string
  phone: string
  signedUpAt: string
  requestedAt: string | null
  trialStartedAt: string | null
  trialEndsAt: string | null
  paidAt: string | null
  licenseStatus: string
  commercialStatusCode: string
  commercialStatus: string
  emailStatus: string
  replyStatusCode: string
  replyStatus: string
  requestStatus: string | null
}

type PlatformDashboardResponse = {
  rows: PlatformDashboardRow[]
  totals: {
    total: number
    trial: number
    paid: number
    notContinued: number
    pending: number
  }
}

type EditFormState = {
  name: string
  tenantName: string
  email: string
  phone: string
  status: string
}

type AccessFormState = {
  requestId: string | null
  businessName: string
  adminName: string
  adminEmail: string
  adminPhone: string
}

type GeneratedCredentials = {
  tenantCode: number | null
  username: string
  password: string
}

const TENANT_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'TRIAL', label: 'En prueba' },
  { value: 'ACTIVE', label: 'Pagado' },
  { value: 'CANCELLED', label: 'No siguió' },
  { value: 'BLOCKED', label: 'Bloqueado' }
]

const REQUEST_STATUS_OPTIONS = [
  { value: 'PENDING_REPLY', label: 'Por contestar' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'CONVERTED', label: 'Alta creada' },
  { value: 'DISMISSED', label: 'No siguió' },
  { value: 'EMAIL_FAILED', label: 'Revisar envío' }
]

const REPLY_STATUS_FULL_LABELS: Record<string, string> = {
  PENDING_REPLY: 'Pendiente de mi contestación',
  EMAIL_RECEIVED: 'Correo recibido',
  CONTACTED: 'Contactado',
  MEETING_SCHEDULED: 'Reunión agendada',
  FOLLOW_UP: 'Seguimiento pendiente',
  NO_RESPONSE: 'Sin respuesta',
  CLOSED: 'Cerrado',
  EMAIL_FAILED: 'Revisar envío'
}

const REPLY_STATUS_OPTIONS = [
  { value: 'PENDING_REPLY', label: 'Pendiente de mi contestación' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'MEETING_SCHEDULED', label: 'Reunión agendada' },
  { value: 'FOLLOW_UP', label: 'Seguimiento pendiente' },
  { value: 'NO_RESPONSE', label: 'Sin respuesta' },
  { value: 'CLOSED', label: 'Cerrado' },
  { value: 'EMAIL_FAILED', label: 'Revisar envío' }
]

const PROCESS_STATUS_FULL_LABELS: Record<string, string> = {
  REQUEST_RECEIVED: 'Solicitud recibida',
  CONTACTED: 'Contactado',
  REGISTERED: 'Alta creada',
  PENDING_TRIAL: 'Pendiente de prueba',
  TRIAL_STARTED: 'En prueba',
  TRIAL_EXPIRED: 'Prueba finalizada',
  PAID: 'Ya ha pagado',
  NOT_CONTINUED: 'No siguió',
  BLOCKED: 'Bloqueado'
}

const PROCESS_STATUS_OPTIONS = [
  { value: 'REQUEST_RECEIVED', label: 'Solicitud recibida' },
  { value: 'REGISTERED', label: 'Alta creada' },
  { value: 'TRIAL_STARTED', label: 'En prueba' },
  { value: 'TRIAL_EXPIRED', label: 'Prueba finalizada' },
  { value: 'PAID', label: 'Ya ha pagado' },
  { value: 'NOT_CONTINUED', label: 'No siguió' },
  { value: 'BLOCKED', label: 'Bloqueado' }
]

const getReplySelectOptions = (currentValue: string) => {
  if (REPLY_STATUS_OPTIONS.some((option) => option.value === currentValue)) return REPLY_STATUS_OPTIONS
  return [{ value: currentValue, label: REPLY_STATUS_FULL_LABELS[currentValue] || currentValue }, ...REPLY_STATUS_OPTIONS]
}

const getProcessSelectOptions = (currentValue: string) => {
  if (PROCESS_STATUS_OPTIONS.some((option) => option.value === currentValue)) return PROCESS_STATUS_OPTIONS
  return [{ value: currentValue, label: PROCESS_STATUS_FULL_LABELS[currentValue] || currentValue }, ...PROCESS_STATUS_OPTIONS]
}

const normalizeTenantStatus = (status: string) =>
  TENANT_STATUS_OPTIONS.some((option) => option.value === status) ? status : 'TRIAL'

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value))
}

const getTrialSelectValue = (row: PlatformDashboardRow) => {
  if (row.source !== 'tenant') return 'no'
  if (row.trialStartedAt || ['TRIAL', 'TRIAL_EXPIRED', 'ACTIVE'].includes(row.licenseStatus)) return 'yes'
  return 'no'
}

export default function PlatformDashboard() {
  const [pin, setPin] = useState('')
  const [data, setData] = useState<PlatformDashboardResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingRow, setEditingRow] = useState<PlatformDashboardRow | null>(null)
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    tenantName: '',
    email: '',
    phone: '',
    status: ''
  })
  const [accessForm, setAccessForm] = useState<AccessFormState | null>(null)
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredentials | null>(null)

  const rows = useMemo(() => data?.rows || [], [data])

  const loadDashboard = async (event?: FormEvent) => {
    event?.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/platform-dashboard', { pin })
      setData(response.data)
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'No se pudo cargar el dashboard')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (row: PlatformDashboardRow) => {
    setEditingRow(row)
    setEditForm({
      name: row.userName === '-' ? '' : row.userName,
      tenantName: row.tenantName,
      email: row.email === '-' ? '' : row.email,
      phone: row.phone || '',
      status: row.source === 'tenant' ? normalizeTenantStatus(row.licenseStatus) : row.requestStatus || 'PENDING_REPLY'
    })
  }

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingRow) return

    setSaving(true)
    setError('')

    try {
      const payload =
        editingRow.source === 'tenant'
          ? {
              pin,
              name: editForm.name,
              tenantName: editForm.tenantName,
              email: editForm.email,
              phone: editForm.phone,
              status: editForm.status
            }
          : {
              pin,
              name: editForm.name,
              email: editForm.email,
              phone: editForm.phone,
              status: editForm.status
            }

      const response = await api.patch(`/platform-dashboard/rows/${editingRow.id}`, payload)
      setData(response.data)
      setEditingRow(null)
      toast.success('Registro actualizado')
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || 'No se pudo guardar el registro'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const deleteRow = async (row: PlatformDashboardRow) => {
    if (row.source !== 'trialRequest') return
    if (!window.confirm(`Eliminar la solicitud de ${row.userName}?`)) return

    setSaving(true)
    setError('')

    try {
      const response = await api.delete(`/platform-dashboard/rows/${row.id}`, { data: { pin } })
      setData(response.data)
      toast.success('Solicitud eliminada')
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || 'No se pudo eliminar la solicitud'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const updateTrialStarted = async (row: PlatformDashboardRow, value: string) => {
    if (row.source !== 'tenant') return

    setSaving(true)
    setError('')

    try {
      const response = await api.patch(`/platform-dashboard/rows/${row.id}`, {
        pin,
        trialStarted: value === 'yes'
      })
      setData(response.data)
      toast.success(value === 'yes' ? 'Prueba iniciada' : 'Prueba marcada como no iniciada')
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || 'No se pudo actualizar la prueba'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const updateReplyStatus = async (row: PlatformDashboardRow, value: string) => {
    setSaving(true)
    setError('')

    try {
      const response = await api.patch(`/platform-dashboard/rows/${row.id}`, {
        pin,
        replyStatus: value
      })
      setData(response.data)
      toast.success('Contestación actualizada')
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || 'No se pudo actualizar la contestación'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const openAccessForm = (row?: PlatformDashboardRow) => {
    setGeneratedCredentials(null)
    setAccessForm({
      requestId: row?.source === 'trialRequest' ? row.requestId : null,
      businessName: row && row.tenantName !== 'Solicitud web' ? row.tenantName : '',
      adminName: row?.userName === '-' ? '' : row?.userName || '',
      adminEmail: row?.email === '-' ? '' : row?.email || '',
      adminPhone: row?.phone || ''
    })
  }

  const saveAccessForm = async (event: FormEvent) => {
    event.preventDefault()
    if (!accessForm) return

    setSaving(true)
    setError('')

    try {
      const response = await api.post('/platform-dashboard/access', {
        pin,
        requestId: accessForm.requestId || undefined,
        businessName: accessForm.businessName,
        adminName: accessForm.adminName,
        adminEmail: accessForm.adminEmail,
        adminPhone: accessForm.adminPhone || undefined
      })

      setData(response.data.dashboard)
      setGeneratedCredentials({
        tenantCode: response.data.tenant?.tenantCode ?? null,
        username: response.data.credentials.username,
        password: response.data.credentials.password
      })
      toast.success(
        response.data.emailDelivered ? 'Acceso creado y correo enviado' : 'Acceso creado, revisa el envío de correo'
      )
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || 'No se pudo generar el acceso'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const updateCommercialProcessStatus = async (row: PlatformDashboardRow, value: string) => {
    setSaving(true)
    setError('')

    try {
      const response = await api.patch(`/platform-dashboard/rows/${row.id}`, {
        pin,
        commercialProcessStatus: value
      })
      setData(response.data)
      toast.success('Estado actualizado')
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || 'No se pudo actualizar el estado'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-5 xl:px-8">
      <div className="mx-auto w-full max-w-none">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver
            </Link>
            <h1 className="text-3xl font-semibold tracking-normal text-white">Dashboard Lucy3000</h1>
          </div>

          <form onSubmit={loadDashboard} className="flex w-full gap-2 sm:w-auto">
            <label className="relative flex-1 sm:w-40">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="PIN"
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400"
              />
            </label>
            <button
              type="submit"
              disabled={loading || pin.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Entrar
            </button>
            {data ? (
              <button
                type="button"
                onClick={() => openAccessForm()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Nuevo cliente
              </button>
            ) : null}
          </form>
        </header>

        {error ? <div className="mb-4 rounded-md border border-red-400/40 bg-red-950/50 p-3 text-sm text-red-100">{error}</div> : null}

        {data ? (
          <>
            <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Total" value={data.totals.total} />
              <Metric label="En prueba" value={data.totals.trial} />
              <Metric label="Pagados" value={data.totals.paid} />
              <Metric label="No siguieron" value={data.totals.notContinued} />
              <Metric label="Por contestar" value={data.totals.pending} />
            </section>

            <div className="space-y-4 xl:hidden">
              {rows.map((row) => (
                <article key={row.id} className="rounded-md border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-semibold text-white">{row.userName}</div>
                      <div className="mt-1 break-words text-sm text-slate-400">
                        {row.tenantCode ? `ID cliente ${row.tenantCode}` : row.source === 'trialRequest' ? 'Solicitud web' : 'Sin ID'} · {row.tenantName}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        disabled={saving}
                        title="Editar"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {row.source === 'trialRequest' && row.tenantName !== 'Alta creada' ? (
                        <button
                          type="button"
                          onClick={() => openAccessForm(row)}
                          disabled={saving}
                          title="Generar acceso"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                      {row.source === 'trialRequest' ? (
                        <button
                          type="button"
                          onClick={() => deleteRow(row)}
                          disabled={saving}
                          title="Eliminar solicitud"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-300 transition hover:border-red-300 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <InfoBlock label="Correo" value={row.email} breakAll />
                    <InfoBlock label="Teléfono" value={row.phone || '-'} />
                    <InfoBlock label="Solicitud / alta" value={formatDate(row.requestedAt || row.signedUpAt)} note={row.requestedAt ? 'Solicitud recibida' : 'Alta creada'} />
                    <InfoBlock label="Confirmación" value={row.emailStatus} />

                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Contestación</div>
                      <DashboardSelect
                        value={row.replyStatusCode || 'PENDING_REPLY'}
                        options={getReplySelectOptions(row.replyStatusCode || 'PENDING_REPLY')}
                        onChange={(value) => updateReplyStatus(row, value)}
                        disabled={saving}
                        tone={(row.replyStatusCode || 'PENDING_REPLY') === 'PENDING_REPLY' ? 'amber' : 'cyan'}
                        label="Contestación"
                      />
                    </div>

                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Estado</div>
                      <DashboardSelect
                        value={row.commercialStatusCode || 'REQUEST_RECEIVED'}
                        options={getProcessSelectOptions(row.commercialStatusCode || 'REQUEST_RECEIVED')}
                        onChange={(value) => updateCommercialProcessStatus(row, value)}
                        disabled={saving}
                        tone="cyan"
                        label="Estado"
                      />
                    </div>

                    {row.source === 'tenant' ? (
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Prueba</div>
                        <div className="space-y-2">
                          <InlineNativeSelect
                            value={getTrialSelectValue(row)}
                            onChange={(value) => updateTrialStarted(row, value)}
                            disabled={saving || row.licenseStatus === 'ACTIVE'}
                            options={[
                              { value: 'yes', label: 'SI' },
                              { value: 'no', label: 'NO' }
                            ]}
                            tone="slate"
                            label="Prueba"
                          />
                          {getTrialSelectValue(row) === 'yes' ? (
                            <>
                              <div className="text-xs text-slate-400">
                                Inicio {row.trialStartedAt ? formatDate(row.trialStartedAt) : 'no registrado'}
                              </div>
                              <div className="text-xs text-slate-500">
                                Fin {row.trialEndsAt ? formatDate(row.trialEndsAt) : '-'}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-slate-500">Sin iniciar</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <InfoBlock label="Prueba" value="-" />
                    )}

                    <InfoBlock label="Pago" value={formatDate(row.paidAt)} />
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden rounded-md border border-slate-800 bg-slate-900 xl:block">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed divide-y divide-slate-800 text-[13px]">
                  <thead className="bg-slate-900/90 text-left text-[11px] uppercase tracking-[0.08em] text-slate-400 xl:text-xs xl:tracking-[0.12em]">
                    <tr>
                      <th className="w-[5%] px-3 py-3 leading-tight">Acciones</th>
                      <th className="w-[13%] px-3 py-3 leading-tight">Usuario</th>
                      <th className="w-[17%] px-3 py-3 leading-tight">Correo</th>
                      <th className="w-[7%] px-3 py-3 leading-tight">Teléfono</th>
                      <th className="w-[9%] px-3 py-3 leading-tight">Solicitud / alta</th>
                      <th className="w-[12%] px-3 py-3 leading-tight">Confirmación</th>
                      <th className="w-[16%] px-3 py-3 leading-tight">Contestación</th>
                      <th className="w-[8%] px-3 py-3 leading-tight">Prueba</th>
                      <th className="w-[7%] px-3 py-3 leading-tight">Pago</th>
                      <th className="w-[11%] px-3 py-3 leading-tight">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              disabled={saving}
                              title="Editar"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            {row.source === 'trialRequest' && row.tenantName !== 'Alta creada' ? (
                              <button
                                type="button"
                                onClick={() => openAccessForm(row)}
                                disabled={saving}
                                title="Generar acceso"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <KeyRound className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                            {row.source === 'trialRequest' ? (
                              <button
                                type="button"
                                onClick={() => deleteRow(row)}
                                disabled={saving}
                                title="Eliminar solicitud"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-300 transition hover:border-red-300 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="break-words font-medium leading-5 text-white" title={row.userName}>{row.userName}</div>
                          <div className="break-words text-xs leading-5 text-slate-400" title={`${row.tenantCode ? `ID cliente ${row.tenantCode}` : row.source === 'trialRequest' ? 'Solicitud web' : 'Sin ID'} · ${row.tenantName}`}>
                            {row.tenantCode ? `ID cliente ${row.tenantCode}` : row.source === 'trialRequest' ? 'Solicitud web' : 'Sin ID'} · {row.tenantName}
                          </div>
                        </td>
                        <td className="break-all px-3 py-3 text-[12px] leading-5 text-slate-200" title={row.email}>{row.email}</td>
                        <td className="break-words px-3 py-3 text-slate-200">{row.phone || '-'}</td>
                        <td className="px-3 py-3 text-slate-300">
                          <div>{formatDate(row.requestedAt || row.signedUpAt)}</div>
                          <div className="text-xs text-slate-500">
                            {row.requestedAt ? 'Solicitud recibida' : 'Alta creada'}
                          </div>
                        </td>
                        <td className="break-words px-3 py-3 text-[12px] leading-5 text-slate-300">{row.emailStatus}</td>
                        <td className="px-3 py-3">
                          <DashboardSelect
                            value={row.replyStatusCode || 'PENDING_REPLY'}
                            options={getReplySelectOptions(row.replyStatusCode || 'PENDING_REPLY')}
                            onChange={(value) => updateReplyStatus(row, value)}
                            disabled={saving}
                            tone={(row.replyStatusCode || 'PENDING_REPLY') === 'PENDING_REPLY' ? 'amber' : 'cyan'}
                            label="Contestación"
                          />
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {row.source === 'tenant' ? (
                            <div className="space-y-1">
                              <InlineNativeSelect
                                value={getTrialSelectValue(row)}
                                onChange={(value) => updateTrialStarted(row, value)}
                                disabled={saving || row.licenseStatus === 'ACTIVE'}
                                options={[
                                  { value: 'yes', label: 'SI' },
                                  { value: 'no', label: 'NO' }
                                ]}
                                tone="slate"
                                label="Prueba"
                              />
                              {getTrialSelectValue(row) === 'yes' ? (
                                <>
                                  <div className="text-xs text-slate-400">
                                    Inicio {row.trialStartedAt ? formatDate(row.trialStartedAt) : 'no registrado'}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Fin {row.trialEndsAt ? formatDate(row.trialEndsAt) : '-'}
                                  </div>
                                </>
                              ) : (
                                <div className="whitespace-nowrap text-xs text-slate-500">Sin iniciar</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-300">{formatDate(row.paidAt)}</td>
                        <td className="px-3 py-3">
                          <DashboardSelect
                            value={row.commercialStatusCode || 'REQUEST_RECEIVED'}
                            options={getProcessSelectOptions(row.commercialStatusCode || 'REQUEST_RECEIVED')}
                            onChange={(value) => updateCommercialProcessStatus(row, value)}
                            disabled={saving}
                            tone="cyan"
                            label="Estado"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <section className="rounded-md border border-slate-800 bg-slate-900 p-6 text-slate-300">
            Introduce el PIN para ver altas, pruebas, pagos y clientes que no siguieron.
          </section>
        )}
      </div>

      {editingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <form onSubmit={saveEdit} className="w-full max-w-xl rounded-md border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Editar registro</h2>
                <p className="mt-1 text-sm text-slate-400">{editingRow.source === 'tenant' ? 'Cliente registrado' : 'Solicitud web'}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                />
              </Field>

              {editingRow.source === 'tenant' ? (
                <Field label="Centro">
                  <input
                    value={editForm.tenantName}
                    onChange={(event) => setEditForm((current) => ({ ...current, tenantName: event.target.value }))}
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                  />
                </Field>
              ) : null}

              <Field label="Correo">
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                />
              </Field>

              <Field label="Teléfono">
                <input
                  value={editForm.phone}
                  onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                />
              </Field>

              <Field label="Estado">
                <select
                  value={editForm.status}
                  onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                >
                  {(editingRow.source === 'tenant' ? TENANT_STATUS_OPTIONS : REQUEST_STATUS_OPTIONS).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Guardar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {accessForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <form
            onSubmit={generatedCredentials ? (event) => event.preventDefault() : saveAccessForm}
            className="w-full max-w-xl rounded-md border border-slate-700 bg-slate-900 p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {generatedCredentials ? 'Acceso generado' : 'Nuevo cliente'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {generatedCredentials
                    ? 'Comparte estos datos solo si el correo no llegó.'
                    : 'Genera usuario y contraseña con el correo del futuro cliente.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccessForm(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {generatedCredentials ? (
              <div className="space-y-3">
                <InfoBlock label="ID cliente" value={String(generatedCredentials.tenantCode ?? '-')} />
                <InfoBlock label="Usuario" value={generatedCredentials.username} breakAll />
                <InfoBlock label="Contraseña" value={generatedCredentials.password} breakAll />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Negocio">
                  <input
                    required
                    value={accessForm.businessName}
                    onChange={(event) =>
                      setAccessForm((current) => (current ? { ...current, businessName: event.target.value } : current))
                    }
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                  />
                </Field>

                <Field label="Nombre admin">
                  <input
                    required
                    value={accessForm.adminName}
                    onChange={(event) =>
                      setAccessForm((current) => (current ? { ...current, adminName: event.target.value } : current))
                    }
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                  />
                </Field>

                <Field label="Correo">
                  <input
                    required
                    type="email"
                    value={accessForm.adminEmail}
                    onChange={(event) =>
                      setAccessForm((current) => (current ? { ...current, adminEmail: event.target.value } : current))
                    }
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                  />
                </Field>

                <Field label="Teléfono">
                  <input
                    value={accessForm.adminPhone}
                    onChange={(event) =>
                      setAccessForm((current) => (current ? { ...current, adminPhone: event.target.value } : current))
                    }
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                  />
                </Field>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccessForm(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:text-white"
              >
                {generatedCredentials ? 'Cerrar' : 'Cancelar'}
              </button>
              {generatedCredentials ? null : (
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Generar acceso
                </button>
              )}
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}

function InfoBlock({
  label,
  value,
  note,
  breakAll = false
}: {
  label: string
  value: string
  note?: string
  breakAll?: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className={`${breakAll ? 'break-all' : 'break-words'} text-sm leading-5 text-slate-200`}>{value}</div>
      {note ? <div className="mt-0.5 text-xs text-slate-500">{note}</div> : null}
    </div>
  )
}

function DashboardSelect({
  value,
  options,
  onChange,
  disabled,
  tone,
  label
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled: boolean
  tone: 'amber' | 'cyan'
  label: string
}) {
  return (
    <InlineNativeSelect
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      tone={tone}
      label={label}
      pill
    />
  )
}

function InlineNativeSelect({
  value,
  options,
  onChange,
  disabled,
  tone,
  label,
  pill = false
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled: boolean
  tone: 'amber' | 'cyan' | 'slate'
  label: string
  pill?: boolean
}) {
  const baseToneClass =
    tone === 'amber'
      ? 'border-amber-300/25 bg-amber-400/15 text-amber-50 focus:border-amber-300'
      : tone === 'cyan'
        ? 'border-slate-700 bg-slate-800 text-cyan-50 focus:border-cyan-300'
        : 'border-slate-700 bg-slate-950 text-slate-100 focus:border-cyan-300'

  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`h-8 w-full min-w-0 appearance-none border pl-3 pr-8 text-left text-[11px] font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
          pill ? 'rounded-full' : 'rounded-md'
        } ${baseToneClass}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" aria-hidden="true" />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  )
}
