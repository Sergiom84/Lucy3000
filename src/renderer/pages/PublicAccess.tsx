import { FormEvent, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2, LogIn, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../utils/api'

const ACCENT = '#9a5a63'
const CONTACT_EMAIL = 'sergiohernandezlara07@gmail.com'
const serifStyle = { fontFamily: '"Cormorant Garamond", ui-serif, Georgia, serif' }

const backgroundStyle = {
  backgroundImage:
    'radial-gradient(125% 125% at 50% 101%, rgba(245,87,2,1) 10.5%, rgba(245,120,2,1) 16%, rgba(245,170,100,1) 25%, rgba(238,174,202,1) 42%, rgba(202,179,214,1) 67%, rgba(148,201,233,1) 100%)'
}

const buildMailtoHref = ({ email, name, phone }: { email: string; name: string; phone: string }) => {
  const subject = encodeURIComponent('Solicitud version de prueba Lucy3000')
  const body = encodeURIComponent(
    [
      'Hola Sergio,',
      '',
      'Quiero recibir la version de prueba de 10 dias de Lucy3000.',
      '',
      `Nombre: ${name}`,
      `Email: ${email}`,
      `Telefono: ${phone || '-'}`,
      '',
      'Gracias.'
    ].join('\n')
  )

  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
}

export default function PublicAccess() {
  const [isRequestOpen, setIsRequestOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'duplicate' | 'fallback'>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  const mailtoHref = useMemo(
    () => buildMailtoHref({ email: email.trim(), name: name.trim(), phone: phone.trim() }),
    [email, name, phone]
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName || !trimmedEmail) {
      return
    }

    setStatus('sending')
    setStatusMessage('')

    try {
      const response = await api.post('/trial-requests', {
        name: trimmedName,
        email: trimmedEmail,
        phone: phone.trim()
      })

      if (response.data?.delivered) {
        setStatus('sent')
        return
      }

      setStatus('fallback')
    } catch (requestError: any) {
      if (requestError?.response?.status === 409) {
        setStatus('duplicate')
        setStatusMessage(requestError?.response?.data?.error || 'Ya existe una solicitud con estos datos.')
        return
      }

      setStatus('fallback')
    }
  }

  return (
    <main className="min-h-screen text-gray-950" style={backgroundStyle}>
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <h1
            className="text-4xl font-normal tracking-normal text-gray-950 sm:text-5xl"
            style={{ ...serifStyle, lineHeight: 1 }}
          >
            Lucy<span className="italic" style={{ color: ACCENT }}>3000</span>
          </h1>
        </header>

        <section className="flex flex-1 items-start pt-10 sm:pt-14 lg:pt-16">
          <div className="grid w-full gap-3 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setIsRequestOpen((current) => !current)}
              className="group flex min-h-[116px] items-end justify-between rounded-lg border border-white/55 bg-white/70 p-5 text-left shadow-[0_14px_42px_rgba(27,31,45,0.16)] backdrop-blur transition hover:bg-white/85 focus:outline-none focus:ring-2 focus:ring-gray-950/60"
            >
              <span
                className="text-3xl font-normal tracking-normal text-gray-950 sm:text-4xl"
                style={{ ...serifStyle, lineHeight: 0.95 }}
              >
                Solicitar informacion
              </span>
              <ArrowRight
                className={`h-5 w-5 shrink-0 transition ${isRequestOpen ? 'rotate-90' : 'group-hover:translate-x-1'}`}
                aria-hidden="true"
              />
            </button>

            <Link
              to="/login"
              className="flex min-h-[116px] items-end justify-between rounded-lg border border-gray-950 bg-gray-950 p-5 text-left text-white shadow-[0_14px_42px_rgba(27,31,45,0.2)] transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/80"
            >
              <span
                className="text-3xl font-normal tracking-normal sm:text-4xl"
                style={{ ...serifStyle, lineHeight: 0.95 }}
              >
                Ya tengo cuenta
              </span>
              <LogIn className="h-5 w-5 shrink-0" aria-hidden="true" />
            </Link>

            {isRequestOpen ? (
              <form
                onSubmit={handleSubmit}
                className="rounded-lg border border-white/65 bg-white/78 p-4 shadow-[0_14px_42px_rgba(27,31,45,0.16)] backdrop-blur lg:col-span-2 sm:p-5"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-700">
                      Email
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      className="h-10 w-full rounded-md border border-gray-300 bg-white/90 px-4 text-sm text-gray-950 outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/15"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-700">
                      Nombre
                    </span>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      autoComplete="name"
                      className="h-10 w-full rounded-md border border-gray-300 bg-white/90 px-4 text-sm text-gray-950 outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/15"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-700">
                      Teléfono
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      autoComplete="tel"
                      className="h-10 w-full rounded-md border border-gray-300 bg-white/90 px-4 text-sm text-gray-950 outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/15"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-center text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {status === 'sending' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Mail className="h-4 w-4" aria-hidden="true" />
                    )}
                    {status === 'sending'
                      ? 'Enviando solicitud...'
                      : 'Pulsa aquí si quieres recibir la versión de prueba de 10 días'}
                  </button>

                  {status === 'sending' ? (
                    <p className="text-sm font-medium text-gray-900">
                      Esta operación puede tardar unos segundos.
                    </p>
                  ) : null}

                  {status === 'sent' ? (
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                      <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />
                      Solicitud enviada. Me pondré en contacto contigo en la mayor brevedad.
                    </p>
                  ) : null}

                  {status === 'fallback' ? (
                    <p className="text-sm font-medium text-gray-900">
                      No se pudo enviar directamente.{' '}
                      <a className="underline" href={mailtoHref}>
                        Abrir correo manual
                      </a>
                    </p>
                  ) : null}

                  {status === 'duplicate' ? (
                    <p className="text-sm font-medium text-gray-900">
                      {statusMessage || 'Ya existe una solicitud con estos datos.'}
                    </p>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
