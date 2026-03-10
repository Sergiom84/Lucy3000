import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../../src/backend/app'
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

describe('API smoke tests', () => {
  beforeEach(() => {
    resetPrismaMock()
    process.env.JWT_SECRET = 'test-jwt-secret'
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

  it('POST /api/appointments accepts cabin payload and creates appointment', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'TAMARA',
      reminder: false,
      date: new Date('2026-03-07T10:00:00.000Z'),
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
      date: new Date('2026-03-07T10:00:00.000Z'),
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
        date: '2026-03-07T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        reminder: false
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({ id: 'appointment-1', cabin: 'TAMARA' }))
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
})
