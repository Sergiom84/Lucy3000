import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('../../../src/renderer/utils/api', () => ({
  default: {
    get: mockGet
  }
}))

describe('appointmentCatalogs', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGet.mockReset()
  })

  it('caches the client catalog between reads', async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ id: 'client-1', firstName: 'Ana', lastName: 'Lopez' }]
    })

    const { loadAppointmentClients } = await import('../../../src/renderer/utils/appointmentCatalogs')

    const firstLoad = await loadAppointmentClients()
    const secondLoad = await loadAppointmentClients()

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(secondLoad).toEqual(firstLoad)
  })

  it('reloads the client catalog after invalidation', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [{ id: 'client-1', firstName: 'Ana', lastName: 'Lopez' }]
      })
      .mockResolvedValueOnce({
        data: [{ id: 'client-2', firstName: 'Elena', lastName: 'Manzanares' }]
      })

    const { invalidateAppointmentClientsCache, loadAppointmentClients } = await import(
      '../../../src/renderer/utils/appointmentCatalogs'
    )

    await loadAppointmentClients()
    invalidateAppointmentClientsCache()
    const nextLoad = await loadAppointmentClients()

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(nextLoad).toEqual([{ id: 'client-2', firstName: 'Elena', lastName: 'Manzanares' }])
  })

  it('reloads the service catalog after invalidation', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [{ id: 'service-1', name: 'Limpieza facial' }]
      })
      .mockResolvedValueOnce({
        data: [{ id: 'service-2', name: 'Radiofrecuencia' }]
      })

    const { invalidateAppointmentServicesCache, loadAppointmentServices } = await import(
      '../../../src/renderer/utils/appointmentCatalogs'
    )

    await loadAppointmentServices()
    invalidateAppointmentServicesCache()
    const nextLoad = await loadAppointmentServices()

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(nextLoad).toEqual([{ id: 'service-2', name: 'Radiofrecuencia' }])
  })

  it('reloads the bono catalog after invalidation', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [{ id: 'bono-1', description: 'Bono de 4 sesiones', category: 'Corporal', serviceId: 'service-1', serviceName: 'Maderoterapia', serviceLookup: 'MAD-01', totalSessions: 4, price: 220, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' }]
      })
      .mockResolvedValueOnce({
        data: [{ id: 'bono-2', description: 'Bono de 6 sesiones', category: 'Corporal', serviceId: 'service-2', serviceName: 'Presoterapia', serviceLookup: 'PRE-01', totalSessions: 6, price: 354, isActive: true, createdAt: '2026-01-02T00:00:00.000Z' }]
      })

    const { invalidateBonoTemplatesCache, loadBonoTemplates } = await import(
      '../../../src/renderer/utils/appointmentCatalogs'
    )

    await loadBonoTemplates()
    invalidateBonoTemplatesCache()
    const nextLoad = await loadBonoTemplates()

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(nextLoad).toEqual([
      {
        id: 'bono-2',
        description: 'Bono de 6 sesiones',
        category: 'Corporal',
        serviceId: 'service-2',
        serviceName: 'Presoterapia',
        serviceLookup: 'PRE-01',
        totalSessions: 6,
        price: 354,
        isActive: true,
        createdAt: '2026-01-02T00:00:00.000Z'
      }
    ])
  })

  it('reloads the product catalog after invalidation', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [{ id: 'product-1', name: 'Champu hidratante' }]
      })
      .mockResolvedValueOnce({
        data: [{ id: 'product-2', name: 'Mascarilla reparadora' }]
      })

    const { invalidateActiveProductsCache, loadActiveProducts } = await import(
      '../../../src/renderer/utils/appointmentCatalogs'
    )

    await loadActiveProducts()
    invalidateActiveProductsCache()
    const nextLoad = await loadActiveProducts()

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(nextLoad).toEqual([{ id: 'product-2', name: 'Mascarilla reparadora' }])
  })

  it('preserves the professionals order returned by the API', async () => {
    mockGet.mockResolvedValueOnce({
      data: ['Lucy', 'Tamara', 'Chema', 'Otros']
    })

    const { loadAppointmentProfessionals } = await import('../../../src/renderer/utils/appointmentCatalogs')

    const professionals = await loadAppointmentProfessionals()

    expect(professionals).toEqual(['Lucy', 'Tamara', 'Chema', 'Otros'])
  })
})
