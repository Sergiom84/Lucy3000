import { Request } from 'express'
import { prisma } from '../../db'
import { buildInclusiveDateRange } from '../../utils/date-range'
import { getSaleDisplayName } from '../../utils/customer-display'
import { getSalePrivateCashAmount } from '../../utils/payment-breakdown'
import { formatProfessionalName } from '../../utils/sales-reporting'
import { CashModuleError } from './errors'
import {
  PRIVATE_NO_TICKET_CASH_PIN,
  buildPrivateCashConcept,
  buildPrivateCashPaymentDetail
} from './shared'

type PrivateCashRow = {
  id: string
  saleNumber: string
  date: Date
  amount: number
  description: string | null
  clientName: string
  professionalName: string
  paymentDetail: string
  treatmentName: string
}

export const getPrivateNoTicketCashSalesData = async (query: Request['query'] | undefined) => {
  const safeQuery = query || {}
  const pin = String(safeQuery.pin || '').trim()

  if (pin !== PRIVATE_NO_TICKET_CASH_PIN) {
    throw new CashModuleError(403, 'PIN incorrecto')
  }

  const dateRange =
    safeQuery.startDate && safeQuery.endDate
      ? buildInclusiveDateRange(safeQuery.startDate as string, safeQuery.endDate as string)
      : null

  const [sales, collections] = await prisma.$transaction([
    prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        pendingPayment: null,
        ...(dateRange ? { date: dateRange } : {}),
        OR: [
          {
            paymentMethod: 'CASH',
            showInOfficialCash: false
          },
          {
            paymentBreakdown: {
              not: null
            }
          }
        ]
      },
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        appointment: {
          select: {
            guestName: true
          }
        },
        user: {
          select: {
            name: true
          }
        },
        items: {
          select: {
            description: true
          }
        }
      },
      orderBy: { date: 'desc' }
    }),
    prisma.pendingPaymentCollection.findMany({
      where: {
        paymentMethod: 'CASH',
        showInOfficialCash: false,
        ...(dateRange ? { operationDate: dateRange } : {})
      },
      include: {
        sale: {
          include: {
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            appointment: {
              select: {
                guestName: true
              }
            },
            user: {
              select: {
                name: true
              }
            },
            items: {
              select: {
                description: true
              }
            }
          }
        }
      },
      orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }]
    })
  ])

  const saleRows = sales
    .map((sale) => {
      const privateCashAmount = getSalePrivateCashAmount(sale)
      if (privateCashAmount <= 0) {
        return null
      }

      return {
        id: sale.id,
        saleNumber: sale.saleNumber,
        date: sale.date,
        amount: privateCashAmount,
        description: sale.notes || null,
        clientName: getSaleDisplayName(sale),
        professionalName: formatProfessionalName(sale.professional, sale.user?.name),
        paymentDetail: buildPrivateCashPaymentDetail({
          type: 'SALE',
          total: sale.total,
          paymentMethod: sale.paymentMethod,
          paymentBreakdown: sale.paymentBreakdown,
          showInOfficialCash: sale.showInOfficialCash
        }),
        treatmentName: buildPrivateCashConcept(sale.items)
      }
    })
    .filter((row): row is PrivateCashRow => Boolean(row))

  const rows = [
    ...saleRows,
    ...collections.map((collection) => ({
      id: collection.id,
      saleNumber: collection.sale.saleNumber,
      date: collection.operationDate,
      amount: Number(collection.amount),
      description: 'Cobro pendiente sin ticket',
      clientName: getSaleDisplayName(collection.sale),
      professionalName: formatProfessionalName(collection.sale.professional, collection.sale.user?.name),
      paymentDetail: buildPrivateCashPaymentDetail({
        type: 'COLLECTION'
      }),
      treatmentName: buildPrivateCashConcept(collection.sale.items)
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return {
    rows,
    totalAmount: rows.reduce((sum, row) => sum + row.amount, 0)
  }
}
