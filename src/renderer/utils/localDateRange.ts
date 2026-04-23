const buildLocalDateRange = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)

  if (![year, month, day].every(Number.isFinite)) {
    return {
      start: new Date(`${date}T00:00:00.000Z`),
      end: new Date(`${date}T23:59:59.999Z`)
    }
  }

  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day, 23, 59, 59, 999)
  }
}

export const buildLocalDayRangeParams = (date: string) => {
  const { start, end } = buildLocalDateRange(date)

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  }
}
