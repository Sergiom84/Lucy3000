import { Request, Response } from 'express'
import { prisma } from '../db'

export const getClientRanking = async (_req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        loyaltyPoints: true,
        totalSpent: true,
        appointments: {
          select: {
            date: true,
            status: true
          },
          orderBy: { date: 'asc' }
        }
      }
    })

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    let totalRevenue = 0
    const rankings = clients.map(client => {
      const spent = Number(client.totalSpent || 0)
      totalRevenue += spent

      const completed = client.appointments
        .filter(a => a.status === 'COMPLETED')
        .map(a => new Date(a.date).getTime())
        .sort((a, b) => a - b)

      const noShowCount = client.appointments.filter(a => a.status === 'NO_SHOW').length

      const firstService = completed.length > 0 ? new Date(completed[0]) : null
      const lastService = completed.length > 0 ? new Date(completed[completed.length - 1]) : null

      let visitRatio: number | null = null
      if (completed.length >= 2) {
        let totalGap = 0
        for (let i = 1; i < completed.length; i++) {
          totalGap += completed[i] - completed[i - 1]
        }
        visitRatio = totalGap / (completed.length - 1) / (1000 * 60 * 60 * 24)
      }

      let abandonmentRisk = false
      if (lastService && visitRatio !== null) {
        const daysSinceLastVisit = (now.getTime() - lastService.getTime()) / (1000 * 60 * 60 * 24)
        abandonmentRisk = daysSinceLastVisit > visitRatio * 1.2
      }

      return {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        name: `${client.firstName} ${client.lastName}`,
        loyaltyPoints: client.loyaltyPoints,
        totalSpent: spent,
        noShowCount,
        firstService: firstService?.toISOString() || null,
        lastService: lastService?.toISOString() || null,
        visitRatio: visitRatio !== null ? Math.round(visitRatio * 10) / 10 : null,
        abandonmentRisk,
        completedCount: completed.length
      }
    })

    const avgRevenue = rankings.length > 0 ? totalRevenue / rankings.length : 0

    // Revenue chart: above/below average
    const aboveAvg = rankings.filter(c => c.totalSpent >= avgRevenue).length
    const belowAvg = rankings.length - aboveAvg
    const revenueChart = [
      { name: 'Por encima', value: aboveAvg },
      { name: 'Por debajo', value: belowAvg }
    ]

    // Frequency chart: buckets by visitRatio
    const freq = { '7': 0, '8-15': 0, '16-30': 0, '>30': 0 }
    for (const c of rankings) {
      if (c.visitRatio === null) continue
      if (c.visitRatio <= 7) freq['7']++
      else if (c.visitRatio <= 15) freq['8-15']++
      else if (c.visitRatio <= 30) freq['16-30']++
      else freq['>30']++
    }
    const frequencyChart = [
      { name: '<=7 dias', value: freq['7'] },
      { name: '8-15 dias', value: freq['8-15'] },
      { name: '16-30 dias', value: freq['16-30'] },
      { name: '>30 dias', value: freq['>30'] }
    ]

    // No-show chart
    const withNoShows = rankings.filter(c => c.noShowCount > 0).length
    const noShowChart = [
      { name: 'Con faltas', value: withNoShows },
      { name: 'Sin faltas', value: rankings.length - withNoShows }
    ]

    // Create abandonment risk notifications (deduplicated 7 days)
    const atRisk = rankings.filter(c => c.abandonmentRisk)
    for (const client of atRisk) {
      const title = `Riesgo de abandono: ${client.firstName} ${client.lastName}`
      const existing = await prisma.notification.findFirst({
        where: {
          type: 'ABANDONMENT_RISK',
          title,
          createdAt: { gte: sevenDaysAgo }
        }
      })
      if (!existing) {
        await prisma.notification.create({
          data: {
            type: 'ABANDONMENT_RISK',
            title,
            message: `El cliente no visita desde hace más tiempo del habitual (ratio: ${client.visitRatio} dias).`,
            priority: 'HIGH'
          }
        })
      }
    }

    res.json({
      clients: rankings,
      totalClients: rankings.length,
      atRiskCount: atRisk.length,
      avgRevenue: Math.round(avgRevenue * 100) / 100,
      charts: {
        revenue: revenueChart,
        frequency: frequencyChart,
        noShows: noShowChart
      }
    })
  } catch (error) {
    console.error('Get client ranking error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
