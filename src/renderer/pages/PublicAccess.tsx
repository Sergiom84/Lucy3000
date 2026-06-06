import { useState } from 'react'
import { Download, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'

type PortalMode = 'new' | 'account' | 'install'

const ACCENT = '#9a5a63'
const WINDOWS_INSTALLER_URL =
  'https://github.com/Sergiom84/Lucy3000/releases/download/v2.0.0/Lucy3000.Accounting.Setup.2.0.0.exe'
const serifStyle = { fontFamily: '"Cormorant Garamond", ui-serif, Georgia, serif' }

const portalModes: Array<{ id: PortalMode; title: string }> = [
  { id: 'new', title: 'Cliente nuevo' },
  { id: 'account', title: 'Cliente con cuenta' },
  { id: 'install', title: 'Instalacion' }
]

function PortalCard({
  active,
  onClick,
  testId,
  title
}: {
  active: boolean
  onClick: () => void
  testId: string
  title: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`min-h-[116px] border p-5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
        active
          ? 'border-gray-900 bg-gray-900 text-white focus:ring-gray-900'
          : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50 focus:ring-gray-500'
      }`}
    >
      <span
        className="block text-3xl font-normal tracking-tight"
        style={{ ...serifStyle, lineHeight: 1 }}
      >
        {title}
      </span>
    </button>
  )
}

function NewClientPanel() {
  const openMail = () => {
    const subject = encodeURIComponent('Alta Lucy3000')
    window.location.href = `mailto:?subject=${subject}`
  }

  return (
    <section className="border-t border-gray-200 pt-6">
      <button
        type="button"
        onClick={openMail}
        className="inline-flex rounded-sm bg-gray-900 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-white transition hover:bg-black"
      >
        Solicitar alta
      </button>
    </section>
  )
}

function AccountPanel() {
  return (
    <section className="border-t border-gray-200 pt-6">
      <Link
        to="/login"
        className="inline-flex rounded-sm bg-gray-900 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-white transition hover:bg-black"
      >
        Ya tengo cuenta
      </Link>
    </section>
  )
}

function InstallPanel() {
  return (
    <section className="border-t border-gray-200 pt-6">
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-gray-900" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Instalador para Windows</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
              Descarga Lucy3000 para instalarla como aplicacion de escritorio en este equipo.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href={WINDOWS_INSTALLER_URL}
            className="inline-flex items-center justify-center gap-2 rounded-sm bg-gray-900 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-white transition hover:bg-black"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Descargar para Windows
          </a>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-sm border border-gray-300 bg-white px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-gray-900 transition hover:border-gray-500 hover:bg-gray-50"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Entrar sin instalar
          </Link>
        </div>
      </div>
    </section>
  )
}

export default function PublicAccess() {
  const [mode, setMode] = useState<PortalMode>('account')

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <h1
            className="text-5xl font-normal tracking-tight text-gray-900 sm:text-6xl"
            style={{ ...serifStyle, lineHeight: 1 }}
          >
            Lucy<span className="italic" style={{ color: ACCENT }}>3000</span>
          </h1>

          <Link
            to="/login"
            className="inline-flex self-start rounded-sm bg-gray-900 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-white transition hover:bg-black sm:self-auto"
          >
            Ya tengo cuenta
          </Link>
        </header>

        <section className="grid gap-4 py-8 lg:grid-cols-3">
          {portalModes.map((item) => (
            <PortalCard
              key={item.id}
              active={mode === item.id}
              title={item.title}
              testId={`public-access-${item.id}`}
              onClick={() => setMode(item.id)}
            />
          ))}
        </section>

        <section className="bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
          <h2
            className="text-4xl font-normal tracking-tight text-gray-900"
            style={{ ...serifStyle, lineHeight: 1 }}
          >
            {portalModes.find((item) => item.id === mode)?.title}
          </h2>

          {mode === 'new' ? <NewClientPanel /> : null}
          {mode === 'account' ? <AccountPanel /> : null}
          {mode === 'install' ? <InstallPanel /> : null}
        </section>

        <footer className="mt-auto pt-8 text-xs text-gray-500">Lucy3000 2026</footer>
      </div>
    </main>
  )
}
