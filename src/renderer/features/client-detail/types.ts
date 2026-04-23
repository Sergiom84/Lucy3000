import type { LucideIcon } from 'lucide-react'
import type { PendingPaymentRow } from '../../utils/clientPendingPayments'
import type { ClientAssetsResponse } from '../../utils/desktop'

export type ClientDetailTab =
  | 'overview'
  | 'appointments'
  | 'sales'
  | 'pending'
  | 'bonos'
  | 'abonos'
  | 'quotes'

export type ClientDetailToolbarItem = {
  icon: LucideIcon
  label: string
  tab: ClientDetailTab
}

export type ClientDetailTabOption = {
  id: ClientDetailTab
  label: string
  count?: number
}

export type CurrencyValue = string | number | null | undefined

export type ClientDetailSaleItem = {
  description?: string | null
  price?: CurrencyValue
  quantity?: number | null
  subtotal?: CurrencyValue
  product?: {
    name?: string | null
  } | null
  service?: {
    id?: string | null
    name?: string | null
  } | null
}

export type ClientDetailSaleLabelSource = {
  items?: ClientDetailSaleItem[] | null
}

export type ClientDetailSale = ClientDetailSaleLabelSource & {
  id: string
  saleNumber?: string | null
  date: string
  total?: CurrencyValue
  subtotal?: CurrencyValue
  discount?: CurrencyValue
  status?: string | null
  paymentMethod?: string | null
  notes?: string | null
  items: ClientDetailSaleItem[]
  pendingPayment?: {
    status?: string | null
  } | null
  paymentBreakdown?: Array<{
    amount?: CurrencyValue
    paymentMethod?: string | null
    showInOfficialCash?: boolean | null
  }> | null
  accountBalanceMovements?: Array<{
    amount?: CurrencyValue
    balanceAfter?: CurrencyValue
    type?: string | null
  }> | null
}

export type ClientDetailAppointment = {
  id: string
  date: string
  startTime: string
  endTime: string
  status?: string | null
  serviceId?: string | null
  notes?: string | null
  cabin?: string | null
  user?: {
    name?: string | null
  } | null
  service?: {
    id?: string | null
    name?: string | null
  } | null
  sale?: ClientDetailSale | null
}

export type ClientDetailBonoSession = {
  id: string
  sessionNumber: number
  status: 'AVAILABLE' | 'CONSUMED'
  consumedAt: string | null
  appointment?: {
    id: string
    date: string
    startTime: string
    endTime: string
    status: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
    cabin: 'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'
  } | null
}

export type ClientDetailBonoPack = {
  id: string
  name: string
  bonoTemplateId?: string | null
  totalSessions: number
  price: string | number
  purchaseDate: string
  expiryDate: string | null
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
  notes: string | null
  service:
    | {
        id: string
        name: string
        category?: string | null
      }
    | null
  sessions: ClientDetailBonoSession[]
  clientId?: string | null
}

export type ClientDetailQuoteItem = {
  description?: string | null
  product?: {
    name?: string | null
  } | null
  service?: {
    name?: string | null
  } | null
}

export type ClientDetailQuote = {
  id: string
  quoteNumber: string
  date: string
  validUntil: string
  status: string
  professional?: string | null
  total?: CurrencyValue
  items?: ClientDetailQuoteItem[] | null
}

export type ClientDetailAccountBalanceMovement = {
  id: string
  type: string
  operationDate: string
  description: string
  amount: CurrencyValue
  balanceAfter: CurrencyValue
  paymentMethod?: string | null
  notes?: string | null
  referenceItem?: string | null
}

export type ClientDetailAccountBalanceHistoryResponse = {
  currentBalance?: number
  movements?: ClientDetailAccountBalanceMovement[]
}

export type ClientDetailAccountBalanceDraft = {
  description: string
  amount: string
  paymentMethod: 'CASH' | 'CARD' | 'BIZUM'
  operationDate: string
  notes: string
}

export type ClientDetailAssetExplorerProps = {
  clientId: string
  clientName: string
  clientAssets: ClientAssetsResponse | null
  assetsLoading: boolean
  onAssetsChange: (assets: ClientAssetsResponse) => void
  onAssetsLoadingChange: (loading: boolean) => void
}

export type ClientDetailClient = {
  id: string
  firstName: string
  lastName: string
  phone?: string | null
  email?: string | null
  birthDate?: string | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  allergies?: string | null
  isActive?: boolean | null
  externalCode?: string | null
  totalSpent?: CurrencyValue
  loyaltyPoints?: number | null
  appointments?: ClientDetailAppointment[] | null
  sales?: ClientDetailSale[] | null
  accountBalance?: CurrencyValue
  createdAt?: string | null
  updatedAt?: string | null
  activeTreatmentCount?: number | null
  activeTreatmentNames?: string | null
  linkedClient?: {
    firstName?: string | null
    lastName?: string | null
  } | null
  relationshipType?: string | null
  notes?: string | null
  bonoPacks?: ClientDetailBonoPack[] | null
  photoUrl?: string | null
  pendingAmount?: CurrencyValue
  pendingPayments?: PendingPaymentRow[]
}
