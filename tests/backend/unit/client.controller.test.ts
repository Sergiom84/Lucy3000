import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, getClients, importClientsFromExcel, updateClient } from '../../../src/backend/controllers/client.controller'
import { createWorkbookBuffer } from '../helpers/spreadsheet'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('client.controller list ordering', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('getClients returns paginated clients ordered by latest completed appointment activity', async () => {
    prismaMock.client.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'client-2' }, { id: 'client-1' }])
    prismaMock.appointment.groupBy.mockResolvedValue([
      {
        clientId: 'client-2',
        _max: {
          date: new Date('2026-04-10T00:00:00.000Z')
        }
      }
    ])
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'client-1',
        firstName: 'Ana',
        lastName: 'Lopez',
        lastVisit: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        id: 'client-2',
        firstName: 'Beatriz',
        lastName: 'Ruiz',
        lastVisit: null
      }
    ])

    const req = createMockRequest({
      query: {
        paginated: 'true',
        includeCounts: 'true',
        page: '1',
        limit: '50'
      }
    })
    const res = createMockResponse()

    await getClients(req as any, res)

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1)
    const sql = prismaMock.$queryRaw.mock.calls[0][0]?.sql || ''
    expect(sql).toContain(`a."status" = 'COMPLETED'`)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: ['client-2', 'client-1']
          }
        }
      })
    )
    expect(prismaMock.appointment.groupBy).toHaveBeenCalledWith({
      by: ['clientId'],
      where: {
        clientId: {
          in: ['client-2', 'client-1']
        },
        status: 'COMPLETED'
      },
      _max: {
        date: true
      }
    })
    expect(res.json).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'client-2',
          effectiveLastVisit: new Date('2026-04-10T00:00:00.000Z')
        }),
        expect.objectContaining({
          id: 'client-1',
          effectiveLastVisit: new Date('2026-03-01T00:00:00.000Z')
        })
      ],
      pagination: {
        page: 1,
        limit: 50,
        total: 2,
        totalPages: 1
      },
      summary: {
        total: 2,
        active: 2,
        debtAlerts: 1
      }
    })
  })

  it('getClients uses numeric ordering when sorting by client number', async () => {
    prismaMock.$queryRaw.mockResolvedValue([])

    const req = createMockRequest({
      query: {
        sortBy: 'clientNumber',
        sortDirection: 'asc'
      }
    })
    const res = createMockResponse()

    await getClients(req as any, res)

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1)
    const sql = prismaMock.$queryRaw.mock.calls[0][0]?.sql || ''
    expect(sql).toContain('CAST(TRIM(c."externalCode") AS INTEGER)')
    expect(sql).toContain(`NOT GLOB '*[^0-9]*'`)
  })

  it('getClients summary counts clients with pending amount even without debt alert flag', async () => {
    prismaMock.client.count
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(13)
    prismaMock.$queryRaw.mockResolvedValue([])
    prismaMock.appointment.groupBy.mockResolvedValue([])
    prismaMock.client.findMany.mockResolvedValue([])

    const req = createMockRequest({
      query: {
        paginated: 'true',
        includeCounts: 'true',
        isActive: 'true'
      }
    })
    const res = createMockResponse()

    await getClients(req as any, res)

    expect(prismaMock.client.count.mock.calls[2][0]).toEqual({
      where: {
        AND: [
          { isActive: true },
          { pendingAmount: { gt: 0 } }
        ]
      }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: {
          total: 20,
          active: 18,
          debtAlerts: 13
        }
      })
    )
  })
})

