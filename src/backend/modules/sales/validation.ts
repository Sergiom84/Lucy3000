import {
  type BonoTemplate,
  findBonoTemplateForSaleItem
} from '../bonos/templateCatalog'
import {
  BusinessError,
  COMBINED_PAYMENT_METHODS,
  type SaleBonoMatch,
  type SaleItemInput,
  type StoredPaymentBreakdownEntry,
  roundCurrency
} from './shared'

export const ensureValidSaleItems = (items: unknown): SaleItemInput[] => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BusinessError(400, 'Sale must include at least one item')
  }

  return items.map((item) => {
    const row = item as SaleItemInput
    const quantity = Number(row.quantity)
    const price = Number(row.price)

    if (!row.description || !String(row.description).trim()) {
      throw new BusinessError(400, 'Each item requires a description')
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BusinessError(400, 'Each item requires a positive quantity')
    }

    if (!Number.isFinite(price) || price < 0) {
      throw new BusinessError(400, 'Each item requires a valid price')
    }

    return {
      productId: row.productId || null,
      serviceId: row.serviceId || null,
      bonoTemplateId: row.bonoTemplateId || null,
      description: String(row.description).trim(),
      quantity,
      price
    }
  })
}

export const calculateTotals = (items: SaleItemInput[], discount: number, tax: number) => {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const total = subtotal - discount + tax

  if (total < 0) {
    throw new BusinessError(400, 'Sale total cannot be negative')
  }

  return { subtotal, total }
}

export const parseOptionalDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const serializePaymentBreakdown = (entries: StoredPaymentBreakdownEntry[]) => {
  if (entries.length === 0) {
    return null
  }

  return JSON.stringify(
    entries.map((entry) => ({
      paymentMethod: entry.paymentMethod,
      amount: roundCurrency(entry.amount),
      ...(entry.showInOfficialCash === undefined ? {} : { showInOfficialCash: entry.showInOfficialCash })
    }))
  )
}

export const normalizeCombinedPayment = (combinedPayment: unknown, total: number) => {
  if (!combinedPayment || typeof combinedPayment !== 'object') {
    return null
  }

  const row = combinedPayment as {
    primaryMethod: string
    primaryAmount: number
    secondaryMethod: string
    cashShowInOfficialCash?: boolean
  }
  const primaryMethod = String(row.primaryMethod || '').trim().toUpperCase()
  const secondaryMethod = String(row.secondaryMethod || '').trim().toUpperCase()
  const primaryAmount = roundCurrency(Number(row.primaryAmount))
  const cashShowInOfficialCash = row.cashShowInOfficialCash !== false

  if (!COMBINED_PAYMENT_METHODS.includes(primaryMethod)) {
    throw new BusinessError(400, 'Invalid combined primary payment method')
  }

  if (![...COMBINED_PAYMENT_METHODS, 'PENDING'].includes(secondaryMethod)) {
    throw new BusinessError(400, 'Invalid combined secondary payment method')
  }

  if (!Number.isFinite(primaryAmount) || primaryAmount <= 0 || primaryAmount >= total) {
    throw new BusinessError(400, 'Combined primary payment amount must be greater than zero and lower than total')
  }

  if (secondaryMethod !== 'PENDING' && secondaryMethod === primaryMethod) {
    throw new BusinessError(400, 'Combined payment methods must be different')
  }

  const secondaryAmount = roundCurrency(total - primaryAmount)
  if (secondaryAmount <= 0) {
    throw new BusinessError(400, 'Combined secondary payment amount must be greater than zero')
  }

  const buildStoredEntry = (paymentMethod: string, amount: number): StoredPaymentBreakdownEntry => ({
    paymentMethod,
    amount,
    ...(paymentMethod === 'CASH' ? { showInOfficialCash: cashShowInOfficialCash } : {})
  })

  const collectedEntries: StoredPaymentBreakdownEntry[] = [
    buildStoredEntry(primaryMethod, primaryAmount),
    ...(secondaryMethod === 'PENDING' ? [] : [buildStoredEntry(secondaryMethod, secondaryAmount)])
  ]

  const accountBalanceAmount = roundCurrency(
    collectedEntries.reduce((sum, entry) => sum + (entry.paymentMethod === 'ABONO' ? entry.amount : 0), 0)
  )
  const cashEntry = collectedEntries.find((entry) => entry.paymentMethod === 'CASH') || null
  const officialCommercialAmount = roundCurrency(
    collectedEntries.reduce((sum, entry) => {
      if (entry.paymentMethod === 'ABONO') {
        return sum
      }

      if (entry.paymentMethod === 'CASH' && entry.showInOfficialCash === false) {
        return sum
      }

      return sum + entry.amount
    }, 0)
  )
  const commercialCollectedAmount = roundCurrency(
    collectedEntries.reduce((sum, entry) => sum + (entry.paymentMethod === 'ABONO' ? 0 : entry.amount), 0)
  )

  return {
    primaryMethod,
    secondaryMethod,
    primaryAmount,
    secondaryAmount,
    collectedEntries,
    accountBalanceAmount,
    officialCommercialAmount,
    pendingAmount: secondaryMethod === 'PENDING' ? secondaryAmount : 0,
    cashMovement:
      cashEntry || commercialCollectedAmount <= 0
        ? cashEntry
          ? {
              paymentMethod: 'CASH',
              amount: cashEntry.amount,
              showInOfficialCash: cashEntry.showInOfficialCash !== false
            }
          : null
        : {
            paymentMethod: 'OTHER',
            amount: commercialCollectedAmount,
            showInOfficialCash: true
          }
  }
}

const findBonoTemplateForItem = (item: SaleItemInput, templates: BonoTemplate[]) => {
  if (item.bonoTemplateId) {
    const explicitTemplate = findBonoTemplateForSaleItem(item, templates)
    if (!explicitTemplate) {
      throw new BusinessError(400, `Bono template ${item.bonoTemplateId} not found`)
    }

    return explicitTemplate
  }

  return findBonoTemplateForSaleItem(item, templates)
}

export const getBonoMatchesForSale = (items: SaleItemInput[], templates: BonoTemplate[]): SaleBonoMatch[] =>
  items
    .map((item) => {
      const template = findBonoTemplateForItem(item, templates)
      return template ? { item, template } : null
    })
    .filter((entry): entry is SaleBonoMatch => Boolean(entry))
