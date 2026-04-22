import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBonoPack,
  createBonoAppointment,
  consumeSession,
  consumeAccountBalance,
  createAccountBalanceTopUp,
  getAccountBalanceHistory,
  updateBonoPack
} from '../../../src/backend/controllers/bono.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('bono.controller createBonoPack', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('stores bonoTemplateId when the pack comes from the imported catalog', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-antiacne-6',
          category: 'Facial',
          description: 'Bono de 6 sesiones',
          serviceId: 'service-antiacne',
          serviceName: 'Antiacne',
          serviceLookup: 'ANTI',
          totalSessions: 6,
          price: 199,
          isActive: true,
          createdAt: '2026-04-21T00:00:00.000Z'
        }
      ])
    })
    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-antiacne'
    })
    prismaMock.bonoPack.create.mockResolvedValue({
      id: 'bono-pack-antiacne',
      name: 'Bono de 6 sesiones - Antiacne',
      bonoTemplateId: 'template-antiacne-6',
      serviceId: 'service-antiacne',
      sessions: [],
      service: {
        id: 'service-antiacne',
        name: 'Antiacne',
        category: 'Facial',
        serviceCode: 'ANTI'
      }
    })

    const req = createMockRequest({
      body: {
        clientId: 'client-1',
        name: 'Bono de 6 sesiones - Antiacne',
        serviceId: 'service-antiacne',
        bonoTemplateId: 'template-antiacne-6',
        totalSessions: 6,
        price: 199
      }
    })
    const res = createMockResponse()

    await createBonoPack(req as any, res)

    expect(prismaMock.bonoPack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          name: 'Bono de 6 sesiones - Antiacne',
          serviceId: 'service-antiacne',
          bonoTemplateId: 'template-antiacne-6',
          totalSessions: 6,
          price: 199
        })
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bono-pack-antiacne',
        bonoTemplateId: 'template-antiacne-6'
      })
    )
  })
})

describe('bono.controller updateBonoPack', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('adds sessions when increasing totalSessions to correct an extra consumed session', async () => {
    prismaMock.setting.findUnique.mockResolvedValue(null)
    prismaMock.bonoPack.findUnique
      .mockResolvedValueOnce({
        id: 'bono-pack-1',
        clientId: 'client-1',
        name: 'Rollaction 5 sesiones',
        totalSessions: 5,
        status: 'ACTIVE',
        serviceId: 'service-1',
        bonoTemplateId: null,
        service: { id: 'service-1', name: 'Rollaction', category: 'Corporal', serviceCode: 'ROLL' },
        sessions: [
          { id: 'session-1', sessionNumber: 1, status: 'CONSUMED', appointmentId: null, appointment: null },
          { id: 'session-2', sessionNumber: 2, status: 'CONSUMED', appointmentId: null, appointment: null },
          { id: 'session-3', sessionNumber: 3, status: 'AVAILABLE', appointmentId: null, appointment: null },
          { id: 'session-4', sessionNumber: 4, status: 'AVAILABLE', appointmentId: null, appointment: null },
          { id: 'session-5', sessionNumber: 5, status: 'AVAILABLE', appointmentId: null, appointment: null }
        ]
      })
      .mockResolvedValueOnce({
        id: 'bono-pack-1',
        clientId: 'client-1',
        name: 'Rollaction 5 sesiones',
        totalSessions: 6,
        status: 'ACTIVE',
        serviceId: 'service-1',
        bonoTemplateId: null,
        service: { id: 'service-1', name: 'Rollaction', category: 'Corporal', serviceCode: 'ROLL' },
        sessions: [
          { id: 'session-1', sessionNumber: 1, status: 'CONSUMED', appointmentId: null, appointment: null },
          { id: 'session-2', sessionNumber: 2, status: 'CONSUMED', appointmentId: null, appointment: null },
          { id: 'session-3', sessionNumber: 3, status: 'AVAILABLE', appointmentId: null, appointment: null },
          { id: 'session-4', sessionNumber: 4, status: 'AVAILABLE', appointmentId: null, appointment: null },
          { id: 'session-5', sessionNumber: 5, status: 'AVAILABLE', appointmentId: null, appointment: null },
          { id: 'session-6', sessionNumber: 6, status: 'AVAILABLE', appointmentId: null, appointment: null }
        ]
      })
    prismaMock.service.findUnique.mockResolvedValue({ id: 'service-1' })

    const tx = {
      bonoSession: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn()
      },
      bonoPack: {
        update: vi.fn().mockResolvedValue({ id: 'bono-pack-1' })
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { bonoPackId: 'bono-pack-1' },
      body: {
        name: 'Rollaction 5 sesiones',
        serviceId: 'service-1',
        bonoTemplateId: null,
        totalSessions: 6,
        price: 249,
        expiryDate: null,
        notes: 'Corrección manual'
      }
    })
    const res = createMockResponse()

    await updateBonoPack(req as any, res)

    expect(tx.bonoSession.createMany).toHaveBeenCalledWith({
      data: [
        {
          bonoPackId: 'bono-pack-1',
          sessionNumber: 6
        }
      ]
    })
    expect(tx.bonoPack.update).toHaveBeenCalledWith({
      where: { id: 'bono-pack-1' },
      data: expect.objectContaining({
        totalSessions: 6,
        status: 'ACTIVE',
        notes: 'Corrección manual'
      })
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bono-pack-1',
        totalSessions: 6
      })
    )
  })
})

