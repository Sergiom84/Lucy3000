import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../../db'
import { AuthRequest } from '../../middleware/auth.middleware'
import { readBonoTemplates } from '../bonos/templateCatalog'
import { buildInclusiveDateRange } from '../../utils/date-range'
import { getAppointmentDisplayName, getSaleDisplayName } from '../../utils/customer-display'
import { buildSaleNumber, syncAutomaticCashMovement } from './cash'
import {
  applyAccountBalanceUsage,
  applySaleEffects,
  collectPendingPayment,
  createBonoPacksForSale,
  createPendingPayment,
  reopenPendingPayment,
  resolvePendingPayment,
  rollbackSaleEffects
} from './effects'
import {
  buildAccountBalanceReference,
  type AccountBalanceUsageInput,
  BusinessError,
  isAccountBalancePaymentMethod,
  normalizeItemsFromSale,
  PAYMENT_METHODS,
  SALE_STATUSES,
  saleInclude,
  SETTLED_PENDING_PAYMENT_METHODS,
  toHttpError,
  roundCurrency
} from './shared'
import {
  calculateTotals,
  ensureValidSaleItems,
  getBonoMatchesForSale,
  normalizeCombinedPayment,
  parseOptionalDate,
  serializePaymentBreakdown
} from './validation'

export const getSales = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, clientId, appointmentId, paymentMethod, status } = req.query

    const where: Prisma.SaleWhereInput = {}

    if (startDate && endDate) {
      where.date = buildInclusiveDateRange(startDate as string, endDate as string)
    }

    if (clientId) where.clientId = clientId as string
    if (appointmentId) where.appointmentId = appointmentId as string
    if (paymentMethod) where.paymentMethod = paymentMethod as string
    if (status) where.status = status as string

    const sales = await prisma.sale.findMany({
      where,
      include: saleInclude,
      orderBy: { date: 'desc' }
    })

    res.json(sales)
  } catch (error) {
    console.error('Get sales error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getSaleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: saleInclude
    })

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' })
    }

    res.json(sale)
  } catch (error) {
    console.error('Get sale error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createSale = async (req: AuthRequest, res: Response) => {
  try {
    const {
      clientId,
      appointmentId,
      items,
      discount,
      tax,
      paymentMethod,
      status,
      professional,
      notes,
      showInOfficialCash,
      accountBalanceUsage,
      combinedPayment: rawCombinedPayment
    } = req.body

    if (!req.user?.id) {
      throw new BusinessError(401, 'Unauthorized')
    }

    if (!PAYMENT_METHODS.includes(paymentMethod as string)) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const normalizedItems = ensureValidSaleItems(items)
    const discountValue = Number(discount) || 0
    const taxValue = Number(tax) || 0
    const { subtotal, total } = calculateTotals(normalizedItems, discountValue, taxValue)
    const bonoTemplates = await readBonoTemplates({ onlyActive: true })
    const bonoMatches = getBonoMatchesForSale(normalizedItems, bonoTemplates)
    const combinedPayment = normalizeCombinedPayment(rawCombinedPayment, total)

    if (combinedPayment && accountBalanceUsage) {
      throw new BusinessError(400, 'Account balance usage cannot be combined with combined payment payload')
    }

    let parsedAccountBalanceUsage: AccountBalanceUsageInput | null = accountBalanceUsage
      ? {
          operationDate: new Date(accountBalanceUsage.operationDate),
          referenceItem:
            typeof accountBalanceUsage.referenceItem === 'string'
              ? accountBalanceUsage.referenceItem.trim()
              : '',
          amount: roundCurrency(Number(accountBalanceUsage.amount)),
          notes: accountBalanceUsage.notes || null
        }
      : null

    if (combinedPayment && combinedPayment.accountBalanceAmount > 0) {
      parsedAccountBalanceUsage = {
        operationDate: new Date(),
        referenceItem: buildAccountBalanceReference(normalizedItems),
        amount: combinedPayment.accountBalanceAmount,
        notes: null
      }
    }

    if (isAccountBalancePaymentMethod(paymentMethod as string) && !parsedAccountBalanceUsage && !combinedPayment) {
      parsedAccountBalanceUsage = {
        operationDate: new Date(),
        referenceItem: buildAccountBalanceReference(normalizedItems),
        amount: roundCurrency(total),
        notes: null
      }
    }

    if (parsedAccountBalanceUsage && Number.isNaN(parsedAccountBalanceUsage.operationDate.getTime())) {
      throw new BusinessError(400, 'Account balance usage operation date is invalid')
    }

    if (parsedAccountBalanceUsage && !parsedAccountBalanceUsage.referenceItem) {
      throw new BusinessError(400, 'Account balance usage reference item is required')
    }

    if (
      parsedAccountBalanceUsage &&
      (!Number.isFinite(parsedAccountBalanceUsage.amount) || parsedAccountBalanceUsage.amount <= 0)
    ) {
      throw new BusinessError(400, 'Account balance usage amount must be greater than zero')
    }

    if (parsedAccountBalanceUsage && parsedAccountBalanceUsage.amount > total) {
      throw new BusinessError(400, 'Account balance usage amount cannot be greater than sale total')
    }

    let nextStatus = status || 'COMPLETED'
    if (combinedPayment) {
      nextStatus = combinedPayment.pendingAmount > 0 ? 'PENDING' : 'COMPLETED'
    }

    if (!['PENDING', 'COMPLETED'].includes(nextStatus)) {
      throw new BusinessError(400, 'Invalid sale status')
    }

    if (nextStatus !== 'COMPLETED' && parsedAccountBalanceUsage && !combinedPayment) {
      throw new BusinessError(400, 'Account balance usage requires a completed sale')
    }

    const salePaymentMethod = combinedPayment
      ? combinedPayment.pendingAmount > 0
        ? combinedPayment.primaryMethod
        : 'OTHER'
      : String(paymentMethod || '').toUpperCase()

    const paymentBreakdown =
      combinedPayment && combinedPayment.pendingAmount <= 0
        ? serializePaymentBreakdown(combinedPayment.collectedEntries)
        : null
    const officialCashTotal = combinedPayment
      ? roundCurrency(combinedPayment.cashMovement?.amount || 0)
      : parsedAccountBalanceUsage
        ? roundCurrency(total - parsedAccountBalanceUsage.amount)
        : roundCurrency(total)

    if (
      parsedAccountBalanceUsage &&
      isAccountBalancePaymentMethod(paymentMethod as string) &&
      officialCashTotal > 0 &&
      !combinedPayment
    ) {
      throw new BusinessError(400, 'Payment method ABONO requires full account balance coverage')
    }

    let shouldShowInOfficialCash = combinedPayment
      ? combinedPayment.officialCommercialAmount > 0
      : paymentMethod === 'CASH'
        ? showInOfficialCash !== false
        : true
    if (
      !combinedPayment &&
      parsedAccountBalanceUsage &&
      (isAccountBalancePaymentMethod(paymentMethod as string) || officialCashTotal <= 0)
    ) {
      shouldShowInOfficialCash = false
    }

    const sale = await prisma.$transaction(async (tx) => {
      let resolvedClientId = clientId || null
      let appointmentClientName = ''

      if (appointmentId) {
        const appointment = await tx.appointment.findUnique({
          where: { id: appointmentId },
          select: {
            id: true,
            clientId: true,
            guestName: true,
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            sale: {
              select: {
                id: true,
                saleNumber: true,
                status: true
              }
            }
          }
        })

        if (!appointment) {
          throw new BusinessError(404, 'Appointment not found')
        }

        if (appointment.sale) {
          throw new BusinessError(
            appointment.sale.status === 'COMPLETED' ? 400 : 409,
            appointment.sale.status === 'COMPLETED'
              ? `This appointment already has the completed sale${appointment.sale.saleNumber ? ` ${appointment.sale.saleNumber}` : ''}`
              : appointment.sale.status === 'PENDING'
                ? `This appointment already has the pending sale${appointment.sale.saleNumber ? ` ${appointment.sale.saleNumber}` : ''}. Open it from sales to continue the collection.`
                : `This appointment already has the linked sale${appointment.sale.saleNumber ? ` ${appointment.sale.saleNumber}` : ''}. Open it from sales history before creating a new sale.`
          )
        }

        if (resolvedClientId && resolvedClientId !== appointment.clientId) {
          throw new BusinessError(400, 'Appointment and sale client must match')
        }

        resolvedClientId = appointment.clientId
        appointmentClientName = getAppointmentDisplayName(appointment, 'Cliente general')
      }

      if (parsedAccountBalanceUsage && !resolvedClientId) {
        throw new BusinessError(400, 'Account balance usage requires a client')
      }

      if (bonoMatches.length > 0 && !resolvedClientId) {
        throw new BusinessError(400, 'Sales with bonos require a client')
      }

      if (nextStatus === 'PENDING' && !resolvedClientId) {
        throw new BusinessError(400, 'Pending sales require a client')
      }

      const saleNumber = await buildSaleNumber(tx)

      const createdSale = await tx.sale.create({
        data: {
          clientId: resolvedClientId,
          appointmentId: appointmentId || null,
          userId: req.user!.id,
          professional: professional || 'LUCY',
          saleNumber,
          subtotal,
          discount: discountValue,
          tax: taxValue,
          total,
          paymentMethod: salePaymentMethod,
          paymentBreakdown,
          showInOfficialCash: shouldShowInOfficialCash,
          status: nextStatus,
          notes: notes || null,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId || null,
              serviceId: item.serviceId || null,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.quantity * item.price
            }))
          }
        },
        include: {
          client: true,
          items: true
        }
      })

      if (nextStatus === 'COMPLETED') {
        await createBonoPacksForSale(tx, {
          saleId: createdSale.id,
          saleNumber,
          clientId: createdSale.clientId,
          notes: notes || null,
          matches: bonoMatches
        })
      }

      const clientName = createdSale.client
        ? `${createdSale.client.firstName} ${createdSale.client.lastName}`.trim()
        : appointmentClientName

      if (nextStatus === 'COMPLETED') {
        await applySaleEffects(tx, {
          saleId: createdSale.id,
          saleNumber,
          clientId: createdSale.clientId,
          clientName,
          userId: req.user!.id,
          appointmentId: createdSale.appointmentId,
          total,
          cashMovementTotal: officialCashTotal,
          paymentMethod: salePaymentMethod,
          cashMovementPaymentMethod: combinedPayment?.cashMovement?.paymentMethod,
          cashMovementShowInOfficialCash: combinedPayment?.cashMovement?.showInOfficialCash,
          showInOfficialCash: createdSale.showInOfficialCash,
          items: normalizedItems
        })

        if (parsedAccountBalanceUsage && createdSale.clientId) {
          await applyAccountBalanceUsage(tx, {
            clientId: createdSale.clientId,
            saleId: createdSale.id,
            saleNumber,
            usage: parsedAccountBalanceUsage
          })
        }
      } else if (nextStatus === 'PENDING') {
        await createPendingPayment(tx, {
          saleId: createdSale.id,
          clientId: createdSale.clientId,
          amount: total,
          createdAt: createdSale.date
        })

        if (combinedPayment) {
          const collectedEntry = combinedPayment.collectedEntries[0]
          if (collectedEntry) {
            await collectPendingPayment(tx, {
              saleId: createdSale.id,
              userId: req.user!.id,
              amount: collectedEntry.amount,
              paymentMethod: collectedEntry.paymentMethod,
              operationDate: createdSale.date,
              showInOfficialCash: collectedEntry.showInOfficialCash !== false,
              accountBalanceUsageAmount: parsedAccountBalanceUsage?.amount
            })
          }
        }
      }

      return tx.sale.findUnique({
        where: { id: createdSale.id },
        include: saleInclude
      })
    })

    res.status(201).json(sale)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Create sale error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const updateSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, paymentMethod, notes, settledAt } = req.body

    const blockedFields = [
      'items',
      'subtotal',
      'discount',
      'tax',
      'total',
      'clientId',
      'userId',
      'saleNumber',
      'appointmentId'
    ]
    const hasBlockedFields = blockedFields.some((field) => field in req.body)
    if (hasBlockedFields) {
      throw new BusinessError(400, 'Updating sale lines or links is not supported')
    }

    if (status && !SALE_STATUSES.includes(status as string)) {
      throw new BusinessError(400, 'Invalid sale status')
    }

    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod as string)) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const parsedSettledAt = parseOptionalDate(settledAt)
    if (settledAt !== undefined && !parsedSettledAt) {
      throw new BusinessError(400, 'Invalid settlement date')
    }

    const bonoTemplates = await readBonoTemplates({ onlyActive: true })

    const updatedSale = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          client: true,
          appointment: {
            select: {
              guestName: true
            }
          },
          items: true,
          pendingPayment: {
            select: {
              amount: true,
              status: true
            }
          }
        }
      })

      if (!sale) {
        throw new BusinessError(404, 'Sale not found')
      }

      const nextStatus = (status || sale.status) as string
      let nextPaymentMethod = (paymentMethod || sale.paymentMethod) as string
      const normalizedItems = normalizeItemsFromSale(sale.items)
      const bonoMatches = getBonoMatchesForSale(
        normalizedItems.map((item) => ({
          productId: item.productId,
          serviceId: item.serviceId,
          description: item.description,
          quantity: item.quantity,
          price: item.price
        })),
        bonoTemplates
      )

      if (sale.status === 'PENDING' && nextStatus === 'COMPLETED') {
        if (
          sale.pendingPayment &&
          sale.pendingPayment.status === 'OPEN' &&
          Number(sale.pendingPayment.amount || 0) < Number(sale.total || 0)
        ) {
          throw new BusinessError(
            400,
            'Use the pending collection flow to complete sales with partial pending collections'
          )
        }

        const requestedPaymentMethod = String(paymentMethod || sale.paymentMethod || '').toUpperCase()
        nextPaymentMethod = SETTLED_PENDING_PAYMENT_METHODS.includes(requestedPaymentMethod)
          ? requestedPaymentMethod
          : 'CASH'
      }

      if (nextStatus === 'PENDING') {
        if (!sale.clientId) {
          throw new BusinessError(400, 'Pending sales require a client')
        }

        const requestedPaymentMethod = String(paymentMethod || sale.paymentMethod || '').toUpperCase()
        nextPaymentMethod = SETTLED_PENDING_PAYMENT_METHODS.includes(requestedPaymentMethod)
          ? requestedPaymentMethod
          : 'CASH'
      }

      const nextShowInOfficialCash =
        nextStatus === 'PENDING'
          ? false
          : sale.status === 'PENDING' && nextStatus === 'COMPLETED'
            ? true
            : sale.showInOfficialCash

      if (sale.status === 'COMPLETED' && nextStatus !== 'COMPLETED') {
        await rollbackSaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          appointmentId: sale.appointmentId,
          total: Number(sale.total),
          items: normalizedItems
        })
      }

      const persisted = await tx.sale.update({
        where: { id },
        data: {
          status: nextStatus,
          paymentMethod: nextPaymentMethod,
          notes: notes ?? sale.notes,
          showInOfficialCash: nextShowInOfficialCash
        },
        include: {
          client: true,
          appointment: {
            select: {
              guestName: true
            }
          }
        }
      })

      if (sale.status !== 'COMPLETED' && nextStatus === 'COMPLETED') {
        if (bonoMatches.length > 0 && !sale.clientId) {
          throw new BusinessError(400, 'Sales with bonos require a client')
        }

        await createBonoPacksForSale(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          notes: notes ?? sale.notes,
          matches: bonoMatches
        })

        await applySaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          clientName: getSaleDisplayName(persisted, ''),
          userId: sale.userId,
          appointmentId: sale.appointmentId,
          total: Number(sale.total),
          paymentMethod: nextPaymentMethod,
          showInOfficialCash: nextShowInOfficialCash,
          items: normalizedItems
        })
      } else if (
        sale.status === 'COMPLETED' &&
        nextStatus === 'COMPLETED' &&
        nextPaymentMethod !== sale.paymentMethod
      ) {
        await syncAutomaticCashMovement(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientName: getSaleDisplayName(persisted, ''),
          userId: sale.userId,
          total: Number(sale.total),
          paymentMethod: nextPaymentMethod,
          showInOfficialCash: nextShowInOfficialCash
        })
      }

      if (sale.status !== 'PENDING' && nextStatus === 'PENDING') {
        await reopenPendingPayment(tx, {
          saleId: sale.id,
          clientId: sale.clientId,
          amount: Number(sale.total),
          createdAt: new Date(sale.date)
        })
      } else if (sale.status === 'PENDING' && nextStatus === 'COMPLETED') {
        await resolvePendingPayment(tx, {
          saleId: sale.id,
          resolutionStatus: 'SETTLED',
          settledAt: parsedSettledAt || new Date(),
          settledPaymentMethod: nextPaymentMethod
        })
      } else if (sale.status === 'PENDING' && nextStatus !== 'PENDING') {
        await resolvePendingPayment(tx, {
          saleId: sale.id,
          resolutionStatus: 'CANCELLED'
        })
      }

      return tx.sale.findUnique({
        where: { id },
        include: saleInclude
      })
    })

    res.json(updatedSale)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Update sale error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const collectPendingSale = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { amount, paymentMethod, operationDate, showInOfficialCash, accountBalanceUsageAmount } = req.body

    if (!req.user?.id) {
      throw new BusinessError(401, 'Unauthorized')
    }

    if (!PAYMENT_METHODS.includes(String(paymentMethod || '').toUpperCase())) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const parsedOperationDate = parseOptionalDate(operationDate)
    if (!parsedOperationDate) {
      throw new BusinessError(400, 'Invalid pending collection date')
    }

    const updatedSale = await prisma.$transaction((tx) =>
      collectPendingPayment(tx, {
        saleId: id,
        userId: req.user!.id,
        amount: roundCurrency(Number(amount)),
        paymentMethod: String(paymentMethod || '').toUpperCase(),
        operationDate: parsedOperationDate,
        showInOfficialCash: showInOfficialCash !== false,
        accountBalanceUsageAmount:
          accountBalanceUsageAmount === undefined ? undefined : roundCurrency(Number(accountBalanceUsageAmount))
      })
    )

    res.json(updatedSale)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Collect pending sale error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const deleteSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          items: true
        }
      })

      if (!sale) {
        throw new BusinessError(404, 'Sale not found')
      }

      if (sale.status === 'COMPLETED') {
        await rollbackSaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          appointmentId: sale.appointmentId,
          total: Number(sale.total),
          items: normalizeItemsFromSale(sale.items)
        })
      } else if (sale.status === 'PENDING') {
        await resolvePendingPayment(tx, {
          saleId: sale.id,
          resolutionStatus: 'CANCELLED'
        })
      }

      await tx.sale.delete({
        where: { id }
      })
    })

    res.json({ message: 'Sale deleted successfully' })
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Delete sale error:', error)
    res.status(statusCode).json({ error: message })
  }
}
