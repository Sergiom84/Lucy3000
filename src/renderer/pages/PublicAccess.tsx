import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  LogIn,
  Mail,
  MonitorDown,
  Smartphone,
  UserRoundPlus
} from 'lucide-react'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'

type PortalMode = 'new' | 'account' | 'install'

type LeadForm = {
  businessName: string
  contactName: string
  email: string
  phone: string
  notes: string
}

const INITIAL_FORM: LeadForm = {
  businessName: '',
  contactName: '',
  email: '',
  phone: '',
  notes: ''
}

const modeCopy: Record<
  PortalMode,
  {
    title: string
    description: string
  }
> = {
  new: {
    title: 'Cliente nuevo',
    description: 'Prepara el alta del centro y deja listos los datos que hacen falta para activar tu ID cliente.'
  },
  account: {
    title: 'Cliente con cuenta',
    description: 'Entra con el ID cliente, usuario y contraseña que ya tienes asignados.'
  },
  install: {
    title: 'Instalación',
    description: 'Instala Lucy3000 en este dispositivo o sigue las instrucciones del navegador.'
  }
}

function buildLeadSummary(form: LeadForm) {
  return [
    'Solicitud de alta Lucy3000',
    '',
    `Centro: ${form.businessName || '-'}`,
    `Contacto: ${form.contactName || '-'}`,
    `Email: ${form.email || '-'}`,
    `Telefono: ${form.phone || '-'}`,
    `Notas: ${form.notes || '-'}`
  ].join('\n')
}

function PublicAccessCard({
  active,
  description,
  icon,
  onClick,
  testId,
  title
}: {
  active: boolean
  description: string
  icon: JSX.Element
  onClick: () => void
  testId: string
  title: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`group flex min-h-[156px] w-full flex-col justify-between rounded-lg border p-5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        active
          ? 'border-primary-300 bg-white shadow-lg shadow-primary-950/10'
          : 'border-slate-200 bg-white/85 shadow-sm hover:border-slate-300 hover:bg-white'
      }`}
    >
      <span className="flex items-start justify-between gap-4">
        <span className={`rounded-lg p-3 ${active ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-700'}`}>
          {icon}
        </span>
        <ArrowRight
          className={`h-5 w-5 transition-transform ${active ? 'text-primary-600' : 'text-slate-400 group-hover:translate-x-1'}`}
        />
      </span>
      <span>
        <span className="block text-lg font-semibold text-slate-950">{title}</span>
        <span className="mt-2 block text-sm leading-6 text-slate-600">{description}</span>
      </span>
    </button>
  )
}

