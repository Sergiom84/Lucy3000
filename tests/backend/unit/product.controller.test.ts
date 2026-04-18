import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addStockMovement,
  getProducts,
  importProductsFromExcel
} from '../../../src/backend/controllers/product.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { createWorkbookBuffer } from '../helpers/spreadsheet'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('product.controller.addStockMovement', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('splits product search into token clauses across searchable fields', async () => {
    prismaMock.product.findMany.mockResolvedValue([])

    const req = createMockRequest({
      query: {
        search: 'rad fac',
        isActive: 'true'
      }
    })
    const res = createMockResponse()

    await getProducts(req as any, res)

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          AND: [
            {
              OR: expect.arrayContaining([
                { name: { contains: 'rad' } },
                { sku: { contains: 'rad' } },
                { brand: { contains: 'rad' } },
                { category: { contains: 'rad' } }
              ])
            },
            {
              OR: expect.arrayContaining([
                { name: { contains: 'fac' } },
                { sku: { contains: 'fac' } },
                { brand: { contains: 'fac' } },
                { category: { contains: 'fac' } }
              ])
            }
          ]
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith([])
  })

  it('rejects negative quantity for non-adjustment movement', async () => {
    const req = createMockRequest({
      params: { id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54' },
      body: {
        type: 'SALE',
        quantity: -5,
        reason: 'invalid',
        reference: null
      }
    })
    const res = createMockResponse()

    await addStockMovement(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Quantity must be positive for this movement type'
      })
    )
  })

  it('applies signed ADJUSTMENT movement in transaction', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54',
      stock: 10
    })

    const tx: any = {
      stockMovement: {
        create: vi.fn().mockResolvedValue({
          id: 'movement-1',
          type: 'ADJUSTMENT',
          quantity: -3
        })
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54' },
      body: {
        type: 'ADJUSTMENT',
        quantity: -3,
        reason: 'correccion',
        reference: 'INV-1'
      }
    })
    const res = createMockResponse()

    await addStockMovement(req as any, res)

    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54' },
        data: { stock: 7 }
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('updates an existing product when the imported SKU already exists', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        sku: 'CHAMP-001'
      }
    ])
    prismaMock.product.update.mockResolvedValue({})

    const buffer = await createWorkbookBuffer([
      ['ID', 'Marca', 'Familia', 'Descripcion', 'Cantidad', 'PVP'],
      ['CHAMP-001', "L'Oréal", 'Cuidado del Cabello', 'Champu hidratante 500ml', 40, '15,99']
    ], 'Productos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importProductsFromExcel(req as any, res)

    expect(prismaMock.product.create).not.toHaveBeenCalled()
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
        data: expect.objectContaining({
          name: 'Champu hidratante 500ml',
          category: 'Cuidado del Cabello',
          brand: "L'Oréal",
          price: 15.99,
          stock: 40,
          isActive: true
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          created: 0,
          updated: 1,
          skipped: 0
        })
      })
    )
  })

  it('creates only one product when the same SKU is repeated inside the Excel', async () => {
    prismaMock.product.findMany.mockResolvedValue([])
    prismaMock.product.create.mockResolvedValue({
      id: 'product-1',
      sku: 'CHAMP-001'
    })

    const buffer = await createWorkbookBuffer([
      ['ID', 'Marca', 'Familia', 'Descripcion', 'Cantidad', 'PVP'],
      ['CHAMP-001', "L'Oréal", 'Cuidado del Cabello', 'Champu hidratante 500ml', 50, '15,99'],
      ['CHAMP-001', "L'Oréal", 'Cuidado del Cabello', 'Champu hidratante 500ml', 50, '15,99']
    ], 'Productos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importProductsFromExcel(req as any, res)

    expect(prismaMock.product.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.product.update).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          created: 1,
          updated: 0,
          skipped: 1
        })
      })
    )
  })

  it('skips rows with invalid price instead of creating products', async () => {
    prismaMock.product.findMany.mockResolvedValue([])

    const buffer = await createWorkbookBuffer([
      ['ID', 'Marca', 'Familia', 'Descripcion', 'Cantidad', 'PVP'],
      ['CHAMP-001', "L'Oréal", 'Cuidado del Cabello', 'Champu hidratante 500ml', 50, 'abc']
    ], 'Productos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importProductsFromExcel(req as any, res)

    expect(prismaMock.product.create).not.toHaveBeenCalled()
    expect(prismaMock.product.update).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 0,
          created: 0,
          updated: 0,
          skipped: 1,
          errors: [expect.objectContaining({ error: expect.stringContaining('PVP inválido') })]
        })
      })
    )
  })
})
