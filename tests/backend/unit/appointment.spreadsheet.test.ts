import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildNormalizedAppointmentImportRow,
  buildAppointmentsExportWorkbook,
  isLikelyAgendaBlockRow,
  matchAppointmentClient,
  matchAppointmentService
} from '../../../src/backend/utils/appointment-spreadsheet'

describe('appointment spreadsheet helpers', () => {
  it('matches a service by code, description and minutes even when codes repeat', () => {
    const services = [
      {
        id: 'service-1',
        serviceCode: 'RECO',
        name: 'Reconstruccion 1 sesion',
        duration: 60
      },
      {
        id: 'service-2',
        serviceCode: 'RECO',
        name: 'Reconstruccion 4 sesiones',
        duration: 60
      }
    ]

    const result = matchAppointmentService(services, 'RECO', 'Reconstruccion 4 sesiones', 60)

    expect(result.error).toBeNull()
    expect(result.service).toEqual(
      expect.objectContaining({
        id: 'service-2'
      })
    )
  })

  it('matches a client by external code', () => {
    const clients = [
      {
        id: 'client-1',
        externalCode: '143',
        firstName: 'Clara',
        lastName: 'Ruiz Calcerrada'
      }
    ]

    const result = matchAppointmentClient(clients, {
      clientCode: 143
    })

    expect(result.error).toBeNull()
    expect(result.client).toEqual(
      expect.objectContaining({
        id: 'client-1',
        externalCode: '143'
      })
    )
  })

  it('falls back to phone when the external code is missing in the local database', () => {
    const clients = [
      {
        id: 'client-1',
        externalCode: '2633',
        firstName: 'PATRI',
        lastName: 'JUAREZ JUAREZ',
        phone: '626141841',
        mobilePhone: '626141841'
      }
    ]

    const result = matchAppointmentClient(clients, {
      clientCode: 1,
      clientName: 'PATRICIA JUAREZ',
      phone: '626141841'
    })

    expect(result.error).toBeNull()
    expect(result.client).toEqual(
      expect.objectContaining({
        id: 'client-1',
        externalCode: '2633'
      })
    )
  })

  it('normalizes legacy appointment template headers', () => {
    const row = buildNormalizedAppointmentImportRow({
      Fecha: '20-04-26',
      'Hora inicio': '10:45',
      Minutos: 20,
      'Nº Cliente': 143,
      Cliente: 'CLARA RUIZ CALCERRADA',
      'Codigo servicio': 'SHRMEN',
      Servicio: 'Menton shr',
      Cabina: 'CABINA',
      Profesional: 'LUCY'
    })

    expect(row.time).toBe('10:45')
    expect(row.clientCode).toBe(143)
    expect(row.serviceCode).toBe('SHRMEN')
    expect(row.serviceDescription).toBe('Menton shr')
  })

  it('detects agenda block rows from the imported spreadsheet', () => {
    expect(
      isLikelyAgendaBlockRow({
        clientCode: 1,
        clientName: 'PILATES',
        serviceCode: null,
        serviceDescription: null
      })
    ).toBe(true)
  })

  it('picks a canonical service when the database contains exact duplicates', () => {
    const services = [
      {
        id: 'service-2',
        serviceCode: 'SHRMEN',
        name: 'Menton shr',
        duration: 20,
        isActive: true,
        createdAt: new Date('2026-03-30T19:36:02.196Z')
      },
      {
        id: 'service-1',
        serviceCode: 'SHRMEN',
        name: 'Menton shr',
        duration: 20,
        isActive: true,
        createdAt: new Date('2026-03-30T12:40:37.116Z')
      }
    ]

    const result = matchAppointmentService(services, 'SHRMEN', 'Menton shr', 20)

    expect(result.error).toBeNull()
    expect(result.service).toEqual(
      expect.objectContaining({
        id: 'service-1'
      })
    )
  })

  it('falls back to a unique code and description match when minutes differ in the Excel', () => {
    const services = [
      {
        id: 'service-1',
        serviceCode: 'HFH',
        name: 'Higiene facial con hidratacion',
        duration: 90,
        isActive: true,
        createdAt: new Date('2026-03-30T12:40:37.032Z')
      },
      {
        id: 'service-2',
        serviceCode: 'HFH',
        name: 'Higiene facial con hidratacion',
        duration: 90,
        isActive: true,
        createdAt: new Date('2026-03-30T19:36:02.068Z')
      }
    ]

    const result = matchAppointmentService(services, 'HFH', 'Higiene facial con hidratacion', 80)

    expect(result.error).toBeNull()
    expect(result.service).toEqual(
      expect.objectContaining({
        id: 'service-1',
        duration: 90
      })
    )
  })

  it('matches generic exported descriptions when the local service name is more specific', () => {
    const services = [
      {
        id: 'service-1',
        serviceCode: 'RECO',
        name: 'Reconstruccion 2 arolas - 1 sesión',
        duration: 30,
        isActive: true,
        createdAt: new Date('2026-03-30T12:40:37.088Z')
      },
      {
        id: 'service-2',
        serviceCode: 'RECO',
        name: 'Reconstruccion 2 arolas - 1 sesión',
        duration: 30,
        isActive: true,
        createdAt: new Date('2026-03-30T19:36:02.152Z')
      }
    ]

    const result = matchAppointmentService(services, 'RECO', 'Reconstruccion', 30)

    expect(result.error).toBeNull()
    expect(result.service).toEqual(
      expect.objectContaining({
        id: 'service-1',
        duration: 30
      })
    )
  })

  it('builds an export workbook with the expected spreadsheet columns', async () => {
    const workbook = buildAppointmentsExportWorkbook([
      {
        date: new Date('2026-04-20T00:00:00.000Z'),
        startTime: '10:45',
        endTime: '11:05',
        cabin: 'CABINA',
        professional: 'LUCY',
        notes: 'Primera cita',
        client: {
          externalCode: '143',
          firstName: 'CLARA',
          lastName: 'RUIZ CALCERRADA',
          phone: '670312806',
          email: 'clara@example.com'
        },
        service: {
          serviceCode: 'SHRMEN',
          name: 'Menton shr',
          duration: 20
        }
      }
    ])

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    const parsed = new ExcelJS.Workbook()
    await parsed.xlsx.load(buffer)

    const worksheet = parsed.getWorksheet('Citas')
    expect(worksheet).toBeDefined()
    expect(worksheet?.getRow(1).values.slice(1)).toEqual([
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
    ])
    expect(worksheet?.getRow(2).getCell(4).value).toBe('143')
    expect(worksheet?.getRow(2).getCell(7).value).toBe('Menton shr')
    expect(worksheet?.getRow(2).getCell(12).value).toBe('Primera cita')
  })
})
