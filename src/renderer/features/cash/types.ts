export type Period = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
export type PrivateRangePreset = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
export type CashMovementType = 'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'
export type CommercialPaymentMethod = 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
export type CashMovementPaymentMethod = CommercialPaymentMethod | 'OTHER' | ''

export type CashRegister = {
  id: string
  openingBalance: number
  openingDenominations?: string | null
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  movements: Array<{
    id: string
    type: CashMovementType
    paymentMethod?: string | null
    amount: number
    category: string
    description: string
    user: {
      name: string
    }
  }>
}

export type LastClosure = {
  id: string
  closedAt: string | null
  nextDayFloat: number
  nextDayFloatDenominations: Record<string, number>
}

export type PrivateCashRow = {
  id: string
  saleNumber: string
  date: string
  amount: number
  description?: string | null
  clientName: string
  professionalName: string
  paymentDetail: string
  treatmentName: string
}

export type CashFilters = {
  clientId: string
  serviceId: string
  productId: string
  paymentMethod: string
  type: 'ALL' | 'SERVICE' | 'PRODUCT'
}

export type CashClientOption = {
  id: string
  firstName: string
  lastName: string
}

export type CashServiceOption = {
  id: string
  name: string
}

export type CashProductOption = {
  id: string
  name: string
}

export type CashFilterOptions = {
  clients: CashClientOption[]
  services: CashServiceOption[]
  products: CashProductOption[]
}

export type CashSummaryPeriodTotals = {
  day: number
  month: number
  year: number
}

export type CashManualAdjustments = {
  deposits: number
  expenses: number
  withdrawals: number
}

export type CashClosingSummary = {
  expectedOfficialCash: number
  officialCashCollected: number
  cardCollected: number
  bizumCollected: number
  privateCashCollected: number
  totalCollectedExcludingAbono: number
}

export type CashSummaryCards = {
  openingBalance: number
  currentBalance: number
  paymentsByMethod: Record<string, number>
  income: CashSummaryPeriodTotals
  workPerformed: CashSummaryPeriodTotals
  closingSummary: CashClosingSummary
  manualAdjustments: CashManualAdjustments
}

export type CashSummary = {
  activeCashRegister?: CashRegister | null
  cards?: Partial<CashSummaryCards>
  lastClosure?: LastClosure | null
}

export type CashAnalyticsRow = {
  saleId: string
  concept: string
  amount: number
  date: string
  itemType: 'SERVICE' | 'PRODUCT'
  productId: string | null
  quantity: number
  clientName: string
  paymentMethod: string
  professionalName: string
  saleNumber: string
  serviceId: string | null
}

export type CashRankingKey = 'services' | 'products'

export type CashRankingItem = {
  id: string | number
  name: string
  quantity: number | string
  revenue: number | string
}

export type CashRankingBucket = {
  top: CashRankingItem[]
  bottom: CashRankingItem[]
}

export type CashRanking = Partial<Record<CashRankingKey, CashRankingBucket>>

export type CashRankingGroup = {
  key: CashRankingKey
  title: string
}

export type CashHistoryEntry = {
  id: string
  date: string
  status: string
  openingBalance: number | string
  countedTotal?: number | string | null
  nextDayFloat?: number | string | null
  closingBalance?: number | string | null
  withdrawalAmount?: number | string | null
  arqueoDifference?: number | string | null
}

export type PrivateDateRange = {
  startDate: string
  endDate: string
}

export type PrivateNoTicketCashResponse = {
  rows: PrivateCashRow[]
  totalAmount: number
}
