import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../../src/backend/app'
import { MAX_SPREADSHEET_FILE_SIZE_BYTES } from '../../../src/backend/middleware/upload.middleware'
import { createWorkbookBuffer } from '../helpers/spreadsheet'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

const createAuthHeader = () => {
  process.env.JWT_SECRET = 'test-jwt-secret'
  const token = jwt.sign(
    { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
  return `Bearer ${token}`
}

const createEmployeeAuthHeader = () => {
  process.env.JWT_SECRET = 'test-jwt-secret'
  const token = jwt.sign(
    { id: 'user-2', email: 'employee@lucy3000.com', role: 'EMPLOYEE' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
  return `Bearer ${token}`
}

const createSqlImportPayload = () => ({
  sessionId: 'sql-session-smoke',
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

const createSqlImportTx = () => ({
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

describe('API smoke tests', () => {
  beforeEach(() => {
    resetPrismaMock()
    process.env.JWT_SECRET = 'test-jwt-secret'
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.agendaBlock.findMany.mockResolvedValue([])
    prismaMock.agendaDayNote.findMany.mockResolvedValue([])
    prismaMock.dashboardReminder.findMany.mockResolvedValue([])
    prismaMock.setting.findUnique.mockResolvedValue(null)
    prismaMock.sale.findMany.mockResolvedValue([])
    prismaMock.quote.findMany.mockResolvedValue([])
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Lucy' })
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59',
        name: 'Limpieza facial',
        duration: 30,
        category: 'Facial',
        serviceCode: 'FAC-01'
      }
    ])
  })

  it('GET /health responds with ok status', async () => {
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok'
      })
    )
  })

  it('GET /api/auth/bootstrap-status returns required=true when there are no users', async () => {
    prismaMock.user.count.mockResolvedValue(0)

    const response = await request(app).get('/api/auth/bootstrap-status')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ required: true })
  })

  it('POST /api/auth/bootstrap-admin creates the first admin and returns auth payload', async () => {
    const tx: any = {
      user: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'owner@example.com',
          name: 'Owner',
          role: 'ADMIN'
        })
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const response = await request(app).post('/api/auth/bootstrap-admin').send({
      email: 'owner@example.com',
      name: 'Owner',
      password: 'supersecure123'
    })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(
      expect.objectContaining({
        token: expect.any(String),
        user: expect.objectContaining({
          id: 'admin-1',
          email: 'owner@example.com',
          name: 'Owner',
          role: 'ADMIN'
        })
      })
    )
  })

  it('POST /api/auth/bootstrap-admin returns 409 when bootstrap was already completed', async () => {
    const tx: any = {
      user: {
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn()
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const response = await request(app).post('/api/auth/bootstrap-admin').send({
      email: 'owner@example.com',
      name: 'Owner',
      password: 'supersecure123'
    })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('Bootstrap already completed')
    expect(tx.user.create).not.toHaveBeenCalled()
  })

  it('POST /api/sales rejects invalid payload with 400', async () => {
    const response = await request(app)
      .post('/api/sales')
      .set('Authorization', createAuthHeader())
      .send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'Validation error'
      })
    )
  })

  it('POST /api/cash/open accepts valid payload and creates register', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue(null)
    prismaMock.cashRegister.create.mockResolvedValue({
      id: 'cash-1',
      status: 'OPEN',
      openingBalance: 100,
      movements: []
    })

    const response = await request(app)
      .post('/api/cash/open')
      .set('Authorization', createAuthHeader())
      .send({
        openingBalance: 100,
        notes: 'inicio'
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'cash-1',
        status: 'OPEN'
      })
    )
  })

  it('POST /api/products/:id/stock-movements rejects zero quantity', async () => {
    const response = await request(app)
      .post('/api/products/3adf3ca8-c749-4f40-9f2e-54a8ff0f8f57/stock-movements')
      .set('Authorization', createAuthHeader())
      .send({
        type: 'ADJUSTMENT',
        quantity: 0
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Validation error')
  })

  it('GET /api/notifications rejects invalid isRead query', async () => {
    const response = await request(app)
      .get('/api/notifications?isRead=maybe')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Validation error')
  })

  it('GET /api/reports/sales rejects partial date ranges', async () => {
    const response = await request(app)
      .get('/api/reports/sales?startDate=2026-01-01')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Validation error')
  })

  it('GET /api/reports/clients rejects non-admin users', async () => {
    const response = await request(app)
      .get('/api/reports/clients')
      .set('Authorization', createEmployeeAuthHeader())

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Admin access required')
  })

  it('GET /api/users rejects non-admin users', async () => {
    const response = await request(app)
      .get('/api/users')
      .set('Authorization', createEmployeeAuthHeader())

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Admin access required')
  })

  it('POST /api/clients/import rejects non-admin users', async () => {
    const response = await request(app)
      .post('/api/clients/import')
      .set('Authorization', createEmployeeAuthHeader())

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Admin access required')
  })

  it('POST /api/services/import rejects non-admin users', async () => {
    const response = await request(app)
      .post('/api/services/import')
      .set('Authorization', createEmployeeAuthHeader())

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Admin access required')
  })

  it('POST /api/products/import rejects non-admin users', async () => {
    const response = await request(app)
      .post('/api/products/import')
      .set('Authorization', createEmployeeAuthHeader())

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Admin access required')
  })

  it('POST /api/users creates a managed account for admin users', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.user.create.mockResolvedValue({
      id: 'user-3',
      email: 'equipo@example.com',
      name: 'Equipo',
      role: 'EMPLOYEE',
      isActive: true,
      createdAt: new Date('2026-04-18T10:00:00.000Z'),
      updatedAt: new Date('2026-04-18T10:00:00.000Z')
    })

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', createAuthHeader())
      .send({
        email: 'equipo@example.com',
        name: 'Equipo',
        password: 'supersecure123',
        role: 'EMPLOYEE'
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'user-3',
        email: 'equipo@example.com',
        name: 'Equipo',
        role: 'EMPLOYEE',
        isActive: true
      })
    )
  })

  it('GET /api/users/:id/account-settings accepts legacy non-uuid user ids', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'admin-001',
      email: 'admin@lucy3000.com',
      username: 'admin',
      name: 'Administrador',
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date('2026-04-18T10:00:00.000Z'),
      updatedAt: new Date('2026-04-18T10:00:00.000Z')
    })

    const response = await request(app)
      .get('/api/users/admin-001/account-settings')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'admin-001',
        username: 'admin',
        professionalNames: expect.any(Array)
      })
    )
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-001' }
      })
    )
  })

  it('GET /api/appointments/day-notes returns notes for a valid day key', async () => {
    prismaMock.agendaDayNote.findMany.mockResolvedValue([
      {
        id: 'note-1',
        dayKey: '2026-04-18',
        text: 'Preparar cabina',
        isCompleted: false,
        completedAt: null,
        createdAt: new Date('2026-04-18T08:00:00.000Z'),
        updatedAt: new Date('2026-04-18T08:00:00.000Z')
      }
    ])

    const response = await request(app)
      .get('/api/appointments/day-notes?dayKey=2026-04-18')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'note-1',
          text: 'Preparar cabina'
        })
      ])
    )
  })

  it('POST /api/appointments/day-notes creates a note for the selected day', async () => {
    prismaMock.agendaDayNote.create.mockResolvedValue({
      id: 'note-1',
      dayKey: '2026-04-18',
      text: 'Recordar cierre',
      isCompleted: false,
      completedAt: null,
      createdAt: new Date('2026-04-18T08:00:00.000Z'),
      updatedAt: new Date('2026-04-18T08:00:00.000Z')
    })

    const response = await request(app)
      .post('/api/appointments/day-notes')
      .set('Authorization', createAuthHeader())
      .send({
        dayKey: '2026-04-18',
        text: 'Recordar cierre'
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'note-1',
        dayKey: '2026-04-18',
        text: 'Recordar cierre'
      })
    )
  })

  it('GET /api/reminders returns pending reminders', async () => {
    prismaMock.dashboardReminder.findMany.mockResolvedValue([
      {
        id: 'reminder-1',
        text: 'Revisar stock de mascarillas',
        isCompleted: false,
        completedAt: null,
        createdAt: new Date('2026-04-19T08:00:00.000Z'),
        updatedAt: new Date('2026-04-19T08:00:00.000Z')
      }
    ])

    const response = await request(app)
      .get('/api/reminders')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reminder-1',
          text: 'Revisar stock de mascarillas'
        })
      ])
    )
  })

  it('POST /api/reminders creates a pending reminder', async () => {
    prismaMock.dashboardReminder.create.mockResolvedValue({
      id: 'reminder-1',
      text: 'Confirmar cita de prueba',
      isCompleted: false,
      completedAt: null,
      createdAt: new Date('2026-04-19T09:00:00.000Z'),
      updatedAt: new Date('2026-04-19T09:00:00.000Z')
    })

    const response = await request(app)
      .post('/api/reminders')
      .set('Authorization', createAuthHeader())
      .send({
        text: 'Confirmar cita de prueba'
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'reminder-1',
        text: 'Confirmar cita de prueba',
        isCompleted: false
      })
    )
  })

  it('GET /api/notifications hides admin-only activity notifications for non-admin users', async () => {
    prismaMock.notification.findMany.mockResolvedValue([])

    const response = await request(app)
      .get('/api/notifications?isRead=false')
      .set('Authorization', createEmployeeAuthHeader())

    expect(response.status).toBe(200)
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isRead: false,
          NOT: {
            type: 'ADMIN_ACTIVITY'
          }
        })
      })
    )
  })

  it('POST /api/quotes rejects empty items payload through Zod validation', async () => {
    const response = await request(app)
      .post('/api/quotes')
      .set('Authorization', createAuthHeader())
      .send({
        clientId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f57',
        professional: 'LUCY',
        items: []
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Validation error')
  })

  it('POST /api/appointments accepts cabin payload and creates appointment', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'TAMARA',
      reminder: false,
      date: new Date('2099-03-07T10:00:00.000Z'),
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: null },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: null
    })
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'TAMARA',
      reminder: false,
      date: new Date('2099-03-07T10:00:00.000Z'),
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: null },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null
    })

    const response = await request(app)
      .post('/api/appointments')
      .set('Authorization', createAuthHeader())
      .send({
        clientId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f57',
        userId: '4adf3ca8-c749-4f40-9f2e-54a8ff0f8f58',
        serviceId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59',
        cabin: 'TAMARA',
        professional: 'Tamara',
        date: '2099-03-07T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        reminder: false
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({ id: 'appointment-1', cabin: 'TAMARA' }))
  })

  it('POST /api/appointments accepts guest payload and creates appointment', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({
      id: 'appointment-guest-1',
      clientId: null,
      guestName: 'Cliente puntual',
      guestPhone: '600123123',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-03-07T10:00:00.000Z'),
      client: null,
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: null
    })
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-guest-1',
      clientId: null,
      guestName: 'Cliente puntual',
      guestPhone: '600123123',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-03-07T10:00:00.000Z'),
      client: null,
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null
    })
    prismaMock.notification.create.mockResolvedValue(undefined)

    const response = await request(app)
      .post('/api/appointments')
      .set('Authorization', createAuthHeader())
      .send({
        clientId: null,
        guestName: 'Cliente puntual',
        guestPhone: '600123123',
        userId: '4adf3ca8-c749-4f40-9f2e-54a8ff0f8f58',
        serviceId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59',
        cabin: 'LUCY',
        professional: 'Lucy',
        date: '2099-03-07T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        reminder: true
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(
      expect.objectContaining({ id: 'appointment-guest-1', guestName: 'Cliente puntual' })
    )
  })

  it('POST /api/bonos/:bonoPackId/appointments reserves a bono session and creates appointment', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.bonoPack.findUnique.mockResolvedValue({
      id: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f57',
      clientId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f56',
      serviceId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59',
      status: 'ACTIVE',
      client: { id: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f56', firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      service: { id: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59', name: 'Limpieza facial' },
      sessions: [
        { id: 'session-1', status: 'AVAILABLE', appointmentId: null, sessionNumber: 1 }
      ]
    })

    const tx: any = {
      appointment: {
        create: vi.fn().mockResolvedValue({
          id: 'appointment-from-bono-1',
          cabin: 'LUCY',
          reminder: true,
          date: new Date('2099-03-20T10:00:00.000Z'),
          startTime: '10:00',
          endTime: '10:30',
          status: 'SCHEDULED',
          notes: null,
          client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
          user: { id: '4adf3ca8-c749-4f40-9f2e-54a8ff0f8f58', name: 'Lucy', email: 'admin@lucy3000.com' },
          service: { id: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59', name: 'Limpieza facial' },
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
      id: 'appointment-from-bono-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-03-20T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:30',
      status: 'SCHEDULED',
      notes: null,
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      user: { id: '4adf3ca8-c749-4f40-9f2e-54a8ff0f8f58', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null
    })
    prismaMock.notification.create.mockResolvedValue(undefined)

    const response = await request(app)
      .post('/api/bonos/3adf3ca8-c749-4f40-9f2e-54a8ff0f8f57/appointments')
      .set('Authorization', createAuthHeader())
      .send({
        userId: '4adf3ca8-c749-4f40-9f2e-54a8ff0f8f58',
        cabin: 'LUCY',
        date: '2099-03-20T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        reminder: true
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({ id: 'appointment-from-bono-1' }))
  })

  it('POST /api/clients/import rejects missing file uploads', async () => {
    const response = await request(app)
      .post('/api/clients/import')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Spreadsheet file "file" is required')
  })

  it('POST /api/clients/import rejects invalid spreadsheet file types', async () => {
    const response = await request(app)
      .post('/api/clients/import')
      .set('Authorization', createAuthHeader())
      .attach('file', Buffer.from('not-a-spreadsheet'), {
        filename: 'clientes.txt',
        contentType: 'text/plain'
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Only .xlsx spreadsheet files are supported')
  })

  it('POST /api/clients/import rejects spreadsheets larger than the allowed limit', async () => {
    const response = await request(app)
      .post('/api/clients/import')
      .set('Authorization', createAuthHeader())
      .attach('file', Buffer.alloc(MAX_SPREADSHEET_FILE_SIZE_BYTES + 1, 0), {
        filename: 'clientes.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('5MB limit')
  })

  it('POST /api/sql/analyze keeps bonos, abonos y assets detectados in a 01dat dump', async () => {
    const sampleSqlDump = `
CREATE TABLE \`tblusuarios\` (
  \`Id\` int NOT NULL,
  \`Codigo\` varchar(10) DEFAULT NULL,
  \`TUNombreCorto\` varchar(50) DEFAULT NULL,
  \`TUNombreLargo\` varchar(100) DEFAULT NULL,
  \`eMail\` varchar(100) DEFAULT NULL,
  \`Activo\` tinyint DEFAULT NULL,
  PRIMARY KEY (\`Id\`),
  KEY \`Codigo\` (\`Codigo\`)
) ENGINE=InnoDB;
INSERT INTO \`tblusuarios\` VALUES (1,'LUCY','Lucy','Lucía','lucy@example.com',1);
CREATE TABLE \`tblclientes\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`Nombre\` varchar(120) DEFAULT NULL,
  \`Movil\` varchar(20) DEFAULT NULL,
  \`FechaAlta\` date DEFAULT NULL,
  \`eMail\` varchar(100) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblclientes\` VALUES (10,143,'Clara Ruiz','670312806','2024-01-15','clara@example.com');
CREATE TABLE \`tbltarifa\` (
  \`Id\` int NOT NULL,
  \`Codigo\` varchar(20) DEFAULT NULL,
  \`Descripcion\` varchar(120) DEFAULT NULL,
  \`Tiempo\` int DEFAULT NULL,
  \`Precio\` decimal(10,2) DEFAULT NULL,
  \`UnidadesBono1\` int DEFAULT NULL,
  \`PrecioBono1\` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tbltarifa\` VALUES (20,'HIDRA','Hidratación facial',60,55.00,5,240.00);
CREATE TABLE \`tblbbpa\` (
  \`Id\` int NOT NULL,
  \`Nro\` int DEFAULT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`Tipo\` char(1) DEFAULT NULL,
  \`TipoAb\` int DEFAULT NULL,
  \`Nominal\` decimal(10,2) DEFAULT NULL,
  \`Consumido\` decimal(10,2) DEFAULT NULL,
  \`Codigo\` varchar(20) DEFAULT NULL,
  \`Descripcion\` varchar(120) DEFAULT NULL,
  \`XICV\` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (\`Id\`),
  KEY \`Codigo\` (\`Codigo\`)
) ENGINE=InnoDB;
INSERT INTO \`tblbbpa\` VALUES (40,1001,143,'B',0,10,7,'HIDRA','Bono Hidratación',NULL);
INSERT INTO \`tblbbpa\` VALUES (41,1002,143,'A',0,0,0,NULL,'ABONO',425000);
CREATE TABLE \`tblreservas\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`NombreCliente\` varchar(120) DEFAULT NULL,
  \`Telefono\` varchar(20) DEFAULT NULL,
  \`CodSubSer\` varchar(20) DEFAULT NULL,
  \`Fecha\` date DEFAULT NULL,
  \`Hora\` varchar(10) DEFAULT NULL,
  \`Minutos\` int DEFAULT NULL,
  \`Cabina\` varchar(40) DEFAULT NULL,
  \`Oficial1\` varchar(10) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblreservas\` VALUES (50,143,'Clara Ruiz','670312806','HIDRA','2026-04-20','10:45',60,'CABINA 1','LUCY');
CREATE TABLE \`tblreservasnotas\` (
  \`Id\` int NOT NULL,
  \`Fecha\` date DEFAULT NULL,
  \`Oficial\` varchar(10) DEFAULT NULL,
  \`Nota\` varchar(255) DEFAULT NULL,
  \`Activo\` tinyint DEFAULT NULL,
  \`NroEstacion\` int DEFAULT NULL,
  \`Agenda\` varchar(20) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblreservasnotas\` VALUES (60,'2026-04-20','LUCY','Preparar cabina',1,2,'Principal');
CREATE TABLE \`tblconsentimientos\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`Salud\` text,
  \`Medicacion\` text,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblconsentimientos\` VALUES (70,143,'OK','Vitamina D');
CREATE TABLE \`tblfirmas\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`Doc\` varchar(40) DEFAULT NULL,
  \`Archivo\` varchar(80) DEFAULT NULL,
  \`NroServicio\` int DEFAULT NULL,
  \`Firma\` longtext,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblfirmas\` VALUES (80,143,'Consentimiento facial','firma.png',20,'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2z3sAAAAASUVORK5CYII=');
CREATE TABLE \`tblfotos\` (\`Id\` int NOT NULL, PRIMARY KEY (\`Id\`)) ENGINE=InnoDB;
INSERT INTO \`tblfotos\` VALUES (1);
`

    const response = await request(app)
      .post('/api/sql/analyze')
      .set('Authorization', createAuthHeader())
      .attach('file', Buffer.from(sampleSqlDump, 'utf8'), {
        filename: '01dat.sql',
        contentType: 'application/sql'
      })

    expect(response.status).toBe(200)
    expect(response.body.summary).toEqual(
      expect.objectContaining({
        clientBonos: 1,
        accountBalances: 1,
        appointments: 1,
        agendaNotes: 1,
        consents: 1,
        signatures: 1,
        photoReferencesSkipped: 1
      })
    )
  })

  it('POST /api/sql/import blocks the commit when there is business data in the target database', async () => {
    const tx: any = createSqlImportTx()
    tx.client.count.mockResolvedValue(2)
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const response = await request(app)
      .post('/api/sql/import')
      .set('Authorization', createAuthHeader())
      .send(createSqlImportPayload())

    expect(response.status).toBe(409)
    expect(response.body.error).toContain('BD funcionalmente vacía')
  })

  it('POST /api/sql/import commits the SQL restore and reports omitted photo references', async () => {
    const tx: any = createSqlImportTx()
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const response = await request(app)
      .post('/api/sql/import')
      .set('Authorization', createAuthHeader())
      .send(createSqlImportPayload())

    expect(response.status).toBe(200)
    expect(response.body.created).toEqual(
      expect.objectContaining({
        clientBonos: 1,
        accountBalances: 1,
        appointments: 1,
        agendaBlocks: 1,
        agendaNotes: 1
      })
    )
    expect(response.body.omitted.photoReferencesSkipped).toBe(2)
    expect(response.body.assetsGenerated).toEqual({ consents: 1, signatures: 1 })
  })

  it('POST /api/appointments/import accepts a valid Excel file for admins', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'client-1',
        externalCode: '143',
        firstName: 'CLARA',
        lastName: 'RUIZ CALCERRADA',
        phone: '670312806',
        email: 'clara@example.com'
      }
    ])
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        serviceCode: 'SHRMEN',
        name: 'Menton shr',
        duration: 20
      }
    ])
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({ id: 'appointment-1' })

    const buffer = await createWorkbookBuffer(
      [
        [
          'Fecha',
          'Hora',
          'Minutos',
          'cliente',
          'Nombre',
          'Código',
          'Descripción',
          'Cabina',
          'Profesional',
          'Teléfono',
          'Mail',
          'Notas'
        ],
        [
          '20-04-26',
          '10:45',
          20,
          143,
          'CLARA RUIZ CALCERRADA',
          'SHRMEN',
          'Menton shr',
          'CABINA',
          'LUCY',
          670312806,
          'clara@example.com',
          'Primera cita'
        ]
      ],
      'Citas'
    )

    const response = await request(app)
      .post('/api/appointments/import')
      .set('Authorization', createAuthHeader())
      .attach('file', buffer, {
        filename: 'citas.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          success: 1,
          skipped: 0,
          errors: []
        })
      })
    )
    expect(prismaMock.appointment.create).toHaveBeenCalledTimes(1)
  })

  it('POST /api/sales accepts guest appointment charge with null clientId', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-guest-1',
          clientId: null,
          guestName: 'Cliente puntual',
          client: null,
          sale: null
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000009' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-guest-1',
          clientId: null,
          appointmentId: 'appointment-guest-1',
          saleNumber: 'V-000010',
          total: 35,
          paymentMethod: 'CASH',
          showInOfficialCash: true,
          client: null,
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-guest-1',
          clientId: null,
          appointmentId: 'appointment-guest-1',
          saleNumber: 'V-000010',
          total: 35,
          paymentMethod: 'CASH',
          showInOfficialCash: true,
          client: null,
          appointment: {
            guestName: 'Cliente puntual',
            service: { id: 'service-1', name: 'Limpieza facial' },
            client: null
          },
          user: { id: 'user-1', name: 'Lucy' },
          items: [],
          accountBalanceMovements: [],
          cashMovement: null
        })
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      },
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined),
        findUnique: vi.fn().mockResolvedValue(null)
      },
      bonoPack: {
        create: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([])
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))
    prismaMock.setting.findUnique.mockResolvedValue(null)

    const response = await request(app)
      .post('/api/sales')
      .set('Authorization', createAuthHeader())
      .send({
        clientId: null,
        appointmentId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f57',
        items: [
          {
            serviceId: '3adf3ca8-c749-4f40-9f2e-54a8ff0f8f59',
            description: 'Limpieza facial',
            quantity: 1,
            price: 35
          }
        ],
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        professional: 'LUCY',
        discount: 0,
        tax: 0,
        showInOfficialCash: true
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({ id: 'sale-guest-1', clientId: null }))
  })

  it('GET /api/calendar/config rejects non-admin users', async () => {
    const response = await request(app)
      .get('/api/calendar/config')
      .set('Authorization', createEmployeeAuthHeader())

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Admin access required')
  })

  it('GET /api/calendar/config returns default config for admin when not connected', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)

    const response = await request(app)
      .get('/api/calendar/config')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.objectContaining({
        connected: false,
        enabled: false,
        sendClientInvites: true,
        calendarId: 'primary'
      })
    )
  })

  it('POST /api/calendar/sync returns 400 when Google Calendar is not connected', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)

    const response = await request(app)
      .post('/api/calendar/sync')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Google Calendar no está conectado')
  })

  it('POST /api/calendar/sync runs a manual full sync for admins', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: false,
      sendClientInvites: true
    })

    const response = await request(app)
      .post('/api/calendar/sync')
      .set('Authorization', createAuthHeader())

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.objectContaining({
        message: expect.any(String),
        summary: expect.objectContaining({
          total: 0,
          synced: 0,
          failed: 0,
          skipped: 0
        })
      })
    )
  })
})
