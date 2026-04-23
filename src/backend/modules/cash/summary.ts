import { prisma } from '../../db'
import {
  COMMERCIAL_PAYMENT_METHODS,
  addBreakdownEntriesToBuckets,
  createCommercialPaymentBuckets,
  getPendingCollectionCollectedAmount,
  getPendingCollectionEntry,
  getSalePaymentBreakdown,
  getTopUpCollectedEntry
} from '../../utils/payment-breakdown'
import {
  accountBalanceTopUpSummarySelect,
  getCollectedRevenue,
  getWorkPerformedRevenue,
  pendingCollectionSummarySelect,
  saleSummarySelect
} from '../../utils/sales-reporting'
import {
  commercialSaleRangeWhere,
  computeExpectedBalance,
  getDayRange,
  getLastClosure,
  getPeriodRange,
  getPrivateCashCollectedAmount,
  pendingCollectionRangeWhere,
  privateCashCollectionRangeWhere,
  privateCashSaleRangeWhere,
  regularCommercialSaleRangeWhere,
  roundCurrency,
  topUpRangeWhere
} from './shared'

export const buildCashSummary = async (referenceDate: Date) => {
  const { start: dayStart, end: dayEnd } = getDayRange(referenceDate)
  const { start: monthStart, end: monthEnd } = getPeriodRange('MONTH', referenceDate)
  const { start: yearStart, end: yearEnd } = getPeriodRange('YEAR', referenceDate)

  const [
    activeCashRegister,
    daySales,
    monthSales,
    yearSales,
    dayPerformedSales,
    monthPerformedSales,
    yearPerformedSales,
    dayPrivateCashSales,
    dayCollections,
    monthCollections,
    yearCollections,
    dayPrivateCashCollections,
    dayTopUps,
    monthTopUps,
    yearTopUps
  ] = await prisma.$transaction([
    prisma.cashRegister.findFirst({
      where: { status: 'OPEN' },
      include: {
        movements: {
          include: {
            user: {
              select: { name: true }
            }
          },
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { openedAt: 'desc' }
    }),
    prisma.sale.findMany({
      where: regularCommercialSaleRangeWhere(dayStart, dayEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: regularCommercialSaleRangeWhere(monthStart, monthEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: regularCommercialSaleRangeWhere(yearStart, yearEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: commercialSaleRangeWhere(dayStart, dayEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: commercialSaleRangeWhere(monthStart, monthEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: commercialSaleRangeWhere(yearStart, yearEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: privateCashSaleRangeWhere(dayStart, dayEnd),
      select: saleSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: pendingCollectionRangeWhere(dayStart, dayEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: pendingCollectionRangeWhere(monthStart, monthEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: pendingCollectionRangeWhere(yearStart, yearEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: privateCashCollectionRangeWhere(dayStart, dayEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.accountBalanceMovement.findMany({
      where: topUpRangeWhere(dayStart, dayEnd),
      select: accountBalanceTopUpSummarySelect
    }),
    prisma.accountBalanceMovement.findMany({
      where: topUpRangeWhere(monthStart, monthEnd),
      select: accountBalanceTopUpSummarySelect
    }),
    prisma.accountBalanceMovement.findMany({
      where: topUpRangeWhere(yearStart, yearEnd),
      select: accountBalanceTopUpSummarySelect
    })
  ])

  const paymentsByMethod = createCommercialPaymentBuckets()

  for (const method of COMMERCIAL_PAYMENT_METHODS) {
    paymentsByMethod[method] = roundCurrency(paymentsByMethod[method] || 0)
  }

  for (const sale of daySales) {
    addBreakdownEntriesToBuckets(paymentsByMethod, getSalePaymentBreakdown(sale))
  }

  for (const collection of dayCollections) {
    const collectionEntry = getPendingCollectionEntry(collection)
    if (collectionEntry) {
      addBreakdownEntriesToBuckets(paymentsByMethod, [collectionEntry])
    }
  }

  for (const topUp of dayTopUps) {
    const topUpEntry = getTopUpCollectedEntry(topUp)
    if (topUpEntry) {
      addBreakdownEntriesToBuckets(paymentsByMethod, [topUpEntry])
    }
  }

  let deposits = 0
  let expenses = 0
  let withdrawals = 0

  if (activeCashRegister) {
    for (const movement of activeCashRegister.movements) {
      const amount = Number(movement.amount)
      if (movement.type === 'DEPOSIT') deposits += amount
      if (movement.type === 'EXPENSE') expenses += amount
      if (movement.type === 'WITHDRAWAL') withdrawals += amount
    }
  }

  const openingBalance = activeCashRegister ? Number(activeCashRegister.openingBalance) : 0
  const currentBalance = activeCashRegister ? computeExpectedBalance(activeCashRegister) : 0
  const lastClosure = activeCashRegister ? null : await getLastClosure()
  const privateCashCollected = getPrivateCashCollectedAmount(
    dayPerformedSales,
    dayPrivateCashSales,
    dayPrivateCashCollections
  )
  const officialCashCollected = roundCurrency(paymentsByMethod.CASH || 0)
  const cardCollected = roundCurrency(paymentsByMethod.CARD || 0)
  const bizumCollected = roundCurrency(paymentsByMethod.BIZUM || 0)

  return {
    activeCashRegister,
    lastClosure,
    cards: {
      openingBalance,
      paymentsByMethod,
      income: {
        day:
          getCollectedRevenue(daySales) +
          dayCollections.reduce((sum, collection) => sum + getPendingCollectionCollectedAmount(collection), 0) +
          dayTopUps.reduce((sum, topUp) => sum + (getTopUpCollectedEntry(topUp)?.amount || 0), 0),
        month:
          getCollectedRevenue(monthSales) +
          monthCollections.reduce((sum, collection) => sum + getPendingCollectionCollectedAmount(collection), 0) +
          monthTopUps.reduce((sum, topUp) => sum + (getTopUpCollectedEntry(topUp)?.amount || 0), 0),
        year:
          getCollectedRevenue(yearSales) +
          yearCollections.reduce((sum, collection) => sum + getPendingCollectionCollectedAmount(collection), 0) +
          yearTopUps.reduce((sum, topUp) => sum + (getTopUpCollectedEntry(topUp)?.amount || 0), 0)
      },
      workPerformed: {
        day: getWorkPerformedRevenue(dayPerformedSales),
        month: getWorkPerformedRevenue(monthPerformedSales),
        year: getWorkPerformedRevenue(yearPerformedSales)
      },
      closingSummary: {
        expectedOfficialCash: currentBalance,
        officialCashCollected,
        cardCollected,
        bizumCollected,
        privateCashCollected,
        totalCollectedExcludingAbono: roundCurrency(
          officialCashCollected + cardCollected + bizumCollected + privateCashCollected
        )
      },
      currentBalance,
      manualAdjustments: {
        deposits,
        expenses,
        withdrawals
      }
    }
  }
}
