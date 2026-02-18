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
})
