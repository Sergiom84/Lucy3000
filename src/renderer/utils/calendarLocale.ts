import { dateFnsLocalizer } from 'react-big-calendar'
import {
  addDays,
  endOfWeek,
  format,
  getDay,
  parse,
  startOfWeek,
  type StartOfWeekOptions
} from 'date-fns'
import { es } from 'date-fns/locale'

export const calendarCulture = 'es'

const calendarLocale = es
const calendarLocales = {
  es: calendarLocale
}

const normalizeFormatPattern = (pattern: string) => {
  switch (pattern) {
    case 'ddd':
      return 'EEE'
    case 'DD ddd':
      return 'dd EEE'
    case 'dddd D MMM':
      return 'EEEE d MMM'
    case 'MMMM YYYY':
      return 'MMMM yyyy'
    case 'ddd D MMM':
      return 'EEE d MMM'
    case 'D MMM':
      return 'd MMM'
    case 'dddd D [de] MMMM':
      return "EEEE d 'de' MMMM"
    default:
      return pattern
  }
}

const startOfSpanishWeek = (value: Date | string | number, options?: StartOfWeekOptions) =>
  startOfWeek(value, {
    ...options,
    locale: calendarLocale,
    weekStartsOn: 1
  })

export const calendarLocalizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: startOfSpanishWeek,
  getDay,
  locales: calendarLocales
})

export const formatCalendarText = (value: Date | string | number, pattern: string) =>
  format(new Date(value), normalizeFormatPattern(pattern), { locale: calendarLocale })

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value)

export const calendarMessages = {
  allDay: 'Todo el día',
  previous: 'Anterior',
  next: 'Siguiente',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Cita',
  noEventsInRange: 'No hay citas en este rango',
  showMore: (total: number) => `+${total}`
}

export const calendarFormats = {
  weekdayFormat: (value: Date) => formatCalendarText(value, 'ddd').replace('.', ''),
  dayFormat: (value: Date) => formatCalendarText(value, 'DD ddd').replace('.', ''),
  dayHeaderFormat: (value: Date) => capitalize(formatCalendarText(value, 'dddd D MMM')),
  monthHeaderFormat: (value: Date) => capitalize(formatCalendarText(value, 'MMMM YYYY')),
  agendaDateFormat: (value: Date) => capitalize(formatCalendarText(value, 'ddd D MMM').replace('.', '')),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${capitalize(formatCalendarText(start, 'D MMM'))} - ${capitalize(formatCalendarText(end, 'D MMM'))}`
}

const weekStart = startOfWeek(new Date(), {
  locale: calendarLocale,
  weekStartsOn: 1
})

export const calendarWeekDays = Array.from({ length: 7 }, (_, index) =>
  format(addDays(weekStart, index), 'EEEEEE', { locale: calendarLocale })
    .replace('.', '')
    .toUpperCase()
)

export const startOfCalendarWeek = (value: Date | string | number) =>
  startOfSpanishWeek(new Date(value))

export const endOfCalendarWeek = (value: Date | string | number) =>
  endOfWeek(new Date(value), {
    locale: calendarLocale,
    weekStartsOn: 1
  })
