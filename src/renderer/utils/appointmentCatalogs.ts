import api from './api'

type AppointmentClientCatalogItem = {
  id: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  email?: string | null
}

export type AppointmentServiceCatalogItem = {
  id: string
  name?: string | null
  serviceCode?: string | null
  category?: string | null
  duration?: number | null
}

export type AppointmentProfessionalCatalogItem = string

type AppointmentProductCatalogItem = {
  id: string
  name?: string | null
}

export type BonoTemplateCatalogItem = {
  id: string
  category: string
  description: string
  serviceId: string
  serviceName: string
  serviceLookup: string
  totalSessions: number
  price: number
  isActive: boolean
  createdAt: string
}

export type AppointmentLegendCatalogItem = {
  id: string
  category: string
  color: string
  sortOrder: number
}

export type AppointmentLegendCategoryCatalogItem = string

let clientsCache: AppointmentClientCatalogItem[] | null = null
let clientsPromise: Promise<AppointmentClientCatalogItem[]> | null = null
let clientsCacheVersion = 0

let servicesCache: AppointmentServiceCatalogItem[] | null = null
let servicesPromise: Promise<AppointmentServiceCatalogItem[]> | null = null
let servicesCacheVersion = 0

let productsCache: AppointmentProductCatalogItem[] | null = null
let productsPromise: Promise<AppointmentProductCatalogItem[]> | null = null
let productsCacheVersion = 0

let professionalsCache: AppointmentProfessionalCatalogItem[] | null = null
let professionalsPromise: Promise<AppointmentProfessionalCatalogItem[]> | null = null
let professionalsCacheVersion = 0

let bonoTemplatesCache: BonoTemplateCatalogItem[] | null = null
let bonoTemplatesPromise: Promise<BonoTemplateCatalogItem[]> | null = null
let bonoTemplatesCacheVersion = 0

let appointmentLegendsCache: AppointmentLegendCatalogItem[] | null = null
let appointmentLegendsPromise: Promise<AppointmentLegendCatalogItem[]> | null = null

let appointmentLegendCategoriesCache: AppointmentLegendCategoryCatalogItem[] | null = null
let appointmentLegendCategoriesPromise: Promise<AppointmentLegendCategoryCatalogItem[]> | null = null

export const invalidateAppointmentClientsCache = () => {
  clientsCacheVersion += 1
  clientsCache = null
  clientsPromise = null
}

export const invalidateAppointmentServicesCache = () => {
  servicesCacheVersion += 1
  servicesCache = null
  servicesPromise = null
}

export const invalidateBonoTemplatesCache = () => {
  bonoTemplatesCacheVersion += 1
  bonoTemplatesCache = null
  bonoTemplatesPromise = null
}

export const invalidateActiveProductsCache = () => {
  productsCacheVersion += 1
  productsCache = null
  productsPromise = null
}

export const invalidateAppointmentProfessionalsCache = () => {
  professionalsCacheVersion += 1
  professionalsCache = null
  professionalsPromise = null
}

export const invalidateAppointmentLegendsCache = () => {
  appointmentLegendsCache = null
  appointmentLegendsPromise = null
  appointmentLegendCategoriesCache = null
  appointmentLegendCategoriesPromise = null
}

const sortClients = (clients: AppointmentClientCatalogItem[]) =>
  [...clients].sort((left, right) => {
    const leftLabel = `${left.firstName || ''} ${left.lastName || ''}`.trim()
    const rightLabel = `${right.firstName || ''} ${right.lastName || ''}`.trim()
    return leftLabel.localeCompare(rightLabel, 'es', { sensitivity: 'base' })
  })

const sortServices = (services: AppointmentServiceCatalogItem[]) =>
  [...services].sort((left, right) =>
    String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' })
  )

const sortBonoTemplates = (templates: BonoTemplateCatalogItem[]) =>
  [...templates].sort((left, right) => {
    const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'es', {
      sensitivity: 'base'
    })
    if (categoryCompare !== 0) return categoryCompare

    const descriptionCompare = String(left.description || '').localeCompare(String(right.description || ''), 'es', {
      sensitivity: 'base'
    })
    if (descriptionCompare !== 0) return descriptionCompare

    return Number(left.totalSessions || 0) - Number(right.totalSessions || 0)
  })

const sortAppointmentLegends = (items: AppointmentLegendCatalogItem[]) =>
  [...items].sort((left, right) => {
    const orderCompare = Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
    if (orderCompare !== 0) return orderCompare

    return String(left.category || '').localeCompare(String(right.category || ''), 'es', {
      sensitivity: 'base'
    })
  })

const sortAppointmentLegendCategories = (items: AppointmentLegendCategoryCatalogItem[]) =>
  [...items].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))

export const loadAppointmentClients = async (options?: { forceRefresh?: boolean }) => {
  if (options?.forceRefresh) {
    invalidateAppointmentClientsCache()
  }

  if (clientsCache) {
    return clientsCache
  }

  if (!clientsPromise) {
    const requestVersion = clientsCacheVersion
    clientsPromise = api
      .get('/clients?isActive=true&includeCounts=false')
      .then((response) => {
        const nextClients = Array.isArray(response.data) ? sortClients(response.data) : []
        if (requestVersion === clientsCacheVersion) {
          clientsCache = nextClients
        }
        return nextClients
      })
      .finally(() => {
        if (requestVersion === clientsCacheVersion) {
          clientsPromise = null
        }
      })
  }

  return clientsPromise
}

