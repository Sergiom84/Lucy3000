import { FormEvent, useMemo, useState } from 'react'
import { ArrowLeft, Lock, RefreshCw } from 'lucide-react'
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
  commercialStatus: string
  emailStatus: string
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

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value))
}

export default function PlatformDashboard() {
  const [pin, setPin] = useState('')
  const [data, setData] = useState<PlatformDashboardResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
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
          </form>
        </header>

        {error ? <div className="mb-4 rounded-md border border-red-400/40 bg-red-950/50 p-3 text-sm text-red-100">{error}</div> : null}

        {data ? (
          <>
            <section className="mb-5 grid gap-3 sm:grid-cols-5">
              <Metric label="Total" value={data.totals.total} />
              <Metric label="En prueba" value={data.totals.trial} />
              <Metric label="Pagados" value={data.totals.paid} />
              <Metric label="No siguieron" value={data.totals.notContinued} />
              <Metric label="Por contestar" value={data.totals.pending} />
            </section>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900/90 text-left text-xs uppercase tracking-[0.12em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Correo</th>
                      <th className="px-4 py-3">Teléfono</th>
                      <th className="px-4 py-3">Solicitud / alta</th>
                      <th className="px-4 py-3">Confirmación</th>
                      <th className="px-4 py-3">Contestación</th>
                      <th className="px-4 py-3">Prueba</th>
                      <th className="px-4 py-3">Pago</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{row.userName}</div>
                          <div className="text-xs text-slate-400">
                            {row.tenantCode ? `ID cliente ${row.tenantCode}` : row.source === 'trialRequest' ? 'Solicitud web' : 'Sin ID'} · {row.tenantName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-200">{row.email}</td>
                        <td className="px-4 py-3 text-slate-200">{row.phone || '-'}</td>
                        <td className="px-4 py-3 text-slate-300">
                          <div>{formatDate(row.requestedAt || row.signedUpAt)}</div>
                          <div className="text-xs text-slate-500">
                            {row.source === 'trialRequest' ? 'Solicitud recibida' : 'Alta creada'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{row.emailStatus}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.replyStatus === 'Pendiente de mi contestación'
                              ? 'bg-amber-400/15 text-amber-100'
                              : 'bg-slate-800 text-cyan-100'
                          }`}>
                            {row.replyStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <div>{row.trialStartedAt ? `Inicio ${formatDate(row.trialStartedAt)}` : '-'}</div>
                          <div className="text-xs text-slate-500">{row.trialEndsAt ? `Fin ${formatDate(row.trialEndsAt)}` : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{formatDate(row.paidAt)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                            {row.commercialStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-300">
            Introduce el PIN para ver altas, pruebas, pagos y clientes que no siguieron.
          </section>
        )}
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}
