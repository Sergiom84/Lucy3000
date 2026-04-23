import type { AppointmentLegendCatalogItem } from '../../utils/appointmentCatalogs'
export type { AppointmentLegendCatalogItem } from '../../utils/appointmentCatalogs'

export interface CartItem {
  id: string
  type: 'product' | 'service' | 'bono'
  name: string
  detail?: string
  category?: string
  price: number
  quantity: number
  stock?: number
  productId?: string
  serviceId?: string
  bonoTemplateId?: string
}

export interface Client {
  id: string
  firstName: string
  lastName: string
  phone: string
  email?: string
  loyaltyPoints: number
  accountBalance?: number | null
}

export interface Product {
  id: string
  name: string
  price: number
  stock: number
  category: string
  sku?: string | null
  brand?: string | null
  description?: string | null
}

export interface Service {
  id: string
  name: string
  price: number
  duration: number
  category: string
  serviceCode?: string | null
  description?: string | null
}

export interface BonoTemplate {
  id: string
  category: string
  description: string
  serviceId: string
  serviceName: string
  serviceLookup: string
  totalSessions: number
  price: number
  isActive: boolean
  createdAt: string
}

export interface Sale {
  id: string
  saleNumber: string
  date: string
  client?: Client
  appointment?: {
    guestName?: string | null
  } | null
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  paymentBreakdown?: string | null
  status: string
  items: any[]
  pendingPayment?: {
    id: string
    amount: number | string
    status: string
    createdAt: string
    settledAt?: string | null
    settledPaymentMethod?: string | null
    collections?: Array<{
      id: string
      amount: number | string
      paymentMethod: string
      showInOfficialCash?: boolean
      operationDate: string
      createdAt: string
    }>
  } | null
  accountBalanceMovements?: Array<{
    id: string
    type: string
    amount: number | string
    balanceAfter: number | string
    operationDate: string
    referenceItem?: string | null
    notes?: string | null
  }>
}

export interface AccountBalanceHistoryRow {
  id: string
  type: 'TOP_UP' | 'CONSUMPTION' | 'ADJUSTMENT'
  operationDate: string
  description: string
  referenceItem?: string | null
  amount: number
  balanceAfter: number
  notes?: string | null
  client: {
    id: string
    firstName: string
    lastName: string
  }
  sale?: {
    id: string
    saleNumber: string
    paymentMethod: string
    paymentBreakdown?: string | null
    status?: string
    pendingPayment?: {
      collections?: Array<{
        amount: number | string
        paymentMethod: string
        showInOfficialCash?: boolean
        operationDate?: string
        createdAt?: string
      }>
    } | null
  } | null
}

export type CatalogItem =
  | (Product & { type: 'product' })
  | (Service & { type: 'service' })
  | (BonoTemplate & { type: 'bono'; name: string })
export type CatalogType = 'all' | 'products' | 'services' | 'bonos'
export type SalesView = 'pos' | 'history' | 'account-balance'
export type SalePaymentMethod = 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
export type CombinedSecondaryPaymentMethod = SalePaymentMethod | 'PENDING'
export type SaleMode = 'NORMAL' | 'PENDING' | 'ON_HOLD' | 'QUOTE'
export type ResolvedCombinedPayment = {
  primaryMethod: SalePaymentMethod
  primaryAmount: number
  secondaryMethod: CombinedSecondaryPaymentMethod
  secondaryAmount: number
  cashShowInOfficialCash?: boolean
}
export type PendingSaleExecutionOptions = {
  paymentMethodOverride?: SalePaymentMethod
  accountBalanceUsageAmount?: number
  combinedPayment?: ResolvedCombinedPayment
}
export type PendingAdvanceDraft = {
  amount: string
  paymentMethod: SalePaymentMethod
}
export type CombinedPaymentDraft = {
  primaryMethod: SalePaymentMethod
  primaryAmount: string
  secondaryMethod: CombinedSecondaryPaymentMethod
}
export type PendingCollectionExecutionOptions = {
  paymentMethod: SalePaymentMethod
  printTicketAfterCollection: boolean
  showInOfficialCash: boolean
}

export type SalesCatalogState = {
  products: Product[]
  services: Service[]
  bonoTemplates: BonoTemplate[]
  professionals: string[]
  legendItems: AppointmentLegendCatalogItem[]
}

export const catalogTypeLabels: Record<Exclude<CatalogType, 'all'>, string> = {
  services: 'servicios',
  products: 'productos',
  bonos: 'bonos'
}
