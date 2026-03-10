import { vi } from 'vitest'

export const prismaMock: any = {
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),

  user: {
    findUnique: vi.fn(),
    create: vi.fn()
  },

  sale: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  client: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },

  appointment: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn()
  },

  service: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },

  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
    update: vi.fn()
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
