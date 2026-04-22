import { vi } from 'vitest'

export const prismaMock: any = {
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $disconnect: vi.fn(),

  user: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn()
  },

  sale: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  pendingPayment: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },

  pendingPaymentCollection: {
    findMany: vi.fn(),
    create: vi.fn()
  },

  client: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
    update: vi.fn()
  },

  clientHistory: {
    findMany: vi.fn(),
    create: vi.fn()
  },

  bonoPack: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  bonoSession: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },

  accountBalanceMovement: {
    count: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn()
  },

  appointment: {
    count: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn()
  },

  appointmentService: {
    createMany: vi.fn()
  },

  agendaBlock: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn()
  },

  agendaDayNote: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  dashboardReminder: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },

  service: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    delete: vi.fn()
  },

  appointmentLegend: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  product: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    delete: vi.fn()
  },

  stockMovement: {
    create: vi.fn(),
    findMany: vi.fn()
  },

  cashRegister: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },

  cashMovement: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  cashCount: {
    findMany: vi.fn(),
    create: vi.fn()
  },

  notification: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn()
  },

  setting: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn()
  },

  quote: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  googleCalendarConfig: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}

const resetObjectMocks = (value: any) => {
  if (!value || typeof value !== 'object') return

  for (const item of Object.values(value)) {
    if (typeof item === 'function' && 'mockReset' in item) {
      ;(item as any).mockReset()
      continue
    }

    resetObjectMocks(item)
  }
}

export const resetPrismaMock = () => {
  resetObjectMocks(prismaMock)
}
