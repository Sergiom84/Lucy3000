import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBonoAppointment,
  consumeSession,
  consumeAccountBalance,
  createAccountBalanceTopUp,
  getAccountBalanceHistory
} from '../../../src/backend/controllers/bono.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('bono.controller account balance', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('creates a top-up and updates client account balance', async () => {
    const tx: any = {
      client: {
        findUnique: vi.fn().mockResolvedValue({ id: 'client-1', accountBalance: 10 }),
        update: vi.fn().mockResolvedValue({ id: 'client-1', accountBalance: 30 })
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue({
          id: 'movement-1',
          clientId: 'client-1',
          saleId: null,
          type: 'TOP_UP',
          operationDate: new Date('2026-03-15T09:00:00.000Z'),
          description: 'Regalo para mi hija',
          referenceItem: null,
          amount: 20,
          balanceAfter: 30,
          notes: null,
          createdAt: new Date('2026-03-15T09:00:00.000Z')
        })
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { clientId: 'client-1' },
      body: {
        description: 'Regalo para mi hija',
        amount: 20,
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
          amount: 20,
          balanceAfter: 30
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        currentBalance: 30,
        movement: expect.objectContaining({
          type: 'TOP_UP',
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
  })

  it('creates appointment from bono and reserves next available session', async () => {
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
          date: new Date('2026-03-15T10:00:00.000Z'),
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
      date: new Date('2026-03-15T10:00:00.000Z'),
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
        date: '2026-03-15T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        reminder: true
      }
    })
    const res = createMockResponse()

    await createBonoAppointment(req as any, res)

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
        date: '2026-03-15T10:00:00.000Z',
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
