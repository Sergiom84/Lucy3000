import type { LucideIcon } from 'lucide-react'
import { CalendarDays, CheckCircle2, Database, Gift, Package, Scissors, Users, Wallet } from 'lucide-react'
import type { SqlWarningStep, WizardStepId } from './types'

export type WizardStep = {
  id: WizardStepId
  label: string
  shortLabel: string
  icon: LucideIcon
}

export const PAGE_SIZE = 25

export const steps: WizardStep[] = [
  { id: 'file', label: 'Archivo', shortLabel: 'Archivo', icon: Database },
  { id: 'clients', label: 'Clientes', shortLabel: 'Clientes', icon: Users },
  { id: 'services', label: 'Tratamientos', shortLabel: 'Trat.', icon: Scissors },
  { id: 'products', label: 'Productos', shortLabel: 'Prod.', icon: Package },
  { id: 'bonoTemplates', label: 'Bonos', shortLabel: 'Bonos', icon: Gift },
  { id: 'clientBonos', label: 'Bonos cliente', shortLabel: 'Bonos cli.', icon: Gift },
  { id: 'accountBalances', label: 'Abonos cliente', shortLabel: 'Abonos', icon: Wallet },
  { id: 'appointments', label: 'Citas', shortLabel: 'Citas', icon: CalendarDays },
  { id: 'summary', label: 'Resumen', shortLabel: 'Resumen', icon: CheckCircle2 }
]

export const stepWarningMap: Record<WizardStepId, SqlWarningStep | null> = {
  file: 'file',
  clients: 'clients',
  services: 'services',
  products: 'products',
  bonoTemplates: 'bonos',
  clientBonos: 'clientBonos',
  accountBalances: 'accountBalances',
  appointments: 'appointments',
  summary: null
}
