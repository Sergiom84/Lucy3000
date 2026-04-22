import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthRequest } from '../../../src/backend/middleware/auth.middleware'
import { collectPendingSale, createSale, deleteSale, updateSale } from '../../../src/backend/controllers/sale.controller'
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

  it('returns 409 when the appointment already has a pending sale linked', async () => {
    const tx: any = {
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-1',
          clientId: 'client-1',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          sale: {
            id: 'sale-pending-1',
            saleNumber: 'V-000099',
            status: 'PENDING'
          }
        })
      },
      sale: {
        findFirst: vi.fn(),
        create: vi.fn()
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
            productId: null,
            serviceId: 'service-1',
            description: 'Limpieza facial',
            quantity: 1,
            price: 45
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

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'This appointment already has the pending sale V-000099. Open it from sales to continue the collection.'
      })
    )
    expect(tx.sale.create).not.toHaveBeenCalled()
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

  it('creates a pending payment record when a sale is saved as pending', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-pending-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          appointmentId: null,
          date: new Date('2026-04-19T10:30:00.000Z'),
          total: 75,
          showInOfficialCash: false,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-pending-1',
          saleNumber: 'V-000100',
          total: 75,
          status: 'PENDING',
          paymentMethod: 'CASH',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          pendingPayment: {
            id: 'pending-1',
            amount: 75,
            status: 'OPEN'
          },
          items: [],
          cashMovement: null
        })
      },
      pendingPayment: {
        create: vi.fn().mockResolvedValue({ id: 'pending-1' })
      },
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          pendingAmount: 10,
          debtAlertEnabled: false,
          isActive: true
        }),
        update: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          pendingAmount: 85,
          debtAlertEnabled: true,
          isActive: true
        })
      },
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        items: [
          {
            productId: null,
            serviceId: null,
            description: 'Limpieza facial',
            quantity: 1,
            price: 75
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CASH',
        status: 'PENDING',
        notes: 'pendiente'
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.pendingPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-pending-1',
          clientId: 'client-1',
          amount: 75
        })
      })
    )
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: expect.objectContaining({
        pendingAmount: 85,
        debtAlertEnabled: true
      }),
      select: expect.any(Object)
    })
  })

  it('creates a completed sale with combined payments and stores the breakdown', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-combined-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          appointmentId: null,
          total: 200,
          showInOfficialCash: true,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-combined-1',
          saleNumber: 'V-000100',
          total: 200,
          paymentMethod: 'OTHER',
          paymentBreakdown:
            '[{"paymentMethod":"CASH","amount":80,"showInOfficialCash":true},{"paymentMethod":"CARD","amount":120}]',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          pendingPayment: null,
          accountBalanceMovements: [],
          cashMovement: { id: 'movement-1' }
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
        items: [
          {
            productId: null,
            serviceId: null,
            description: 'Limpieza facial',
            quantity: 1,
            price: 200
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        combinedPayment: {
          primaryMethod: 'CASH',
          primaryAmount: 80,
          secondaryMethod: 'CARD'
        },
        notes: 'pago mixto'
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: 'OTHER',
          paymentBreakdown:
            '[{"paymentMethod":"CASH","amount":80,"showInOfficialCash":true},{"paymentMethod":"CARD","amount":120}]'
        })
      })
    )
    expect(tx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-combined-1',
          paymentMethod: 'CASH',
          amount: 80
        })
      })
    )
  })

  it('keeps only the cash leg in private cash when a combined sale with cash is saved without ticket', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-combined-private-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          appointmentId: null,
          total: 200,
          showInOfficialCash: true,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-combined-private-1',
          saleNumber: 'V-000100',
          total: 200,
          paymentMethod: 'OTHER',
          paymentBreakdown:
            '[{"paymentMethod":"CARD","amount":120},{"paymentMethod":"CASH","amount":80,"showInOfficialCash":false}]',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          pendingPayment: null,
          accountBalanceMovements: [],
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
        items: [
          {
            productId: null,
            serviceId: null,
            description: 'Limpieza facial',
            quantity: 1,
            price: 200
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CARD',
        status: 'COMPLETED',
        showInOfficialCash: true,
        combinedPayment: {
          primaryMethod: 'CARD',
          primaryAmount: 120,
          secondaryMethod: 'CASH',
          cashShowInOfficialCash: false
        },
        notes: 'pago combinado sin ticket'
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: 'OTHER',
          showInOfficialCash: true,
          paymentBreakdown:
            '[{"paymentMethod":"CARD","amount":120},{"paymentMethod":"CASH","amount":80,"showInOfficialCash":false}]'
        })
      })
    )
    expect(tx.cashMovement.create).not.toHaveBeenCalled()
  })

  it('creates a pending sale with a combined payment and pending remainder', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-combined-pending-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          appointmentId: null,
          date: new Date('2026-04-19T10:30:00.000Z'),
          total: 200,
          showInOfficialCash: true,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'sale-combined-pending-1',
            saleNumber: 'V-000100',
            clientId: 'client-1',
            userId: 'user-1',
            appointmentId: null,
            total: 200,
            status: 'PENDING',
            paymentMethod: 'CASH',
            showInOfficialCash: true,
            notes: null,
            professional: 'LUCY',
            client: { firstName: 'Ana', lastName: 'Lopez', accountBalance: 0 },
            appointment: null,
            items: [
              {
                productId: null,
                serviceId: 'service-1',
                description: 'Limpieza facial',
                quantity: 1,
                price: 200,
                subtotal: 200
              }
            ],
            pendingPayment: {
              id: 'pending-1',
              clientId: 'client-1',
              amount: 200,
              status: 'OPEN',
              collections: []
            }
          })
          .mockResolvedValueOnce({
            id: 'sale-combined-pending-1',
            saleNumber: 'V-000100',
            total: 200,
            paymentMethod: 'CASH',
            client: { firstName: 'Ana', lastName: 'Lopez' },
            items: [],
            pendingPayment: {
              id: 'pending-1',
              amount: 100,
              status: 'OPEN',
              collections: [
                {
                  id: 'collection-1',
                  amount: 100,
                  paymentMethod: 'CASH',
                  showInOfficialCash: true,
                  operationDate: new Date('2026-04-19T10:30:00.000Z'),
                  createdAt: new Date('2026-04-19T10:30:00.000Z')
                }
              ]
            },
            accountBalanceMovements: [],
            cashMovement: null
          })
      },
      pendingPayment: {
        create: vi.fn().mockResolvedValue({ id: 'pending-1' }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      pendingPaymentCollection: {
        create: vi.fn().mockResolvedValue({ id: 'collection-1' })
      },
      product: {
        findUnique: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          pendingAmount: 200,
          debtAlertEnabled: true,
          isActive: true
        }),
        update: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'client-1',
            firstName: 'Ana',
            lastName: 'Lopez',
            pendingAmount: 400,
            debtAlertEnabled: true,
            isActive: true
          })
          .mockResolvedValueOnce({
            id: 'client-1',
            firstName: 'Ana',
            lastName: 'Lopez',
            pendingAmount: 300,
            debtAlertEnabled: true,
            isActive: true
          })
      },
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        items: [
          {
            productId: null,
            serviceId: 'service-1',
            description: 'Limpieza facial',
            quantity: 1,
            price: 200
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        combinedPayment: {
          primaryMethod: 'CASH',
          primaryAmount: 100,
          secondaryMethod: 'PENDING'
        },
        notes: 'mixto con deuda'
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.pendingPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-combined-pending-1',
          amount: 200
        })
      })
    )
    expect(tx.pendingPaymentCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-combined-pending-1',
          amount: 100,
          paymentMethod: 'CASH'
        })
      })
    )
    expect(tx.pendingPayment.update).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: {
        amount: 100
      }
    })
    expect(tx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: null,
          paymentMethod: 'CASH',
          amount: 100,
          reference: 'V-000100'
        })
      })
    )
  })

  it('registers a partial pending collection and keeps the sale pending', async () => {
    const tx: any = {
      sale: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'sale-pending-1',
            saleNumber: 'V-000100',
            clientId: 'client-1',
            userId: 'user-1',
            appointmentId: null,
            total: 200,
            status: 'PENDING',
            paymentMethod: 'CASH',
            showInOfficialCash: false,
            notes: null,
            professional: 'LUCY',
            client: { firstName: 'Ana', lastName: 'Lopez', accountBalance: 0 },
            appointment: null,
            items: [
              {
                productId: null,
                serviceId: 'service-1',
                description: 'Limpieza facial',
                quantity: 1,
                price: 200,
                subtotal: 200
              }
            ],
            pendingPayment: {
              id: 'pending-1',
              clientId: 'client-1',
              amount: 200,
              status: 'OPEN',
              collections: []
            }
          })
          .mockResolvedValueOnce({
            id: 'sale-pending-1',
            saleNumber: 'V-000100',
            status: 'PENDING',
            paymentMethod: 'CASH',
            client: { firstName: 'Ana', lastName: 'Lopez' },
            items: [],
            pendingPayment: {
              id: 'pending-1',
              amount: 120,
              status: 'OPEN',
              collections: [
                {
                  id: 'collection-1',
                  amount: 80,
                  paymentMethod: 'CARD',
                  showInOfficialCash: true,
                  operationDate: new Date('2026-04-19T11:00:00.000Z'),
                  createdAt: new Date('2026-04-19T11:00:00.000Z')
                }
              ]
            },
            accountBalanceMovements: [],
            cashMovement: null
          })
      },
      pendingPayment: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      pendingPaymentCollection: {
        create: vi.fn().mockResolvedValue({ id: 'collection-1' })
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          pendingAmount: 200,
          debtAlertEnabled: true,
          isActive: true
        }),
        update: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          pendingAmount: 120,
          debtAlertEnabled: true,
          isActive: true
        })
      },
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      params: { id: 'sale-pending-1' } as any,
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        amount: 80,
        paymentMethod: 'CARD',
        operationDate: '2026-04-19T11:00:00.000Z',
        showInOfficialCash: true
      }
    })
    const res = createMockResponse()

    await collectPendingSale(req, res)

    expect(tx.pendingPaymentCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pendingPaymentId: 'pending-1',
          saleId: 'sale-pending-1',
          amount: 80,
          paymentMethod: 'CARD'
        })
      })
    )
    expect(tx.pendingPayment.update).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: {
        amount: 120
      }
    })
    expect(tx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: null,
          paymentMethod: 'CARD',
          amount: 80,
          reference: 'V-000100'
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingPayment: expect.objectContaining({
          amount: 120,
          status: 'OPEN'
        })
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
      pendingPayment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'pending-1',
          saleId: 'sale-1',
          clientId: 'client-1',
          amount: 200,
          status: 'OPEN'
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'client-1',
            firstName: 'Ana',
            lastName: 'Lopez',
            pendingAmount: 200,
            debtAlertEnabled: true,
            isActive: true
          })
          .mockResolvedValueOnce({
            id: 'client-1',
            firstName: 'Ana',
            lastName: 'Lopez',
            pendingAmount: 0,
            debtAlertEnabled: true,
            isActive: true
          }),
        update: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          pendingAmount: 0,
          debtAlertEnabled: true,
          isActive: true
        })
      },
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
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
          status: 'COMPLETED',
          showInOfficialCash: true
        })
      })
    )
    expect(tx.pendingPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { saleId: 'sale-1' },
        data: expect.objectContaining({
          status: 'SETTLED',
          settledPaymentMethod: 'CASH'
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
      appointment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
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
    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appointment-1',
        status: 'COMPLETED'
      },
      data: {
        status: 'SCHEDULED'
      }
    })
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
      pendingPayment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'pending-1',
          saleId: 'sale-pending',
          clientId: 'client-1',
          amount: 120,
          status: 'OPEN'
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'client-1',
            firstName: 'Ana',
            lastName: 'Lopez',
            pendingAmount: 120,
            debtAlertEnabled: true,
            isActive: true
          })
          .mockResolvedValueOnce({
            id: 'client-1',
            firstName: 'Ana',
            lastName: 'Lopez',
            pendingAmount: 0,
            debtAlertEnabled: true,
            isActive: true
          }),
        update: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          pendingAmount: 0,
          debtAlertEnabled: true,
          isActive: true
        })
      },
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
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
        data: expect.objectContaining({ status: 'COMPLETED', showInOfficialCash: true })
      })
    )
    expect(tx.pendingPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { saleId: 'sale-pending' },
        data: expect.objectContaining({
          status: 'SETTLED',
          settledPaymentMethod: 'CARD'
        })
      })
    )
  })

  it('restores the linked appointment when deleting a completed sale', async () => {
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
          items: []
        }),
        delete: vi.fn().mockResolvedValue(undefined)
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
      appointment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
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
      params: { id: 'sale-1' }
    })
    const res = createMockResponse()

    await deleteSale(req as any, res)

    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appointment-1',
        status: 'COMPLETED'
      },
      data: {
        status: 'SCHEDULED'
      }
    })
    expect(tx.sale.delete).toHaveBeenCalledWith({ where: { id: 'sale-1' } })
    expect(res.json).toHaveBeenCalledWith({ message: 'Sale deleted successfully' })
  })
})
