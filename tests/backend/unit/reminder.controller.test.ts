import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDashboardReminder,
  getDashboardReminders,
  toggleDashboardReminder
} from '../../../src/backend/controllers/reminder.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('reminder.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('lists pending dashboard reminders ordered by creation time', async () => {
    prismaMock.dashboardReminder.findMany.mockResolvedValue([
      {
        id: 'reminder-1',
        text: 'Confirmar pedido de producto',
        isCompleted: false,
        completedAt: null,
        createdAt: new Date('2026-04-19T08:00:00.000Z'),
        updatedAt: new Date('2026-04-19T08:00:00.000Z')
      }
    ])

    const req = createMockRequest()
    const res = createMockResponse()

    await getDashboardReminders(req as any, res)

    expect(prismaMock.dashboardReminder.findMany).toHaveBeenCalledWith({
      where: { isCompleted: false },
      select: expect.any(Object),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reminder-1',
          text: 'Confirmar pedido de producto'
        })
      ])
    )
  })

  it('creates a dashboard reminder', async () => {
    prismaMock.dashboardReminder.create.mockResolvedValue({
      id: 'reminder-1',
      text: 'Revisar devolución pendiente',
      isCompleted: false,
      completedAt: null,
      createdAt: new Date('2026-04-19T09:00:00.000Z'),
      updatedAt: new Date('2026-04-19T09:00:00.000Z')
    })

    const req = createMockRequest({
      body: {
        text: 'Revisar devolución pendiente'
      }
    })
    const res = createMockResponse()

    await createDashboardReminder(req as any, res)

    expect(prismaMock.dashboardReminder.create).toHaveBeenCalledWith({
      data: {
        text: 'Revisar devolución pendiente'
      },
      select: expect.any(Object)
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('toggles completion for an existing dashboard reminder', async () => {
    prismaMock.dashboardReminder.findUnique.mockResolvedValue({ id: 'reminder-1' })
    prismaMock.dashboardReminder.update.mockResolvedValue({
      id: 'reminder-1',
      text: 'Llamar a cliente VIP',
      isCompleted: true,
      completedAt: new Date('2026-04-19T09:30:00.000Z'),
      createdAt: new Date('2026-04-19T09:00:00.000Z'),
      updatedAt: new Date('2026-04-19T09:30:00.000Z')
    })

    const req = createMockRequest({
      params: { id: 'reminder-1' },
      body: { isCompleted: true }
    })
    const res = createMockResponse()

    await toggleDashboardReminder(req as any, res)

    expect(prismaMock.dashboardReminder.update).toHaveBeenCalledWith({
      where: { id: 'reminder-1' },
      data: {
        isCompleted: true,
        completedAt: expect.any(Date)
      },
      select: expect.any(Object)
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reminder-1',
        isCompleted: true
      })
    )
  })
})
