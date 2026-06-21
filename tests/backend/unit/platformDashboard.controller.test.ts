import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deletePlatformDashboardRow,
  getPlatformDashboard,
  updatePlatformDashboardRow
} from '../../../src/backend/controllers/platformDashboard.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

const DASHBOARD_PIN = '0852'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('platformDashboard.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
    prismaMock.$transaction.mockImplementation((callback: any) => callback(prismaMock))
    prismaMock.tenant.findMany.mockResolvedValue([])
    prismaMock.trialRequest.findMany.mockResolvedValue([])
  })

  it('updates a trial request row and normalizes searchable fields', async () => {
    prismaMock.trialRequest.update.mockResolvedValue({
      id: REQUEST_ID
    })

    const req = createMockRequest({
      params: { rowId: `request-${REQUEST_ID}` },
      body: {
        pin: DASHBOARD_PIN,
        name: 'Sergio Lara',
        email: ' Sergio@Example.COM ',
        phone: ' 601 23 10 29 ',
        status: 'CONTACTED'
      }
    })
    const res = createMockResponse()

    await updatePlatformDashboardRow(req as any, res)

    expect(prismaMock.trialRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID },
      data: {
        name: 'Sergio Lara',
        email: 'Sergio@Example.COM',
        normalizedEmail: 'sergio@example.com',
        phone: '601 23 10 29',
        normalizedPhone: '601231029',
        status: 'CONTACTED'
      }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [],
        totals: expect.objectContaining({ total: 0 })
      })
    )
  })

  it('persists trial request reply and process dropdown statuses', async () => {
    prismaMock.trialRequest.update.mockResolvedValue({
      id: REQUEST_ID
    })

    const req = createMockRequest({
      params: { rowId: `request-${REQUEST_ID}` },
      body: {
        pin: DASHBOARD_PIN,
        replyStatus: 'FOLLOW_UP',
        commercialProcessStatus: 'CONTACTED'
      }
    })
    const res = createMockResponse()

    await updatePlatformDashboardRow(req as any, res)

    expect(prismaMock.trialRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID },
      data: {
        replyStatus: 'FOLLOW_UP',
        commercialProcessStatus: 'CONTACTED',
        status: 'CONTACTED'
      }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: []
      })
    )
  })

  it('deletes a trial request row from the dashboard', async () => {
    prismaMock.trialRequest.delete.mockResolvedValue({
      id: REQUEST_ID
    })

    const req = createMockRequest({
      params: { rowId: `request-${REQUEST_ID}` },
      body: { pin: DASHBOARD_PIN }
    })
    const res = createMockResponse()

    await deletePlatformDashboardRow(req as any, res)

    expect(prismaMock.trialRequest.delete).toHaveBeenCalledWith({
      where: { id: REQUEST_ID }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: []
      })
    )
  })

  it('does not allow deleting tenant rows from the public PIN dashboard', async () => {
    const req = createMockRequest({
      params: { rowId: `tenant-${TENANT_ID}` },
      body: { pin: DASHBOARD_PIN }
    })
    const res = createMockResponse()

    await deletePlatformDashboardRow(req as any, res)

    expect(prismaMock.trialRequest.delete).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('rejects request statuses on tenant license rows', async () => {
    const req = createMockRequest({
      params: { rowId: `tenant-${TENANT_ID}` },
      body: {
        pin: DASHBOARD_PIN,
        status: 'PENDING_REPLY'
      }
    })
    const res = createMockResponse()

    await updatePlatformDashboardRow(req as any, res)

    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('starts a tenant trial from the dashboard trial dropdown', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      name: 'Lucy3000 Local',
      tenantCode: 1,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      license: {
        status: 'PENDING',
        plan: 'pending',
        trialStartedAt: null,
        trialEndsAt: new Date('2026-06-10T10:00:00.000Z')
      },
      users: []
    })
    prismaMock.tenantLicense.upsert.mockResolvedValue({
      tenantId: TENANT_ID
    })

    const req = createMockRequest({
      params: { rowId: `tenant-${TENANT_ID}` },
      body: {
        pin: DASHBOARD_PIN,
        trialStarted: true
      }
    })
    const res = createMockResponse()

    await updatePlatformDashboardRow(req as any, res)

    expect(prismaMock.tenantLicense.upsert).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      create: expect.objectContaining({
        tenantId: TENANT_ID,
        status: 'TRIAL',
        plan: 'trial',
        trialStartedAt: new Date('2026-05-31T10:00:00.000Z'),
        trialEndsAt: new Date('2026-06-10T10:00:00.000Z')
      }),
      update: expect.objectContaining({
        status: 'TRIAL',
        plan: 'trial',
        trialStartedAt: new Date('2026-05-31T10:00:00.000Z'),
        trialEndsAt: new Date('2026-06-10T10:00:00.000Z')
      })
    })
  })

  it('updates the tenant admin email and alias from the dashboard', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      name: 'Lucy3000 Local',
      tenantCode: 1,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      license: null,
      users: [
        {
          id: 'admin-1',
          email: 'old@example.com',
          username: 'oldalias',
          name: 'Lucy Lara',
          phone: null,
          role: 'ADMIN',
          createdAt: new Date('2026-03-25T00:00:00.000Z')
        }
      ]
    })
    prismaMock.user.update.mockResolvedValue({
      id: 'admin-1'
    })

    const req = createMockRequest({
      params: { rowId: `tenant-${TENANT_ID}` },
      body: {
        pin: DASHBOARD_PIN,
        email: ' Nueva@Example.com ',
        username: 'aliasnuevo'
      }
    })
    const res = createMockResponse()

    await updatePlatformDashboardRow(req as any, res)

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: {
        email: 'nueva@example.com',
        username: 'aliasnuevo'
      }
    })
  })

  it('persists tenant process status and syncs paid state with the license', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      name: 'Lucy3000 Local',
      tenantCode: 1,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      license: {
        status: 'TRIAL',
        plan: 'trial',
        trialStartedAt: new Date('2026-05-20T10:00:00.000Z'),
        trialEndsAt: new Date('2026-05-30T10:00:00.000Z'),
        activatedAt: null
      },
      users: []
    })
    prismaMock.tenant.update.mockResolvedValue({
      id: TENANT_ID
    })
    prismaMock.tenantLicense.upsert.mockResolvedValue({
      tenantId: TENANT_ID
    })

    const req = createMockRequest({
      params: { rowId: `tenant-${TENANT_ID}` },
      body: {
        pin: DASHBOARD_PIN,
        commercialProcessStatus: 'PAID'
      }
    })
    const res = createMockResponse()

    await updatePlatformDashboardRow(req as any, res)

    expect(prismaMock.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: {
        commercialProcessStatus: 'PAID'
      }
    })
    expect(prismaMock.tenantLicense.upsert).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      create: expect.objectContaining({
        tenantId: TENANT_ID,
        status: 'ACTIVE',
        plan: 'active',
        activatedAt: new Date('2026-05-31T10:00:00.000Z')
      }),
      update: expect.objectContaining({
        status: 'ACTIVE',
        plan: 'active',
        activatedAt: new Date('2026-05-31T10:00:00.000Z')
      })
    })
  })

  it('shows active paid tenants as paid even if the stored commercial status is stale', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      {
        id: TENANT_ID,
        name: 'Lucy3000 Local',
        tenantCode: 1,
        commercialReplyStatus: 'EMAIL_RECEIVED',
        commercialProcessStatus: 'PENDING_TRIAL',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        license: {
          status: 'ACTIVE',
          plan: 'active',
          activatedAt: new Date('2026-05-27T10:00:00.000Z'),
          trialStartedAt: new Date('2026-05-17T10:00:00.000Z'),
          trialEndsAt: new Date('2026-05-27T10:00:00.000Z')
        },
        users: [
          {
            id: 'user-1',
            email: 'lucy@lucy.com',
            username: 'lucy',
            name: 'Lucy Lara',
            phone: null,
            role: 'ADMIN',
            createdAt: new Date('2026-03-25T00:00:00.000Z')
          }
        ]
      }
    ])

    const req = createMockRequest({
      body: { pin: DASHBOARD_PIN }
    })
    const res = createMockResponse()

    await getPlatformDashboard(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            id: `tenant-${TENANT_ID}`,
            username: 'lucy',
            commercialStatusCode: 'PAID',
            commercialStatus: 'Ya ha pagado'
          })
        ])
      })
    )
  })

  it('does not reset trial state for active paid tenants', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      name: 'Lucy3000 Local',
      tenantCode: 1,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      license: {
        status: 'ACTIVE',
        plan: 'active',
        trialStartedAt: new Date('2026-05-20T10:00:00.000Z'),
        trialEndsAt: new Date('2026-05-30T10:00:00.000Z')
      },
      users: []
    })

    const req = createMockRequest({
      params: { rowId: `tenant-${TENANT_ID}` },
      body: {
        pin: DASHBOARD_PIN,
        trialStarted: false
      }
    })
    const res = createMockResponse()

    await updatePlatformDashboardRow(req as any, res)

    expect(prismaMock.tenantLicense.upsert).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
  })
})