describe('client.controller gender validation', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('createClient accepts HOMBRE and returns 201', async () => {
    prismaMock.client.create.mockResolvedValue({
      id: 'client-1',
      firstName: 'Juan',
      lastName: 'Perez',
      pendingAmount: 0,
      debtAlertEnabled: false,
      isActive: true
    })

    const req = createMockRequest({
      body: {
        firstName: 'Juan',
        lastName: 'Perez',
        phone: '600000000',
        gender: 'hombre'
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gender: 'HOMBRE'
        })
      })
    )
  })

  it('createClient rejects missing gender', async () => {
    const req = createMockRequest({
      body: {
        firstName: 'Ana',
        lastName: 'Lopez',
        phone: '600000001'
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Gender must be HOMBRE or MUJER'
      })
    )
    expect(prismaMock.client.create).not.toHaveBeenCalled()
  })

  it('createClient rejects invalid gender', async () => {
    const req = createMockRequest({
      body: {
        firstName: 'Ana',
        lastName: 'Lopez',
        phone: '600000001',
        gender: 'OTRO'
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Gender must be HOMBRE or MUJER'
      })
    )
    expect(prismaMock.client.create).not.toHaveBeenCalled()
  })

  it('createClient normalizes null totalSpent to zero', async () => {
    prismaMock.client.create.mockResolvedValue({
      id: 'client-1',
      firstName: 'Sergio',
      lastName: 'Hernandez Lara',
      pendingAmount: 0,
      debtAlertEnabled: false,
      isActive: true
    })

    const req = createMockRequest({
      body: {
        firstName: 'Sergio',
        lastName: 'Hernandez Lara',
        phone: '600000000',
        gender: 'HOMBRE',
        totalSpent: null
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalSpent: 0
        })
      })
    )
  })

  it('updateClient rejects invalid gender when provided', async () => {
    const req = createMockRequest({
      params: { id: 'client-1' },
      body: {
        gender: 'OTRO'
      }
    })
    const res = createMockResponse()

    await updateClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Gender must be HOMBRE or MUJER'
      })
    )
    expect(prismaMock.client.update).not.toHaveBeenCalled()
  })

  it('updateClient keeps behavior when gender is not provided', async () => {
    prismaMock.client.update.mockResolvedValue({
      id: 'client-1',
      firstName: 'Ana',
      lastName: 'Lopez',
      pendingAmount: 0,
      debtAlertEnabled: false,
      isActive: true
    })

    const req = createMockRequest({
      params: { id: 'client-1' },
      body: {
        notes: 'Actualizada'
      }
    })
    const res = createMockResponse()

    await updateClient(req as any, res)

    expect(prismaMock.client.update).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalledWith(400)
  })

  it('importClientsFromExcel maps extended Lucy3000 client fields and resolves linked references', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'linked-1',
        externalCode: 'CL-002',
        email: 'laura@example.com',
        phone: '699111222',
        mobilePhone: null,
        landlinePhone: null,
        firstName: 'Laura',
        lastName: 'Garcia'
      }
    ])
    prismaMock.client.create.mockImplementation(async ({ data }: any) => ({
      id: 'client-1',
      ...data
    }))
    prismaMock.client.update.mockResolvedValue({ id: 'client-1', linkedClientId: 'linked-1' })

    const buffer = await createWorkbookBuffer([
      [
        'Nº Cliente',
        'DNI',
        'Nombre',
        'Apellidos',
        'Sexo',
        'Teléfono principal',
        'Móvil',
        'Teléfono fijo',
        'Email',
        'Fecha de nacimiento',
        'Fecha de alta',
        'Última visita',
        'Dirección',
        'Ciudad',
        'CP',
        'Provincia',
        'Nº tratamientos activos',
        'Tratamientos activos',
        'Nº abonos',
        'Cheque regalo',
        'Obsequios',
        'Cantidad de servicios',
        'Importe facturado',
        'Importe pendiente',
        'Saldo a cuenta',
        'Avisar deuda',
        'Parentesco',
        'Cliente vinculado',
        'Alergias',
        'Notas',
        'Cliente activo'
      ],
      [
        'CL-001',
        '12345678A',
        'Maria',
        'Garcia Lopez',
        'MUJER',
        '600123456',
        '600123456',
        '914445566',
        'maria@example.com',
        '1985-03-15',
        '2026-01-10',
        '2026-03-20',
        'Calle Mayor, 1',
        'Madrid',
        '28001',
        'Madrid',
        '2',
        'Radiofrecuencia, Presoterapia',
        '1',
        'NAVIDAD26',
        'Crema hidratante',
        '12',
        '1250,50',
        '25,00',
        '30,00',
        'SI',
        'Madre',
        'CL-002',
        'Látex',
        'Prefiere citas de mañana',
        'NO'
      ]
    ], 'Clientes')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importClientsFromExcel(req as any, res)

    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalCode: 'CL-001',
          dni: '12345678A',
          firstName: 'Maria',
          lastName: 'Garcia Lopez',
          phone: '600123456',
          mobilePhone: '600123456',
          landlinePhone: '914445566',
          email: 'maria@example.com',
          gender: 'MUJER',
          birthDay: 15,
          birthMonthNumber: 3,
          birthMonthName: 'Marzo',
          birthYear: 1985,
          activeTreatmentCount: 2,
          activeTreatmentNames: 'Radiofrecuencia, Presoterapia',
          bondCount: 1,
          giftVoucher: 'NAVIDAD26',
          gifts: 'Crema hidratante',
          serviceCount: 12,
          billedAmount: 1250.5,
          totalSpent: 1250.5,
          pendingAmount: 25,
          accountBalance: 30,
          debtAlertEnabled: true,
          relationshipType: 'Madre',
          linkedClientReference: 'CL-002',
          allergies: 'Látex',
          notes: 'Prefiere citas de mañana',
          isActive: false
        })
      })
    )
    expect(prismaMock.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { linkedClientId: 'linked-1' }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          skipped: 0
        })
      })
    )
  })

  it('createClient notifies admins when a non-admin creates a new client', async () => {
    prismaMock.client.create.mockResolvedValue({
      id: 'client-2',
      firstName: 'Lucia',
      lastName: 'Martinez',
      pendingAmount: 0,
      debtAlertEnabled: false,
      isActive: true
    })
    prismaMock.user.findUnique.mockResolvedValue({
      name: 'Tamara',
      email: 'tamara@example.com'
    })
    prismaMock.notification.create.mockResolvedValue({
      id: 'notification-1'
    })

    const req = createMockRequest({
      body: {
        firstName: 'Lucia',
        lastName: 'Martinez',
        phone: '600000002',
        gender: 'MUJER'
      },
      user: {
        id: 'user-employee',
        email: 'tamara@example.com',
        role: 'EMPLOYEE'
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'ADMIN_ACTIVITY',
        title: 'Actividad en clientes',
        message: 'El usuario Tamara ha añadido un nuevo cliente.',
        priority: 'NORMAL'
      })
    })
  })

  it('importClientsFromExcel keeps compatibility with legacy client template headers', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'linked-legacy',
        externalCode: '99',
        email: null,
        phone: '699000111',
        mobilePhone: null,
        landlinePhone: null,
        firstName: 'Tamara',
        lastName: 'Lopez'
      }
    ])
    prismaMock.client.create.mockImplementation(async ({ data }: any) => ({
      id: 'client-legacy',
      ...data
    }))
    prismaMock.client.update.mockResolvedValue({ id: 'client-legacy', linkedClientId: 'linked-legacy' })

    const buffer = await createWorkbookBuffer([
      [
        'NºCliente',
        'DNI',
        'Nombre',
        'Apellidos',
        'Número de Tratamientos activos',
        'Nombre de los tratamientos activos',
        'Número de abonos ',
        'Cheque regalo',
        'Dirección',
        'Ciudad',
        'CP',
        'Provincia',
        'Teléfono',
        'Móvil',
        'Sexo',
        'Fecha de nacimiento',
        'Fecha de alta',
        'Nota',
        'Obsequios',
        'Día de nacimiento',
        'Mes de Nacimiento',
        'Año de nacimiento',
        'Ultima visita',
        'Cantidad de servicios',
        'Importe facturado',
        'Importe pendiente',
        'eMail',
        'Enlazar cliente'
      ],
      [
        '7',
        '12345678Z',
        'Ana',
        'Lopez',
        '3',
        'Láser, Radiofrecuencia',
        '2',
        'REGALO25',
        'Calle Sol 5',
        'Madrid',
        '28001',
        'Madrid',
        '',
        '600000000',
        'MUJER',
        '15-03-85',
        '2026-01-10',
        'Cliente VIP',
        'Crema',
        '15',
        'Marzo',
        '1985',
        '2026-03-21',
        '7',
        '1250,00',
        '0',
        'ana@example.com',
        '99'
      ]
    ], 'Clientes')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importClientsFromExcel(req as any, res)

    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalCode: '7',
          dni: '12345678Z',
          firstName: 'Ana',
          lastName: 'Lopez',
          phone: '600000000',
          mobilePhone: '600000000',
          email: 'ana@example.com',
          activeTreatmentCount: 3,
          activeTreatmentNames: 'Láser, Radiofrecuencia',
          bondCount: 2,
          giftVoucher: 'REGALO25',
          address: 'Calle Sol 5',
          city: 'Madrid',
          postalCode: '28001',
          province: 'Madrid',
          birthDay: 15,
          birthMonthNumber: 3,
          birthMonthName: 'Marzo',
          birthYear: 1985,
          notes: 'Cliente VIP',
          gifts: 'Crema',
          linkedClientReference: '99',
          billedAmount: 1250,
          totalSpent: 1250,
          pendingAmount: 0
        })
      })
    )
    expect(prismaMock.client.update).toHaveBeenCalledWith({
      where: { id: 'client-legacy' },
      data: { linkedClientId: 'linked-legacy' }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          skipped: 0
        })
      })
    )
  })

  it('importClientsFromExcel skips rows that already exist in the current database', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'client-existing',
        externalCode: 'CL-010',
        dni: '11111111A',
        email: 'elena@example.com',
        phone: '600123123',
        mobilePhone: null,
        landlinePhone: null,
        firstName: 'Elena',
        lastName: 'Manzanares'
      }
    ])

    const buffer = await createWorkbookBuffer([
      ['Nº Cliente', 'DNI', 'Nombre', 'Apellidos', 'Sexo', 'Teléfono principal', 'Email'],
      ['CL-010', '11111111A', 'Elena', 'Manzanares', 'MUJER', '600123123', 'elena@example.com']
    ], 'Clientes')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importClientsFromExcel(req as any, res)

    expect(prismaMock.client.create).not.toHaveBeenCalled()
    expect(prismaMock.client.update).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 0,
          skipped: 1
        })
      })
    )
  })

  it('importClientsFromExcel skips duplicate rows repeated inside the same Excel file', async () => {
    prismaMock.client.findMany.mockResolvedValue([])
    prismaMock.client.create.mockImplementation(async ({ data }: any) => ({
      id: 'client-new',
      ...data
    }))

    const buffer = await createWorkbookBuffer([
      ['Nº Cliente', 'Nombre', 'Apellidos', 'Sexo', 'Teléfono principal'],
      ['CL-020', 'Lucia', 'Perez', 'MUJER', '600888777'],
      ['CL-020', 'Lucia', 'Perez', 'MUJER', '600888777']
    ], 'Clientes')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importClientsFromExcel(req as any, res)

    expect(prismaMock.client.create).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          skipped: 1
        })
      })
    )
  })

  it('getClients splits multi-term search into token clauses', async () => {
    prismaMock.$queryRaw.mockResolvedValue([])
    prismaMock.client.findMany.mockResolvedValue([])

    const req = createMockRequest({
      query: {
        search: 'ser her',
        isActive: 'true',
        includeCounts: 'false'
      }
    })
    const res = createMockResponse()

    await getClients(req as any, res)

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.$queryRaw.mock.calls[0][0].values).toEqual(
      expect.arrayContaining(['%ser%', '%her%', true])
    )
    expect(res.json).toHaveBeenCalledWith([])
  })
})
