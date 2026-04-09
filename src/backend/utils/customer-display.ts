const trimText = (value: unknown) => String(value ?? '').trim()

type PersonLike = {
  firstName?: unknown
  lastName?: unknown
}

type AppointmentLike = {
  client?: (PersonLike & {
    email?: unknown
    phone?: unknown
    mobilePhone?: unknown
    landlinePhone?: unknown
  }) | null
  guestName?: unknown
  guestPhone?: unknown
}

type SaleLike = {
  client?: PersonLike | null
  appointment?: AppointmentLike | null
}

export const getPersonFullName = (person?: PersonLike | null) => {
  return `${trimText(person?.firstName)} ${trimText(person?.lastName)}`.trim()
}

export const getAppointmentDisplayName = (
  appointment?: AppointmentLike | null,
  fallback = 'Cliente puntual'
) => {
  return getPersonFullName(appointment?.client) || trimText(appointment?.guestName) || fallback
}

export const getAppointmentDisplayPhone = (appointment?: AppointmentLike | null) => {
  return (
    trimText(appointment?.client?.mobilePhone) ||
    trimText(appointment?.client?.phone) ||
    trimText(appointment?.client?.landlinePhone) ||
    trimText(appointment?.guestPhone)
  )
}

export const getAppointmentDisplayEmail = (appointment?: AppointmentLike | null) => {
  const email = trimText(appointment?.client?.email)
  return email || null
}

export const getSaleDisplayName = (sale?: SaleLike | null, fallback = 'Cliente general') => {
  return getPersonFullName(sale?.client) || getAppointmentDisplayName(sale?.appointment, fallback)
}
