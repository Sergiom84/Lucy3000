import { Request, Response } from 'express'
import { prisma } from '../db'

const DAY_MS = 24 * 60 * 60 * 1000

type AtRiskClient = {
  firstName: string
  lastName: string
  visitRatio: number | null
}

const syncAbandonmentNotifications = async (clients: AtRiskClient[]) => {
  if (clients.length === 0) return

  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS)
  const titles = clients.map((client) => `Riesgo de abandono: ${client.firstName} ${client.lastName}`)

  const existingNotifications = await prisma.notification.findMany({
    where: {
      type: 'ABANDONMENT_RISK',
      title: { in: titles },
      createdAt: { gte: sevenDaysAgo }
    },
    select: {
      title: true
    }
  })

  const existingTitles = new Set(existingNotifications.map((item) => item.title))

  const notificationsToCreate = clients
    .map((client) => ({
      type: 'ABANDONMENT_RISK',
      title: `Riesgo de abandono: ${client.firstName} ${client.lastName}`,
      message: `El cliente no visita desde hace más tiempo del habitual (ratio: ${client.visitRatio} dias).`,
      priority: 'HIGH'
    }))
    .filter((item) => !existingTitles.has(item.title))

  if (notificationsToCreate.length > 0) {
    await prisma.notification.createMany({
      data: notificationsToCreate
    })
  }
}

export const getClientRanking = async (_req: Request, res: Response) => {
  try {
    const [clients, completedStats, noShowStats] = await Promise.all([
      prisma.client.findMany({
        where: { isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          externalCode: true,
          loyaltyPoints: true,
          totalSpent: true,
          pendingAmount: true,
          lastVisit: true
        }
      }),
      prisma.appointment.groupBy({
        by: ['clientId'],
        where: { status: 'COMPLETED' },
        _count: { _all: true },
        _min: { date: true },
        _max: { date: true }
      }),
      prisma.appointment.groupBy({
        by: ['clientId'],
        where: { status: 'NO_SHOW' },
        _count: { _all: true }
      })
    ])

    const completedStatsByClient = new Map(completedStats.map((item) => [item.clientId, item]))
    const noShowStatsByClient = new Map(noShowStats.map((item) => [item.clientId, item._count._all]))

    const now = new Date()

    let totalRevenue = 0
    const rankings = clients.map((client) => {
      const completedStat = completedStatsByClient.get(client.id)
      const completedCount = completedStat?._count._all ?? 0
      const noShowCount = noShowStatsByClient.get(client.id) ?? 0
      const spent = Number(client.totalSpent || 0)
      const pendingAmount = Number(client.pendingAmount || 0)
      totalRevenue += spent

      const firstService = completedStat?._min.date ? new Date(completedStat._min.date) : null
      const lastService = completedStat?._max.date ? new Date(completedStat._max.date) : null
      const effectiveLastVisit = lastService ?? null

      let visitRatio: number | null = null
      if (completedCount >= 2 && firstService && lastService) {
        visitRatio =
          (lastService.getTime() - firstService.getTime()) /
          (completedCount - 1) /
          DAY_MS
      }

      let abandonmentRisk = false
      if (lastService && visitRatio !== null) {
        const daysSinceLastVisit = (now.getTime() - lastService.getTime()) / DAY_MS
        abandonmentRisk = daysSinceLastVisit > visitRatio * 1.2
      }

      return {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        name: `${client.firstName} ${client.lastName}`,
        externalCode: client.externalCode,
        loyaltyPoints: client.loyaltyPoints,
        totalSpent: spent,
        pendingAmount,
        noShowCount,
        firstService: firstService?.toISOString() || null,
        lastService: lastService?.toISOString() || null,
        lastVisit: effectiveLastVisit?.toISOString() || null,
        visitRatio: visitRatio !== null ? Math.round(visitRatio * 10) / 10 : null,
        abandonmentRisk,
        completedCount
      }
    })

    const avgRevenue = rankings.length > 0 ? totalRevenue / rankings.length : 0

    // Revenue chart: above/below average
    const aboveAvg = rankings.filter((c) => c.totalSpent >= avgRevenue).length
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
    const withNoShows = rankings.filter((c) => c.noShowCount > 0).length
    const noShowChart = [
      { name: 'Con faltas', value: withNoShows },
      { name: 'Sin faltas', value: rankings.length - withNoShows }
    ]

    const atRisk = rankings.filter((c) => c.abandonmentRisk)

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

    void syncAbandonmentNotifications(atRisk).catch((syncError) => {
      console.error('Sync abandonment notifications error:', syncError)
    })
  } catch (error) {
    console.error('Get client ranking error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
