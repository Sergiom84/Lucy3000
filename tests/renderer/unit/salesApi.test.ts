import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoadAppointmentClients = vi.fn()

vi.mock('../../../src/renderer/utils/appointmentCatalogs', () => ({
  loadActiveProducts: vi.fn(),
  loadAppointmentClients: mockLoadAppointmentClients,
  loadAppointmentLegendItems: vi.fn(),
  loadAppointmentProfessionals: vi.fn(),
  loadAppointmentServices: vi.fn(),
  loadBonoTemplates: vi.fn(),
  preloadPointOfSaleCatalogs: vi.fn()
}))

vi.mock('../../../src/renderer/utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

describe('salesApi', () => {
  beforeEach(() => {
    vi.resetModules()
    mockLoadAppointmentClients.mockReset()
  })

  it('refreshes clients instead of reusing a stale catalog balance', async () => {
    mockLoadAppointmentClients.mockResolvedValueOnce([
      {
        id: 'client-1',
        firstName: 'Lucy',
        lastName: 'Lara',
        phone: '600000000',
        loyaltyPoints: 0,
        accountBalance: 98
      }
    ])

    const { fetchSalesClients } = await import('../../../src/renderer/features/sales/salesApi')

    await expect(fetchSalesClients()).resolves.toEqual([
      {
        id: 'client-1',
        firstName: 'Lucy',
        lastName: 'Lara',
        phone: '600000000',
        loyaltyPoints: 0,
        accountBalance: 98
      }
    ])
    expect(mockLoadAppointmentClients).toHaveBeenCalledWith({ forceRefresh: true })
  })
})