describe('bono.controller account balance', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('creates a top-up and updates client account balance', async () => {
    const tx: any = {
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          firstName: 'Ana',
          lastName: 'Lopez',
          accountBalance: 10
        }),
        update: vi.fn().mockResolvedValue({ id: 'client-1', accountBalance: 30 })
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue({
          id: 'movement-1',
          clientId: 'client-1',
          saleId: null,
          type: 'TOP_UP',
          paymentMethod: 'CARD',
          operationDate: new Date('2026-03-15T09:00:00.000Z'),
          description: 'Regalo para mi hija',
          referenceItem: null,
          amount: 20,
          balanceAfter: 30,
          notes: null,
          createdAt: new Date('2026-03-15T09:00:00.000Z')
        })
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        create: vi.fn().mockResolvedValue({
          id: 'cash-movement-1'
        })
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { clientId: 'client-1' },
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        description: 'Regalo para mi hija',
        amount: 20,
        paymentMethod: 'CARD',
        operationDate: '2026-03-15',
        notes: null
      }
    })
    const res = createMockResponse()

    await createAccountBalanceTopUp(req as any, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { accountBalance: 30 }
    })
    expect(tx.accountBalanceMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          type: 'TOP_UP',
          paymentMethod: 'CARD',
          amount: 20,
          balanceAfter: 30
        })
      })
    )
    expect(tx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashRegisterId: 'cash-1',
          userId: 'user-1',
          type: 'INCOME',
          paymentMethod: 'CARD',
          amount: 20,
          category: 'Abonos'
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        currentBalance: 30,
        movement: expect.objectContaining({
          type: 'TOP_UP',
          paymentMethod: 'CARD',
          amount: 20,
          balanceAfter: 30
        })
      })
    )
  })

  it('rejects account balance consumption when balance is insufficient', async () => {
    const tx: any = {
      client: {
        findUnique: vi.fn().mockResolvedValue({ id: 'client-1', accountBalance: 5 }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { clientId: 'client-1' },
      body: {
        operationDate: '2026-03-15',
        referenceItem: 'Tratamiento facial',
        amount: 10,
        notes: null,
        description: 'Consumo de abono'
      }
    })
    const res = createMockResponse()

    await consumeAccountBalance(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Insufficient account balance'
      })
    )
    expect(tx.client.update).not.toHaveBeenCalled()
    expect(tx.accountBalanceMovement.create).not.toHaveBeenCalled()
  })

  it('returns account balance history with current balance', async () => {
    prismaMock.client.findUnique.mockResolvedValue({ id: 'client-1', accountBalance: 35 })
    prismaMock.accountBalanceMovement.findMany.mockResolvedValue([
      {
        id: 'movement-1',
        clientId: 'client-1',
        saleId: null,
        type: 'TOP_UP',
        operationDate: new Date('2026-03-15T09:00:00.000Z'),
        description: 'Regalo',
        referenceItem: null,
        amount: 50,
        balanceAfter: 50,
        notes: null,
        createdAt: new Date('2026-03-15T09:00:00.000Z')
      },
      {
        id: 'movement-2',
        clientId: 'client-1',
        saleId: 'sale-1',
        type: 'CONSUMPTION',
        operationDate: new Date('2026-03-16T09:00:00.000Z'),
        description: 'Consumo en venta V-000123',
        referenceItem: 'Tratamiento facial',
        amount: 15,
        balanceAfter: 35,
        notes: 'Sesión 1',
        createdAt: new Date('2026-03-16T09:00:00.000Z')
      }
    ])
    prismaMock.$transaction.mockResolvedValue([
      { id: 'client-1', accountBalance: 35 },
      [
        {
          id: 'movement-1',
          clientId: 'client-1',
          saleId: null,
          type: 'TOP_UP',
          operationDate: new Date('2026-03-15T09:00:00.000Z'),
          description: 'Regalo',
          referenceItem: null,
          amount: 50,
          balanceAfter: 50,
          notes: null,
          createdAt: new Date('2026-03-15T09:00:00.000Z')
        }
      ]
    ])

    const req = createMockRequest({
      params: { clientId: 'client-1' },
      query: { limit: '5' }
    })
    const res = createMockResponse()

    await getAccountBalanceHistory(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        currentBalance: 35,
        movements: expect.any(Array)
      })
    )
  })
})