function NewClientPanel() {
  const [form, setForm] = useState<LeadForm>(INITIAL_FORM)
  const summary = useMemo(() => buildLeadSummary(form), [form])
  const hasMinimumData = Boolean(form.businessName.trim() && form.contactName.trim() && form.phone.trim())

  const updateField = (field: keyof LeadForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const copySummary = async () => {
    await navigator.clipboard.writeText(summary)
    toast.success('Solicitud copiada')
  }

  const openMail = () => {
    const subject = encodeURIComponent('Solicitud de alta Lucy3000')
    const body = encodeURIComponent(summary)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Nombre del centro</span>
            <input
              value={form.businessName}
              onChange={(event) => updateField('businessName', event.target.value)}
              className="input bg-white"
              placeholder="Lucy Estetica"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Persona de contacto</span>
            <input
              value={form.contactName}
              onChange={(event) => updateField('contactName', event.target.value)}
              className="input bg-white"
              placeholder="Nombre y apellidos"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Correo</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              className="input bg-white"
              placeholder="centro@email.com"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Telefono</span>
            <input
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              className="input bg-white"
              placeholder="600 000 000"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Notas de alta</span>
          <textarea
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="input min-h-[116px] resize-y bg-white"
            placeholder="Usuarios necesarios, fecha de inicio, datos a importar..."
          />
        </label>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void copySummary()}
            disabled={!hasMinimumData}
            className="btn btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clipboard className="h-4 w-4" />
            Copiar solicitud
          </button>
          <button
            type="button"
            onClick={openMail}
            disabled={!hasMinimumData}
            className="btn btn-secondary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            Abrir correo
          </button>
        </div>
      </div>

      <aside className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Onboarding</h3>
        <ol className="mt-4 space-y-4 text-sm leading-6">
          {[
            'Recibimos los datos del centro.',
            'Creamos el tenant en estado pendiente.',
            'Te damos el ID cliente y el usuario inicial.',
            'Activamos la prueba cuando el centro confirme.'
          ].map((step) => (
            <li key={step} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  )
}

function AccountPanel() {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-950">Acceso seguro</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Usa el ID cliente del centro junto al usuario o correo y la contraseña. Si entras desde un equipo compartido,
          cierra la sesión al terminar.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Ir al login
          <LogIn className="h-4 w-4" />
        </Link>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <h3 className="font-semibold text-amber-900">Datos que necesitas</h3>
        <ul className="mt-3 space-y-2">
          <li>ID cliente</li>
          <li>Usuario o correo</li>
          <li>Contraseña</li>
        </ul>
      </div>
    </section>
  )
}

function InstallPanel() {
  const { canPromptInstall, install, isStandalone, isSupportedContext } = usePwaInstallPrompt()

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <span className="rounded-lg bg-cyan-50 p-3 text-cyan-700">
            <MonitorDown className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              {isStandalone ? 'Lucy3000 ya esta instalada' : 'Instalar en este dispositivo'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              La instalacion depende del navegador. En Chrome y Edge aparece en una ventana normal cuando el sitio cumple
              las condiciones PWA.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void install()}
            disabled={!canPromptInstall || isStandalone}
            className="btn btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Instalar app
          </button>
          <Link
            to="/login"
            className="btn btn-secondary inline-flex items-center justify-center gap-2"
          >
            Entrar sin instalar
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        {!canPromptInstall && !isStandalone ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            Si el boton no esta disponible, abre este enlace en una ventana normal de Chrome o Edge. En incognito el
            navegador puede ocultar la instalacion.
          </div>
        ) : null}

        {!isSupportedContext ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            La instalacion requiere HTTPS.
          </div>
        ) : null}
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <MonitorDown className="h-5 w-5 text-slate-600" />
            Windows
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Chrome o Edge: menu del navegador, Aplicaciones, Instalar este sitio como una aplicacion.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <Smartphone className="h-5 w-5 text-slate-600" />
            Movil
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Android: menu de Chrome, Instalar app. iPhone: compartir, Anadir a pantalla de inicio.
          </p>
        </div>
      </aside>
    </section>
  )
}

export default function PublicAccess() {
  const [mode, setMode] = useState<PortalMode>('account')
  const activeCopy = modeCopy[mode]

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <Building2 className="h-3.5 w-3.5" />
              Centro de acceso
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">Lucy3000</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              Alta, acceso e instalacion de la app para centros de estetica.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
          >
            Ya tengo cuenta
            <LogIn className="h-4 w-4" />
          </Link>
        </header>

        <section className="grid gap-4 py-8 lg:grid-cols-3">
          <PublicAccessCard
            active={mode === 'new'}
            title={modeCopy.new.title}
            description={modeCopy.new.description}
            icon={<UserRoundPlus className="h-6 w-6" />}
            testId="public-access-new-client"
            onClick={() => setMode('new')}
          />
          <PublicAccessCard
            active={mode === 'account'}
            title={modeCopy.account.title}
            description={modeCopy.account.description}
            icon={<LogIn className="h-6 w-6" />}
            testId="public-access-account"
            onClick={() => setMode('account')}
          />
          <PublicAccessCard
            active={mode === 'install'}
            title={modeCopy.install.title}
            description={modeCopy.install.description}
            icon={<Download className="h-6 w-6" />}
            testId="public-access-install"
            onClick={() => setMode('install')}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white/70 p-5 shadow-sm sm:p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-slate-950">{activeCopy.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{activeCopy.description}</p>
          </div>

          {mode === 'new' ? <NewClientPanel /> : null}
          {mode === 'account' ? <AccountPanel /> : null}
          {mode === 'install' ? <InstallPanel /> : null}
        </section>

        <footer className="mt-auto flex flex-col gap-2 pt-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Lucy3000 2026</span>
          <span>API central segura - Acceso por ID cliente</span>
        </footer>
      </div>
    </main>
  )
}
