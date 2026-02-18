export const buildInclusiveDateRange = (start: string, end: string) => {
  const startDate = new Date(start)
  const endDate = new Date(end)

  startDate.setHours(0, 0, 0, 0)
  endDate.setHours(23, 59, 59, 999)

  return {
    gte: startDate,
    lte: endDate
  }
}

