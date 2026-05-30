import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle2, Cloud, Database, FolderOpen, Laptop, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import type { DatabaseConfigMode, DatabaseConfigStatus } from '../../shared/electron'

const SUPABASE_PLACEHOLDER =
  'postgres://prisma.PROJECT_REF:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'

type DatabaseSetupProps = {
  initialStatus: DatabaseConfigStatus
}

export default function DatabaseSetup({ initialStatus }: DatabaseSetupProps) {
  const [mode, setMode] = useState<DatabaseConfigMode>('local')
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedEnvPath, setSavedEnvPath] = useState<string | null>(null)

  const modeCopy = useMemo(() => {
    if (mode === 'shared') {
      return {
        title: 'Cliente compartido',
        helper: 'Usa la URL PostgreSQL de Supabase. Copiala desde Database > Connect > Session pooler.',
        placeholder: SUPABASE_PLACEHOLDER,
        icon: Cloud
      }
    }

    return {
      title: 'Cliente local',
      helper: 'Usa SQLite en este portatil. No necesita internet, Supabase ni servidor externo.',
      icon: Laptop
    }
  }, [mode])

  const selectMode = (nextMode: DatabaseConfigMode) => {
    setMode(nextMode)
    setError(null)
    setDatabaseUrl('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const result = await window.electronAPI?.databaseConfig.configure({
        mode,
        databaseUrl: mode === 'shared' ? databaseUrl : undefined
      })

      if (!result?.success) {
        const message = result?.error || 'No se pudo guardar la configuracion.'
        setError(message)
        toast.error(message)
        return
      }

      setSavedEnvPath(result.envPath || null)
      toast.success('Configuracion guardada')
    } finally {
      setSaving(false)
    }
  }

  const relaunch = async () => {
    await window.electronAPI?.relaunch()
  }

  const openDataFolder = async () => {
    await window.electronAPI?.openRuntimeDataFolder()
  }

  if (savedEnvPath) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-950 dark:bg-gray-950 dark:text-white">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
          <section className="w-full rounded-lg border border-emerald-200 bg-white p-8 shadow-sm dark:border-emerald-900/60 dark:bg-gray-900">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-semibold">Base de datos configurada</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Lucy3000 guardo la configuracion en la carpeta de datos. Reinicia la aplicacion para arrancar el backend
              con esta conexion.
            </p>
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
              {savedEnvPath}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={relaunch} className="btn btn-primary inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Reiniciar Lucy3000
              </button>
              <button type="button" onClick={openDataFolder} className="btn btn-secondary inline-flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Abrir carpeta
              </button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  const ActiveIcon = modeCopy.icon

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-8 text-gray-950 dark:bg-gray-950 dark:text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section>
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
            <Database className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal">Configurar datos de Lucy3000</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">
            Elige donde vivira la base de datos de esta instalacion. Esta decision se guarda en un archivo local de
            configuracion y se aplica al reiniciar.
          </p>

          {initialStatus.reason ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {initialStatus.reason}
              {initialStatus.legacySqliteExists ? (
                <span className="mt-2 block">
                  Se ha detectado una base local antigua en {initialStatus.legacySqlitePath}.
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => selectMode('local')}
              className={`rounded-lg border p-4 text-left transition ${
                mode === 'local'
                  ? 'border-primary-500 bg-primary-50 text-primary-950 dark:border-primary-400 dark:bg-primary-950/40 dark:text-primary-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'
              }`}
            >
              <Laptop className="mb-4 h-6 w-6" />
              <span className="block text-sm font-semibold">Cliente local</span>
              <span className="mt-2 block text-xs leading-5 text-gray-600 dark:text-gray-300">
                Un solo portatil con SQLite local.
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectMode('shared')}
              className={`rounded-lg border p-4 text-left transition ${
                mode === 'shared'
                  ? 'border-primary-500 bg-primary-50 text-primary-950 dark:border-primary-400 dark:bg-primary-950/40 dark:text-primary-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'
              }`}
            >
              <Cloud className="mb-4 h-6 w-6" />
              <span className="block text-sm font-semibold">Cliente compartido</span>
              <span className="mt-2 block text-xs leading-5 text-gray-600 dark:text-gray-300">
                Dos portatiles conectados a Supabase.
              </span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <ActiveIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{modeCopy.title}</h2>
                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">{modeCopy.helper}</p>
              </div>
            </div>

            {mode === 'shared' ? (
              <div>
                <label className="label flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  DATABASE_URL de Supabase
                </label>
                <textarea
                  value={databaseUrl}
                  onChange={(event) => setDatabaseUrl(event.target.value)}
                  rows={4}
                  className="input resize-none font-mono text-sm leading-6"
                  placeholder={SUPABASE_PLACEHOLDER}
                  required
                />
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                Base de datos local: {initialStatus.legacySqlitePath}
                {initialStatus.legacySqliteExists ? (
                  <span className="mt-2 block text-emerald-700 dark:text-emerald-300">
                    Se conservara la base SQLite existente.
                  </span>
                ) : (
                  <span className="mt-2 block">
                    Se creara automaticamente al arrancar Lucy3000.
                  </span>
                )}
              </div>
            )}

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
              Archivo de configuracion: {initialStatus.writableEnvPath}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary inline-flex w-full items-center justify-center gap-2 py-3"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