export const loadAppointmentServices = async (options?: { forceRefresh?: boolean }) => {
  if (options?.forceRefresh) {
    invalidateAppointmentServicesCache()
  }

  if (servicesCache) {
    return servicesCache
  }

  if (!servicesPromise) {
    const requestVersion = servicesCacheVersion
    servicesPromise = api
      .get('/services?isActive=true')
      .then((response) => {
        const nextServices = Array.isArray(response.data) ? sortServices(response.data) : []
        if (requestVersion === servicesCacheVersion) {
          servicesCache = nextServices
        }
        return nextServices
      })
      .finally(() => {
        if (requestVersion === servicesCacheVersion) {
          servicesPromise = null
        }
      })
  }

  return servicesPromise
}

export const loadActiveProducts = async (options?: { forceRefresh?: boolean }) => {
  if (options?.forceRefresh) {
    invalidateActiveProductsCache()
  }

  if (productsCache) {
    return productsCache
  }

  if (!productsPromise) {
    const requestVersion = productsCacheVersion
    productsPromise = api
      .get('/products?isActive=true')
      .then((response) => {
        const nextProducts = Array.isArray(response.data) ? sortServices(response.data) : []
        if (requestVersion === productsCacheVersion) {
          productsCache = nextProducts
        }
        return nextProducts
      })
      .finally(() => {
        if (requestVersion === productsCacheVersion) {
          productsPromise = null
        }
      })
  }

  return productsPromise
}

export const loadAppointmentProfessionals = async (options?: { forceRefresh?: boolean }) => {
  if (options?.forceRefresh) {
    invalidateAppointmentProfessionalsCache()
  }

  if (professionalsCache) {
    return professionalsCache
  }

  if (!professionalsPromise) {
    const requestVersion = professionalsCacheVersion
    professionalsPromise = api
      .get('/appointments/professionals')
      .then((response) => {
        const nextProfessionals = Array.isArray(response.data)
          ? response.data.filter(
              (item): item is string => typeof item === 'string' && item.trim().length > 0
            )
          : []
        if (requestVersion === professionalsCacheVersion) {
          professionalsCache = nextProfessionals
        }
        return nextProfessionals
      })
      .finally(() => {
        if (requestVersion === professionalsCacheVersion) {
          professionalsPromise = null
        }
      })
  }

  return professionalsPromise
}

export const loadBonoTemplates = async (options?: { forceRefresh?: boolean }) => {
  if (options?.forceRefresh) {
    invalidateBonoTemplatesCache()
  }

  if (bonoTemplatesCache) {
    return bonoTemplatesCache
  }

  if (!bonoTemplatesPromise) {
    const requestVersion = bonoTemplatesCacheVersion
    bonoTemplatesPromise = api
      .get('/bonos/templates')
      .then((response) => {
        const nextTemplates = Array.isArray(response.data) ? sortBonoTemplates(response.data) : []
        if (requestVersion === bonoTemplatesCacheVersion) {
          bonoTemplatesCache = nextTemplates
        }
        return nextTemplates
      })
      .finally(() => {
        if (requestVersion === bonoTemplatesCacheVersion) {
          bonoTemplatesPromise = null
        }
      })
  }

  return bonoTemplatesPromise
}

export const createBonoTemplateItem = async (payload: {
  category?: string
  description: string
  serviceId: string
  totalSessions: number
  price: number
  isActive: boolean
}) => {
  await api.post('/bonos/templates', payload)
  return loadBonoTemplates({ forceRefresh: true })
}

export const loadAppointmentLegendItems = async () => {
  if (appointmentLegendsCache) {
    return appointmentLegendsCache
  }

  if (!appointmentLegendsPromise) {
    appointmentLegendsPromise = api
      .get('/appointments/legend')
      .then((response) => {
        const nextLegends = Array.isArray(response.data) ? sortAppointmentLegends(response.data) : []
        appointmentLegendsCache = nextLegends
        return nextLegends
      })
      .finally(() => {
        appointmentLegendsPromise = null
      })
  }

  return appointmentLegendsPromise
}

export const loadAppointmentLegendCategories = async () => {
  if (appointmentLegendCategoriesCache) {
    return appointmentLegendCategoriesCache
  }

  if (!appointmentLegendCategoriesPromise) {
    appointmentLegendCategoriesPromise = api
      .get('/appointments/legend/categories')
      .then((response) => {
        const nextCategories = Array.isArray(response.data)
          ? sortAppointmentLegendCategories(response.data.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
          : []
        appointmentLegendCategoriesCache = nextCategories
        return nextCategories
      })
      .finally(() => {
        appointmentLegendCategoriesPromise = null
      })
  }

  return appointmentLegendCategoriesPromise
}

export const createAppointmentLegendItem = async (payload: { category: string; color: string }) => {
  const response = await api.post('/appointments/legend', payload)
  const nextItem = response.data as AppointmentLegendCatalogItem
  const nextLegends = sortAppointmentLegends([...(appointmentLegendsCache || []), nextItem])
  appointmentLegendsCache = nextLegends
  return nextLegends
}

export const deleteAppointmentLegendItem = async (id: string) => {
  await api.delete(`/appointments/legend/${id}`)
  const nextLegends = sortAppointmentLegends(
    (appointmentLegendsCache || []).filter((item) => item.id !== id)
  )
  appointmentLegendsCache = nextLegends
  return nextLegends
}

export const preloadAppointmentFormCatalogs = async () => {
  await Promise.allSettled([
    loadAppointmentClients(),
    loadAppointmentServices(),
    loadAppointmentProfessionals()
  ])
}

export const preloadPointOfSaleCatalogs = async () => {
  await Promise.allSettled([
    loadAppointmentClients(),
    loadAppointmentServices(),
    loadActiveProducts(),
    loadBonoTemplates()
  ])
}
