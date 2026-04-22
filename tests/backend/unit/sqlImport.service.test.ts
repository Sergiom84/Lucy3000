import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importSqlAnalysisToDatabase, SqlImportConflictError } from '../../../src/backend/services/sqlImport.service'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

const createBasePayload = () => ({
  sessionId: 'sql-session-1',
  sourceName: '01dat.sql',
  professionals: [
    {
      id: 'legacy-professional-1',
      code: 'LUCY',
      name: 'Lucía',
      shortName: 'Lucy',
      email: 'lucy@example.com',
      isActive: true
    }
  ],
  clients: [
    {
      id: 'legacy-client-1',
      selected: true,
      issues: [],
      legacyId: '10',
      legacyClientNumber: '143',
      barcode: 'CB-143',
      fullName: 'Clara Ruiz Calcerrada',
      firstName: 'Clara',
      lastName: 'Ruiz Calcerrada',
      dni: '12345678A',
      email: 'clara@example.com',
      phone: '670312806',
      mobilePhone: '670312806',
      landlinePhone: '910000000',
      address: 'Calle Mayor 1',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      birthDate: '1988-05-01',
      registrationDate: '2024-01-15',
      gender: 'F',
      legacyProfessionalCode: 'LUCY',
      clientBrand: 'Premium',
      appliedTariff: 'GENERAL',
      text9A: 'A1',
      text9B: 'B1',
      text15: 'Texto15',
      text25: 'Texto25',
      text100: 'Texto100',
      integer1: 7,
      integer2: 9,
      giftVoucher: 'Regalo',
      photoRef: 'clara.jpg',
      photoSkinType: 'III',
      webKey: 'web-143',
      discountProfile: 'VIP',
      globalClientNumber: '999',
      globalUpdated: true,
      rejectPostal: true,
      rejectSms: false,
      rejectEmail: true,
      excludeSurvey: false,
      registeredSurvey: true,
      legacySha1: 'sha1-demo',
      notes: 'Cliente fiel',
      isActive: true
    }
  ],
  services: [
    {
      id: 'legacy-service-1',
      selected: true,
      issues: [],
      legacyId: '20',
      code: 'HIDRA',
      name: 'Hidratación facial',
      description: 'Hidratación facial',
      category: 'Faciales',
      screenCategory: 'Faciales',
      price: 55,
      durationMinutes: 60,
      taxRate: 21,
      isPack: true,
      requiresProduct: true,
      isActive: true
    }
  ],
  products: [
    {
      id: 'legacy-product-1',
      selected: true,
      issues: [],
      legacyId: '30',
      legacyProductNumber: '9001',
      sku: 'CREMA-01',
      barcode: '843000000001',
      name: 'Crema Hidratante',
      description: 'Uso cabina',
      category: 'Cosmética',
      brand: 'LucyLabs',
      supplier: 'Proveedor Demo',
      cost: 9,
      price: 29.95,
      stock: 12,
      minStock: 2,
      maxStock: 20,
      isActive: true
    }
  ],
  bonoTemplates: [
    {
      id: 'legacy-bono-template-1',
      selected: true,
      issues: [],
      legacyServiceId: '20',
      serviceCode: 'HIDRA',
      serviceName: 'Hidratación facial',
      category: 'Faciales',
      slot: 1,
      totalSessions: 5,
      price: 240,
      isActive: true
    }
  ],
  clientBonos: [
    {
      id: 'legacy-client-bono-1',
      selected: true,
      issues: [],
      legacyId: '40',
      legacyNumber: '1001',
      clientNumber: '143',
      serviceCode: 'HIDRA',
      description: 'Bono Hidratación',
      totalSessions: 10,
      consumedSessions: 3,
      remainingSessions: 7,
      legacyValue: 240
    }
  ],
  accountBalances: [
    {
      id: 'legacy-account-balance-1',
      selected: true,
      issues: [],
      legacyId: '41',
      legacyNumber: '1002',
      clientNumber: '143',
      description: 'ABONO',
      kind: 'ABONO',
      amount: 42.5,
      rawNominal: 0,
      rawConsumed: 0
    }
  ],
  appointments: [
    {
      id: 'legacy-appointment-1',
      selected: true,
      issues: [],
      legacyId: '50',
      legacyClientNumber: '143',
      clientName: 'Clara Ruiz Calcerrada',
      phone: '670312806',
      serviceCode: 'HIDRA',
      serviceName: 'Hidratación facial',
      date: '2026-04-20',
      startTime: '10:45',
      endTime: '11:45',
      durationMinutes: 60,
      cabin: 'CABINA 1',
      legacyProfessionalCode: 'LUCY',
      legacyProfessionalName: 'Lucía',
      secondaryProfessionalCode: null,
      status: 'CONFIRMADA',
      notes: 'Primera sesión',
      legacyPackNumber: '1001',
      targetUserId: null
    }
  ],
  agendaBlocks: [
    {
      id: 'legacy-agenda-block-1',
      selected: true,
      issues: [],
      legacyId: '51',
      legacyClientNumber: null,
      date: '2026-04-20',
      startTime: '12:00',
      endTime: '12:30',
      durationMinutes: 30,
      cabin: 'CABINA 2',
      legacyProfessionalCode: 'LUCY',
      legacyProfessionalName: 'Lucía',
      notes: 'Descanso'
    }
  ],
  agendaNotes: [
    {
      id: 'legacy-agenda-note-1',
      selected: true,
      issues: [],
      legacyId: '60',
      dayKey: '2026-04-20',
      legacyProfessionalCode: 'LUCY',
      legacyProfessionalName: 'Lucía',
      text: 'Preparar cabina facial',
      isActive: true,
      agenda: 'Principal',
      stationNumber: 2
    }
  ],
  consents: [
    {
      id: 'legacy-consent-1',
      selected: true,
      issues: [],
      legacyId: '70',
      clientNumber: '143',
      clientName: 'Clara Ruiz Calcerrada',
      health: 'Sin patologías relevantes',
      medication: 'Vitamina D',
      fileName: 'consentimiento-143.txt'
    }
  ],
  signatures: [
    {
      id: 'legacy-signature-1',
      selected: true,
      issues: [],
      legacyId: '80',
      clientNumber: '143',
      clientName: 'Clara Ruiz Calcerrada',
      docType: 'Consentimiento facial',
      fileName: 'firma-143.png',
      legacyServiceNumber: '20',
      signatureBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2z3sAAAAASUVORK5CYII='
    }
  ],
  photoReferencesSkipped: [{ tableName: 'tblfotos', rowCount: 2 }],
  unsupportedPopulatedTables: [{ tableName: 'tblventaslegacy', rowCount: 1 }]
})

