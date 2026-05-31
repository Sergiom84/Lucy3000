import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('../../../src/renderer/utils/appointmentCatalogs', () => ({
  loadActiveProducts: vi.fn(),
  loadAppointmentLegendItems: vi.fn(),
  loadAppointmentProfessionals: vi.fn(),
  loadAppointmentServices: vi.fn(),
  loadBonoTemplates: vi.fn()
}))

vi.mock('../../../src/renderer/utils/api', () => ({
  default: {
    get: mockGet,
    post: vi.fn()
  }
}))

describe('salesApi', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGet.mockReset()
  })

  it('searches a limited client catalog instead of loading every client', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: 'client-1',
          firstName: 'Lucy',
          lastName: 'Lara',
          phone: '600000000',
          loyaltyPoints: 0,
          accountBalance: 98
        }
      ]
    })

    const { fetchSalesClients } = await import('../../../src/renderer/features/sales/salesApi')

    await expect(fetchSalesClients('lucy')).resolves.toEqual([
      {
        id: 'client-1',
        firstName: 'Lucy',
        lastName: 'Lara',
        phone: '600000000',
        loyaltyPoints: 0,
        accountBalance: 98
      }
    ])
    expect(mockGet).toHaveBeenCalledWith('/clients/catalog?isActive=true&limit=50&search=lucy')
  })
})
