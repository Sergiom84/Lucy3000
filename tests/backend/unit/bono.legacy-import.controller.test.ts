import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  importAccountBalanceFromSpreadsheet,
  importClientBonosFromSpreadsheet
} from '../../../src/backend/controllers/bono.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { createWorkbookBuffer } from '../helpers/spreadsheet'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('bono legacy import controller', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.restoreAllMocks()
  })

  it('builds a preview for client bonos separating ready, existing, depleted and missing clients', async () => {
    prismaMock.$transaction.mockResolvedValue([
      [
        { id: 'client-1', externalCode: 'CL-001', firstName: 'Ana', lastName: 'Lopez' }
      ],
      [
        { id: 'service-1', serviceCode: 'FAC-01', name: 'Bono facial' }
      ],
      [
        { clientId: 'client-1', legacyRef: 'B-102' }
      ]
    ])

    const buffer = await createWorkbookBuffer(
      [
        ['Cliente', 'Nombre', 'Nº', 'Código', 'Descripción', 'Nominal', 'Consumo', 'Saldo', 'Comprado', 'Últ.Sesión', 'Caduca', 'Importe'],
        ['CL-001', 'Ana Lopez', 'B-101', 'FAC-01', 'Bono facial', 6, 2, 4, '2026-01-10', '2026-03-10', '2026-12-31', 120],
        ['CL-001', 'Ana Lopez', 'B-102', 'FAC-01', 'Bono facial', 6, 1, 5, '2026-01-10', '', '2026-12-31', 120],
        ['CL-001', 'Ana Lopez', 'B-103', 'FAC-01', 'Bono facial', 5, 5, 0, '2026-01-10', '', '2026-12-31', 95],
        ['CL-404', 'Cliente desconocido', 'B-104', 'FAC-01', 'Bono facial', 6, 0, 6, '2026-01-10', '', '2026-12-31', 120],
        ['CL-001', 'Ana Lopez', '', 'FAC-01', 'Bono facial', 6, 0, 6, '2026-01-10', '', '2026-12-31', 120]
      ],
      'Bonos'
    )

    const req = createMockRequest({
      body: { mode: 'preview' },
      file: {
        buffer,
        originalname: 'bonos.xlsx'
      } as any
    })
    const res = createMockResponse()

    await importClientBonosFromSpreadsheet(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'preview',
        preview: expect.objectContaining({
          ready: expect.objectContaining({ count: 1 }),
          existing: expect.objectContaining({ count: 1 }),
          depleted: expect.objectContaining({ count: 1 }),
          missingClients: expect.objectContaining({ count: 1 }),
          errors: expect.objectContaining({ count: 1 })
        })
      })
    )
  })

  it('imports client bonos into bono_packs with legacy references and reconstructed sessions', async () => {
    prismaMock.$transaction.mockResolvedValue([
      [
        { id: 'client-1', externalCode: 'CL-001', firstName: 'Ana', lastName: 'Lopez' }
      ],
      [
        { id: 'service-1', serviceCode: 'FAC-01', name: 'Bono facial' }
      ],
      []
    ])
    prismaMock.bonoPack.create.mockResolvedValue({ id: 'bono-pack-1' })

    const buffer = await createWorkbookBuffer(
      [
        ['Cliente', 'Nombre', 'Nº', 'Código', 'Descripción', 'Nominal', 'Consumo', 'Saldo', 'Comprado', 'Últ.Sesión', 'Caduca', 'Importe'],
        ['CL-001', 'Ana Lopez', 'B-101', 'FAC-01', 'Bono facial', 6, 2, 4, '2026-01-10', '2026-03-10', '2026-12-31', 120]
      ],
      'Bonos'
    )

    const req = createMockRequest({
      body: { mode: 'commit' },
      file: {
        buffer,
        originalname: 'bonos.xlsx'
      } as any
    })
    const res = createMockResponse()

    await importClientBonosFromSpreadsheet(req as any, res)

    expect(prismaMock.bonoPack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          serviceId: 'service-1',
          legacyRef: 'B-101',
          importSource: 'LEGACY_CLIENT_BONO',
          totalSessions: 6,
          price: 120,
          status: 'ACTIVE',
          sessions: {
            create: [
              { sessionNumber: 1, status: 'CONSUMED', consumedAt: new Date(2026, 2, 10) },
              { sessionNumber: 2, status: 'CONSUMED', consumedAt: new Date(2026, 2, 10) },
              { sessionNumber: 3, status: 'AVAILABLE', consumedAt: null },
              { sessionNumber: 4, status: 'AVAILABLE', consumedAt: null },
              { sessionNumber: 5, status: 'AVAILABLE', consumedAt: null },
              { sessionNumber: 6, status: 'AVAILABLE', consumedAt: null }
            ]
          }
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          success: expect.objectContaining({ count: 1 }),
          errors: expect.objectContaining({ count: 0 })
        })
      })
    )
  })

  it('creates missing clients during client bono import when requested', async () => {
    prismaMock.$transaction.mockResolvedValue([
      [],
      [
        { id: 'service-1', serviceCode: 'FAC-01', name: 'Bono facial' }
      ],
      []
    ])
    prismaMock.client.create.mockResolvedValue({
      id: 'client-created',
      externalCode: 'CL-404',
      firstName: 'Cliente',
      lastName: 'desconocido'
    })
    prismaMock.bonoPack.create.mockResolvedValue({ id: 'bono-pack-1' })

    const buffer = await createWorkbookBuffer(
      [
        ['Cliente', 'Nombre', 'Nº', 'Código', 'Descripción', 'Nominal', 'Consumo', 'Saldo', 'Comprado', 'Últ.Sesión', 'Caduca', 'Importe'],
        ['CL-404', 'Cliente desconocido', 'B-104', 'FAC-01', 'Bono facial', 6, 0, 6, '2026-01-10', '', '2026-12-31', 120]
      ],
      'Bonos'
    )

    const req = createMockRequest({
      body: { mode: 'commit', createMissingClients: true },
      file: {
        buffer,
        originalname: 'bonos.xlsx'
      } as any
    })
    const res = createMockResponse()

    await importClientBonosFromSpreadsheet(req as any, res)

    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalCode: 'CL-404',
          firstName: 'Cliente',
          lastName: 'desconocido'
        })
      })
    )
    expect(prismaMock.bonoPack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-created',
          legacyRef: 'B-104'
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          createdClients: 1,
          success: expect.objectContaining({ count: 1 }),
          missingClients: expect.objectContaining({ count: 1 })
        })
      })
    )
  })

  it('builds a preview for account balance imports separating ready, existing and without balance rows', async () => {
    prismaMock.$transaction.mockResolvedValue([
      [
        { id: 'client-1', externalCode: 'CL-001', firstName: 'Ana', lastName: 'Lopez' }
      ],
      [
        { clientId: 'client-1', legacyRef: 'AB-102' }
      ]
    ])

    const buffer = await createWorkbookBuffer(
      [
        ['Cliente', 'Nombre', 'Abono', 'Descripción', 'Nominal', 'Consumo', 'Saldo', 'Caduca', 'Fecha'],
        ['CL-001', 'Ana Lopez', 'AB-101', 'Saldo promo', 100, 40, 60, '2026-12-31', '2026-01-15'],
        ['CL-001', 'Ana Lopez', 'AB-102', 'Saldo promo', 100, 40, 60, '2026-12-31', '2026-01-15'],
        ['CL-001', 'Ana Lopez', 'AB-103', 'Saldo promo', 100, 100, 0, '2026-12-31', '2026-01-15'],
        ['CL-404', 'Cliente desconocido', 'AB-104', 'Saldo promo', 100, 20, 80, '2026-12-31', '2026-01-15'],
        ['CL-001', 'Ana Lopez', '', 'Saldo promo', 100, 20, 80, '2026-12-31', '2026-01-15']
      ],
      'Abonos'
    )

    const req = createMockRequest({
      body: { mode: 'preview' },
      file: {
        buffer,
        originalname: 'abonos.xlsx'
      } as any
    })
    const res = createMockResponse()

    await importAccountBalanceFromSpreadsheet(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'preview',
        preview: expect.objectContaining({
          ready: expect.objectContaining({ count: 1 }),
          existing: expect.objectContaining({ count: 1 }),
          withoutBalance: expect.objectContaining({ count: 1 }),
          missingClients: expect.objectContaining({ count: 1 }),
          errors: expect.objectContaining({ count: 1 })
        })
      })
    )
  })

  it('imports account balance rows as balance movements without using cash flow logic', async () => {
    const tx: any = {
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          accountBalance: 20
        }),
        update: vi.fn().mockResolvedValue({ id: 'client-1', accountBalance: 80 })
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue({ id: 'movement-1' })
      }
    }

    prismaMock.$transaction
      .mockResolvedValueOnce([
        [
          { id: 'client-1', externalCode: 'CL-001', firstName: 'Ana', lastName: 'Lopez' }
        ],
        []
      ])
      .mockImplementationOnce(async (callback: any) => callback(tx))

    const buffer = await createWorkbookBuffer(
      [
        ['Cliente', 'Nombre', 'Abono', 'Descripción', 'Nominal', 'Consumo', 'Saldo', 'Caduca', 'Fecha'],
        ['CL-001', 'Ana Lopez', 'AB-101', 'Saldo promo', 100, 40, 60, '2026-12-31', '2026-01-15']
      ],
      'Abonos'
    )

    const req = createMockRequest({
      body: { mode: 'commit' },
      file: {
        buffer,
        originalname: 'abonos.xlsx'
      } as any
    })
    const res = createMockResponse()

    await importAccountBalanceFromSpreadsheet(req as any, res)

    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { accountBalance: 80 }
    })
    expect(tx.accountBalanceMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          type: 'TOP_UP',
          paymentMethod: null,
          legacyRef: 'AB-101',
          importSource: 'LEGACY_ACCOUNT_BALANCE',
          amount: 60,
          balanceAfter: 80
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          success: expect.objectContaining({ count: 1 }),
          errors: expect.objectContaining({ count: 0 })
        })
      })
    )
  })

  it('creates missing clients during account balance import when requested', async () => {
    const tx: any = {
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-created',
          accountBalance: 0
        }),
        update: vi.fn().mockResolvedValue({ id: 'client-created', accountBalance: 80 })
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue({ id: 'movement-1' })
      }
    }

    prismaMock.$transaction
      .mockResolvedValueOnce([[], []])
      .mockImplementationOnce(async (callback: any) => callback(tx))
    prismaMock.client.create.mockResolvedValue({
      id: 'client-created',
      externalCode: 'CL-404',
      firstName: 'Cliente',
      lastName: 'desconocido'
    })

    const buffer = await createWorkbookBuffer(
      [
        ['Cliente', 'Nombre', 'Abono', 'Descripción', 'Nominal', 'Consumo', 'Saldo', 'Caduca', 'Fecha'],
        ['CL-404', 'Cliente desconocido', 'AB-104', 'Saldo promo', 100, 20, 80, '2026-12-31', '2026-01-15']
      ],
      'Abonos'
    )

    const req = createMockRequest({
      body: { mode: 'commit', createMissingClients: true },
      file: {
        buffer,
        originalname: 'abonos.xlsx'
      } as any
    })
    const res = createMockResponse()

    await importAccountBalanceFromSpreadsheet(req as any, res)

    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalCode: 'CL-404',
          firstName: 'Cliente',
          lastName: 'desconocido'
        })
      })
    )
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-created' },
      data: { accountBalance: 80 }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          createdClients: 1,
          success: expect.objectContaining({ count: 1 }),
          missingClients: expect.objectContaining({ count: 1 })
        })
      })
    )
  })
})
