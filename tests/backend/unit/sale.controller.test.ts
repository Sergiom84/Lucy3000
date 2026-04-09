import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthRequest } from '../../../src/backend/middleware/auth.middleware'
import { createSale, updateSale } from '../../../src/backend/controllers/sale.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('sale.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('creates a sale linked to an appointment and creates automatic cash movement', async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'file:./prisma/lucy3000.db'

    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          appointmentId: 'appointment-1',
          total: 100,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000100',
          total: 100,
          paymentMethod: 'CASH',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          cashMovement: { id: 'movement-1' }
        })
      },
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-1',
          clientId: 'client-1',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          sale: null
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'product-1', name: 'Shampoo', stock: 10 }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        appointmentId: 'appointment-1',
        items: [
          {
            productId: 'product-1',
            serviceId: null,
            description: 'Shampoo',
            quantity: 2,
            price: 50
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CASH',
        notes: 'ok'
      }
    })

    const res = createMockResponse()

    try {
      await createSale(req, res)
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl
      }
    }

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { status: 'COMPLETED' }
    })
    expect(tx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashRegisterId: 'cash-1',
          saleId: 'sale-1',
          paymentMethod: 'CASH'
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ saleNumber: 'V-000100' }))
  })

  it('creates bono packs when a completed sale includes bono items', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: 'bono-template-1',
          category: 'Bonos',
          description: 'Bono 5 sesiones',
          serviceId: 'service-1',
          serviceName: 'Limpieza facial',
          serviceLookup: 'LIMPIEZA',
          totalSessions: 5,
          price: 100,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ])
    })

    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          appointmentId: null,
          total: 200,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000100',
          total: 200,
          paymentMethod: 'CASH',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          cashMovement: { id: 'movement-1' }
        })
      },
      bonoPack: {
        create: vi.fn().mockResolvedValue({ id: 'bono-pack-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        appointmentId: null,
        items: [
          {
            productId: null,
            serviceId: 'service-1',
            bonoTemplateId: 'bono-template-1',
            description: 'Bono 5 sesiones',
            quantity: 2,
            price: 100
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        notes: 'ok'
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.bonoPack.create).toHaveBeenCalledTimes(2)
    expect(tx.bonoPack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          name: 'Bono 5 sesiones',
          serviceId: 'service-1',
          totalSessions: 5,
          price: 100,
          notes: expect.stringContaining('BONO_SALE:sale-1')
        })
      })
    )
  })

  it('returns 400 when a bono sale has no client', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: 'bono-template-1',
          category: 'Bonos',
          description: 'Bono 5 sesiones',
          serviceId: 'service-1',
          serviceName: 'Limpieza facial',
          serviceLookup: 'LIMPIEZA',
          totalSessions: 5,
          price: 100,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ])
    })

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({}))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: null,
        appointmentId: null,
        items: [
          {
            productId: null,
            serviceId: 'service-1',
            bonoTemplateId: 'bono-template-1',
            description: 'Bono 5 sesiones',
            quantity: 1,
            price: 100
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        notes: null
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Sales with bonos require a client'
      })
    )
  })

  it('creates bono packs when a pending sale is completed', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: 'bono-template-1',
          category: 'Bonos',
          description: 'Bono 5 sesiones',
          serviceId: 'service-1',
          serviceName: 'Limpieza facial',
          serviceLookup: 'LIMPIEZA',
          totalSessions: 5,
          price: 100,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ])
    })

    const tx: any = {
      sale: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-1',
          clientId: 'client-1',
          userId: 'user-1',
          appointmentId: null,
          saleNumber: 'V-000100',
          total: 200,
          status: 'PENDING',
          paymentMethod: 'CASH',
          showInOfficialCash: true,
          notes: null,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [
            {
              productId: null,
              serviceId: 'service-1',
              description: 'Bono 5 sesiones',
              quantity: 2,
              price: 100
            }
          ]
        }),
        update: vi.fn().mockResolvedValue({
          client: { firstName: 'Ana', lastName: 'Lopez' }
        })
      },
      bonoPack: {
        create: vi.fn().mockResolvedValue({ id: 'bono-pack-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      appointment: {
        update: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'sale-1' },
      body: { status: 'COMPLETED' }
    })
    const res = createMockResponse()

    await updateSale(req as any, res)

    expect(tx.bonoPack.create).toHaveBeenCalledTimes(2)
    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED'
        })
      })
    )
  })

  it('auto-consumes account balance when payment method is ABONO and usage payload is omitted', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'sale-2',
          saleNumber: 'V-000001',
          clientId: 'client-1',
          appointmentId: null,
          total: 50,
          showInOfficialCash: false,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-2',
          saleNumber: 'V-000001',
          total: 50,
          paymentMethod: 'ABONO',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          cashMovement: null
        })
      },
      product: {
        findUnique: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        findUnique: vi.fn().mockResolvedValue({ id: 'client-1', accountBalance: 50 }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        appointmentId: null,
        items: [
          {
            productId: null,
            serviceId: null,
            description: 'Limpieza facial',
            quantity: 1,
            price: 50
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'ABONO',
        notes: null
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: 'ABONO',
          showInOfficialCash: false
        })
      })
    )
    expect(tx.accountBalanceMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          saleId: 'sale-2',
          type: 'CONSUMPTION',
          amount: 50,
          balanceAfter: 0
        })
      })
    )
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { accountBalance: 0 }
    })
    expect(tx.cashMovement.create).not.toHaveBeenCalled()
  })

  it('creates bono packs when a completed sale includes bono templates', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: '9b3201f9-d529-4421-9f67-efca972f8390',
          category: 'Facial',
          description: 'Bono verano',
          serviceId: '11111111-1111-4111-8111-111111111111',
          serviceName: 'Limpieza facial',
          serviceLookup: 'LF',
          totalSessions: 5,
          price: 120,
          isActive: true,
          createdAt: '2026-03-30T00:00:00.000Z'
        }
      ])
    })

    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000100' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-bono',
          saleNumber: 'V-000101',
          clientId: 'client-1',
          appointmentId: null,
          total: 240,
          showInOfficialCash: true,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-bono',
          saleNumber: 'V-000101',
          total: 240,
          paymentMethod: 'CARD',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          cashMovement: null
        })
      },
      bonoPack: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      product: {
        findUnique: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        appointmentId: null,
        items: [
          {
            productId: null,
            serviceId: '11111111-1111-4111-8111-111111111111',
            bonoTemplateId: '9b3201f9-d529-4421-9f67-efca972f8390',
            description: 'Bono verano',
            quantity: 2,
            price: 120
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CARD',
        status: 'COMPLETED',
        notes: 'venta mostrador'
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.bonoPack.create).toHaveBeenCalledTimes(2)
    expect(tx.bonoPack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          name: 'Bono verano',
          serviceId: '11111111-1111-4111-8111-111111111111',
          totalSessions: 5,
          price: 120,
          notes: expect.stringContaining('BONO_SALE:sale-bono')
        })
      })
    )
  })

  it('returns 400 when payment method is ABONO without a client', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({}))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: null,
        appointmentId: null,
        items: [
          {
            productId: null,
            serviceId: null,
            description: 'Limpieza facial',
            quantity: 1,
            price: 45
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'ABONO',
        notes: null
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Account balance usage requires a client'
      })
    )
  })

  it('returns 400 when stock is insufficient', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000001',
          clientId: null,
          total: 200,
          client: null,
          items: []
        })
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'product-1', name: 'Mask', stock: 1 }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: null,
        items: [
          {
            productId: 'product-1',
            serviceId: null,
            description: 'Mask',
            quantity: 2,
            price: 100
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CARD',
        notes: null
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Insufficient stock')
      })
    )
  })

  it('reverts automatic cash movement when a completed sale is cancelled', async () => {
    const tx: any = {
      sale: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-1',
          clientId: 'client-1',
          userId: 'user-1',
          appointmentId: 'appointment-1',
          saleNumber: 'V-000100',
          total: 80,
          status: 'COMPLETED',
          paymentMethod: 'CARD',
          notes: null,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue({ id: 'movement-1' }),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      bonoPack: {
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      saleItems: {},
      product: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    tx.sale.findUnique = vi.fn().mockResolvedValue({
      id: 'sale-1',
      clientId: 'client-1',
      userId: 'user-1',
      appointmentId: 'appointment-1',
      saleNumber: 'V-000100',
      total: 80,
      status: 'COMPLETED',
      paymentMethod: 'CARD',
      notes: null,
      client: { firstName: 'Ana', lastName: 'Lopez' },
      items: []
    })
    tx.sale.update = vi.fn().mockResolvedValue(undefined)

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'sale-1' },
      body: { status: 'CANCELLED' }
    })
    const res = createMockResponse()

    await updateSale(req as any, res)

    expect(tx.cashMovement.delete).toHaveBeenCalledWith({ where: { saleId: 'sale-1' } })
  })

  it('creates bono packs when a pending sale is marked as completed', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: '9b3201f9-d529-4421-9f67-efca972f8390',
          category: 'Facial',
          description: 'Bono verano',
          serviceId: '11111111-1111-4111-8111-111111111111',
          serviceName: 'Limpieza facial',
          serviceLookup: 'LF',
          totalSessions: 5,
          price: 120,
          isActive: true,
          createdAt: '2026-03-30T00:00:00.000Z'
        }
      ])
    })

    const tx: any = {
      sale: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'sale-pending',
            clientId: 'client-1',
            userId: 'user-1',
            appointmentId: null,
            saleNumber: 'V-000200',
            total: 120,
            status: 'PENDING',
            paymentMethod: 'CARD',
            showInOfficialCash: true,
            notes: 'pendiente',
            client: { firstName: 'Ana', lastName: 'Lopez' },
            items: [
              {
                productId: null,
                serviceId: '11111111-1111-4111-8111-111111111111',
                description: 'Bono verano',
                quantity: 1,
                price: 120
              }
            ]
          })
          .mockResolvedValueOnce({
            id: 'sale-pending',
            saleNumber: 'V-000200',
            total: 120,
            paymentMethod: 'CARD',
            client: { firstName: 'Ana', lastName: 'Lopez' },
            items: [],
            cashMovement: null
          }),
        update: vi.fn().mockResolvedValue({
          id: 'sale-pending',
          client: { firstName: 'Ana', lastName: 'Lopez' }
        })
      },
      bonoPack: {
        create: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([])
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'sale-pending' },
      body: { status: 'COMPLETED' }
    })
    const res = createMockResponse()

    await updateSale(req as any, res)

    expect(tx.bonoPack.create).toHaveBeenCalledTimes(1)
    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-pending' },
        data: expect.objectContaining({ status: 'COMPLETED' })
      })
    )
  })
})