describe('bono.controller bono appointments and sessions', () => {
  beforeEach(() => {
    resetPrismaMock()
    prismaMock.agendaBlock.findMany.mockResolvedValue([])
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Lucy' })
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Limpieza facial',
        duration: 30
      }
    ])
  })

  it('creates appointment from bono and reserves next available session', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.bonoPack.findUnique.mockResolvedValue({
      id: 'bono-1',
      clientId: 'client-1',
      serviceId: 'service-1',
      status: 'ACTIVE',
      client: { id: 'client-1', firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sessions: [
        { id: 'session-1', status: 'AVAILABLE', appointmentId: null, sessionNumber: 1 },
        { id: 'session-2', status: 'CONSUMED', appointmentId: null, sessionNumber: 2 }
      ]
    })

    const tx: any = {
      appointment: {
        create: vi.fn().mockResolvedValue({
          id: 'appointment-1',
          cabin: 'LUCY',
          reminder: true,
          date: new Date('2099-04-15T10:00:00.000Z'),
          startTime: '10:00',
          endTime: '10:30',
          status: 'SCHEDULED',
          notes: null,
          client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
          user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
          service: { id: 'service-1', name: 'Limpieza facial' },
          sale: null,
          googleCalendarEventId: null
        })
      },
      bonoSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-04-15T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:30',
      status: 'SCHEDULED',
      notes: null,
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null
    })
    prismaMock.notification.create.mockResolvedValue(undefined)

    const req = createMockRequest({
      params: { bonoPackId: 'bono-1' },
      body: {
        userId: 'user-1',
        cabin: 'LUCY',
        date: '2099-04-15T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        reminder: true
      }
    })
    const res = createMockResponse()

    await createBonoAppointment(req as any, res)

    expect(tx.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceId: 'service-1',
          endTime: '10:30',
          appointmentServices: {
            create: [{ serviceId: 'service-1', sortOrder: 0 }]
          }
        })
      })
    )
    expect(tx.bonoSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: 'AVAILABLE',
        appointmentId: null
      },
      data: {
        appointmentId: 'appointment-1'
      }
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('returns 400 when creating appointment from bono without available sessions', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.bonoPack.findUnique.mockResolvedValue({
      id: 'bono-1',
      clientId: 'client-1',
      serviceId: 'service-1',
      status: 'ACTIVE',
      client: { id: 'client-1', firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sessions: [
        { id: 'session-1', status: 'CONSUMED', appointmentId: null, sessionNumber: 1 }
      ]
    })

    const req = createMockRequest({
      params: { bonoPackId: 'bono-1' },
      body: {
        userId: 'user-1',
        serviceId: 'service-1',
        cabin: 'LUCY',
        date: '2026-04-15T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        reminder: false
      }
    })
    const res = createMockResponse()

    await createBonoAppointment(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'No available sessions to reserve'
      })
    )
  })

  it('consumeSession marks consumedAt timestamp for the consumed session', async () => {
    prismaMock.bonoPack.findUnique
      .mockResolvedValueOnce({
        id: 'bono-1',
        name: 'Bono de 5 sesiones',
        status: 'ACTIVE',
        sessions: [
          { id: 'session-1', sessionNumber: 1, status: 'AVAILABLE', consumedAt: null, appointmentId: null, appointment: null },
          { id: 'session-2', sessionNumber: 2, status: 'AVAILABLE', consumedAt: null, appointmentId: null, appointment: null },
          { id: 'session-3', sessionNumber: 3, status: 'CONSUMED', consumedAt: new Date('2026-03-01T10:00:00.000Z'), appointmentId: null, appointment: null }
        ],
        client: { id: 'client-1', firstName: 'Ana', lastName: 'Lopez' }
      })
      .mockResolvedValueOnce({
        id: 'bono-1',
        sessions: [],
        service: { id: 'service-1', name: 'Limpieza facial' }
      })

    prismaMock.bonoSession.update.mockResolvedValue({
      id: 'session-1',
      status: 'CONSUMED'
    })

    const req = createMockRequest({
      params: { bonoPackId: 'bono-1' }
    })
    const res = createMockResponse()

    await consumeSession(req as any, res)

    expect(prismaMock.bonoSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'CONSUMED', consumedAt: expect.any(Date) }
    })
  })
})
