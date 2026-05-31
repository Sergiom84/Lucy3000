import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('../../../src/renderer/utils/api', () => ({
  default: {
    get: mockGet
  }
}))

describe('cashApi', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGet.mockReset()
  })

  it('loads cash filters without the full client catalog', async () => {
    mockGet
      .mockResolvedValueOnce({ data: [{ id: 'service-1', name: 'Limpieza' }] })
      .mockResolvedValueOnce({ data: [{ id: 'product-1', name: 'Crema' }] })

    const { fetchCashFilterOptions } = await import('../../../src/renderer/features/cash/cashApi')

    await expect(fetchCashFilterOptions()).resolves.toEqual({
      clients: [],
      services: [{ id: 'service-1', name: 'Limpieza' }],
      products: [{ id: 'product-1', name: 'Crema' }]
    })
    expect(mockGet).toHaveBeenCalledWith('/services?isActive=true')
    expect(mockGet).toHaveBeenCalledWith('/products?isActive=true')
    expect(mockGet).not.toHaveBeenCalledWith('/clients/catalog?isActive=true&limit=5000')
  })

  it('searches client filters with a limited catalog', async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ id: 'client-1', firstName: 'Ana', lastName: 'Lopez' }]
    })

    const { fetchCashClients } = await import('../../../src/renderer/features/cash/cashApi')

    await expect(fetchCashClients('ana')).resolves.toEqual([
      { id: 'client-1', firstName: 'Ana', lastName: 'Lopez' }
    ])
    expect(mockGet).toHaveBeenCalledWith('/clients/catalog?isActive=true&limit=50&search=ana')
  })
})