const createTransactionMock = () => ({
  user: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'admin-1',
        email: 'admin@lucy3000.com',
        username: 'admin',
        name: 'Administrador',
        role: 'ADMIN',
        isActive: true
      }
    ]),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  client: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  service: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  product: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  appointment: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  appointmentService: {
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  agendaBlock: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  agendaDayNote: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  bonoPack: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  bonoSession: {
    createMany: vi.fn().mockResolvedValue({ count: 10 })
  },
  accountBalanceMovement: {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  sale: {
    count: vi.fn().mockResolvedValue(0)
  },
  quote: {
    count: vi.fn().mockResolvedValue(0)
  },
  dashboardReminder: {
    count: vi.fn().mockResolvedValue(0)
  },
  notification: {
    count: vi.fn().mockResolvedValue(0)
  },
  setting: {
    upsert: vi.fn().mockResolvedValue(undefined)
  }
})

describe('sqlImport.service', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('blocks the commit when the target database is not functionally empty', async () => {
    const tx = createTransactionMock()
    tx.client.count.mockResolvedValue(3)
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    await expect(importSqlAnalysisToDatabase(createBasePayload())).rejects.toBeInstanceOf(SqlImportConflictError)
    expect(tx.service.createMany).not.toHaveBeenCalled()
  })

  it('imports the selected legacy blocks, creates legacy employees and prepares generated assets', async () => {
    const tx = createTransactionMock()
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const result = await importSqlAnalysisToDatabase(createBasePayload())

    expect(result.created).toEqual(
      expect.objectContaining({
        legacyUsers: 1,
        services: 1,
        products: 1,
        clients: 1,
        bonoTemplates: 1,
        clientBonos: 1,
        accountBalances: 1,
        appointments: 1,
        agendaBlocks: 1,
        agendaNotes: 1
      })
    )

    expect(tx.user.createMany).toHaveBeenCalledTimes(1)
    expect(tx.user.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            role: 'EMPLOYEE',
            isActive: false,
            name: 'Lucía'
          })
        ]
      })
    )

    expect(tx.client.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            externalCode: '143',
            accountBalance: 42.5,
            notes: expect.stringContaining('Metadata legacy SQL')
          })
        ]
      })
    )

    const createdLegacyUserId = tx.user.createMany.mock.calls[0][0].data[0].id
    expect(tx.appointment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            userId: createdLegacyUserId,
            professional: 'Lucía',
            status: 'SCHEDULED'
          })
        ]
      })
    )

    expect(tx.agendaBlock.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            professional: 'Lucía',
            cabin: 'CABINA 2'
          })
        ]
      })
    )

    expect(tx.accountBalanceMovement.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            amount: 42.5,
            balanceAfter: 42.5,
            importSource: 'SQL_01DAT_ACCOUNT_BALANCE_V1'
          })
        ]
      })
    )

    expect(result.assetsGenerated).toEqual({ consents: 1, signatures: 1 })
    expect(result.generatedAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'consents', fileName: 'consentimiento-143.txt' }),
        expect.objectContaining({ kind: 'documents', fileName: 'firma-143.png' })
      ])
    )
    expect(result.omitted.photoReferencesSkipped).toBe(2)
    expect(result.unsupported.tables).toEqual([{ tableName: 'tblventaslegacy', rowCount: 1 }])
  })
})
