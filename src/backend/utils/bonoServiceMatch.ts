export type ComparableService = {
  id?: string | null
  name?: string | null
  serviceCode?: string | null
  category?: string | null
} | null | undefined

export type ComparableBonoTemplate = {
  id?: string | null
  serviceId?: string | null
  serviceName?: string | null
  serviceLookup?: string | null
  category?: string | null
  isActive?: boolean | null
} | null | undefined

export type BonoServiceMatchOptions = {
  templates?: ComparableBonoTemplate[] | null
  allowGenericBono?: boolean
  requireAllAppointmentServices?: boolean
}

const normalizeComparableText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

const normalizeComparableServiceId = (value: unknown) => String(value || '').trim()
const normalizeComparableServiceName = (value: unknown) => normalizeComparableText(value)
const normalizeComparableServiceCode = (value: unknown) => normalizeComparableText(value)
const normalizeComparableServiceCategory = (value: unknown) => normalizeComparableText(value)

const normalizeComparableServiceFamily = (value: unknown) =>
  normalizeComparableServiceName(value)
    .replace(/\b\d+\s*(MIN|MINS|MINUTO|MINUTOS)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const buildComparableFamilyKey = (category: unknown, value: unknown) => {
  const family = normalizeComparableServiceFamily(value)
  if (!family) return ''

  const normalizedCategory = normalizeComparableServiceCategory(category)
  return normalizedCategory ? `${normalizedCategory}::${family}` : family
}

const hasComparableServiceIdentity = (service: ComparableService) =>
  Boolean(
    normalizeComparableServiceId(service?.id) ||
      normalizeComparableServiceName(service?.name) ||
      normalizeComparableServiceCode(service?.serviceCode)
  )

const doesComparableServiceMatchTemplate = (
  service: ComparableService,
  template: ComparableBonoTemplate
) => {
  const serviceId = normalizeComparableServiceId(service?.id)
  const templateServiceId = normalizeComparableServiceId(template?.serviceId)
  if (serviceId && templateServiceId && serviceId === templateServiceId) {
    return true
  }

  const serviceCode = normalizeComparableServiceCode(service?.serviceCode)
  const templateLookup = normalizeComparableServiceCode(template?.serviceLookup)
  if (serviceCode && templateLookup && serviceCode === templateLookup) {
    return true
  }

  const serviceName = normalizeComparableServiceName(service?.name)
  const templateServiceName = normalizeComparableServiceName(template?.serviceName)
  if (serviceName && templateServiceName && serviceName === templateServiceName) {
    return true
  }

  const serviceFamily = normalizeComparableServiceFamily(service?.name)
  const templateFamily =
    normalizeComparableServiceFamily(template?.serviceName) ||
    normalizeComparableServiceFamily(template?.serviceLookup)
  if (!serviceFamily || !templateFamily || serviceFamily !== templateFamily) {
    return false
  }

  const serviceCategory = normalizeComparableServiceCategory(service?.category)
  const templateCategory = normalizeComparableServiceCategory(template?.category)

  if (serviceCategory && templateCategory) {
    return serviceCategory === templateCategory
  }

  return true
}

const collectComparableServiceKeys = (
  service: ComparableService,
  templates: ComparableBonoTemplate[]
) => {
  const keys = new Set<string>()
  const directFamilyKey = buildComparableFamilyKey(service?.category, service?.name)
  if (directFamilyKey) {
    keys.add(directFamilyKey)
  }

  if (!normalizeComparableServiceCategory(service?.category)) {
    const unscopedFamily = normalizeComparableServiceFamily(service?.name)
    if (unscopedFamily) {
      keys.add(unscopedFamily)
    }
  }

  for (const template of templates) {
    const isTemplateActive = template?.isActive !== false
    if (!isTemplateActive || !doesComparableServiceMatchTemplate(service, template)) {
      continue
    }

    const templateFamilyKey =
      buildComparableFamilyKey(template?.category, template?.serviceName) ||
      buildComparableFamilyKey(template?.category, template?.serviceLookup)

    if (templateFamilyKey) {
      keys.add(templateFamilyKey)
    }

    if (!normalizeComparableServiceCategory(template?.category)) {
      const unscopedTemplateFamily =
        normalizeComparableServiceFamily(template?.serviceName) ||
        normalizeComparableServiceFamily(template?.serviceLookup)
      if (unscopedTemplateFamily) {
        keys.add(unscopedTemplateFamily)
      }
    }
  }

  return keys
}

const haveCommonComparableKey = (leftKeys: Set<string>, rightKeys: Set<string>) => {
  for (const key of leftKeys) {
    if (rightKeys.has(key)) {
      return true
    }
  }

  return false
}

export const areComparableServicesCompatible = (
  leftService: ComparableService,
  rightService: ComparableService,
  options: BonoServiceMatchOptions = {}
) => {
  const leftId = normalizeComparableServiceId(leftService?.id)
  const rightId = normalizeComparableServiceId(rightService?.id)

  if (leftId && rightId && leftId === rightId) {
    return true
  }

  const leftCode = normalizeComparableServiceCode(leftService?.serviceCode)
  const rightCode = normalizeComparableServiceCode(rightService?.serviceCode)
  if (leftCode && rightCode && leftCode === rightCode) {
    return true
  }

  const leftName = normalizeComparableServiceName(leftService?.name)
  const rightName = normalizeComparableServiceName(rightService?.name)
  if (leftName && rightName && leftName === rightName) {
    return true
  }

  const templates = Array.isArray(options.templates) ? options.templates : []
  const leftKeys = collectComparableServiceKeys(leftService, templates)
  const rightKeys = collectComparableServiceKeys(rightService, templates)

  return haveCommonComparableKey(leftKeys, rightKeys)
}

export const doesAppointmentMatchBonoService = (
  appointmentServices: ComparableService[],
  bonoService: ComparableService,
  options: BonoServiceMatchOptions = {}
) => {
  const comparableAppointmentServices = appointmentServices.filter(hasComparableServiceIdentity)
  if (comparableAppointmentServices.length === 0) {
    return false
  }

  const bonoServiceId = normalizeComparableServiceId(bonoService?.id)
  const bonoServiceName = normalizeComparableServiceName(bonoService?.name)
  const bonoServiceCode = normalizeComparableServiceCode(bonoService?.serviceCode)

  if (!bonoServiceId && !bonoServiceName && !bonoServiceCode) {
    return Boolean(options.allowGenericBono)
  }

  const compareAppointmentService = (appointmentService: ComparableService) =>
    areComparableServicesCompatible(appointmentService, bonoService, options)

  if (options.requireAllAppointmentServices === false) {
    return comparableAppointmentServices.some(compareAppointmentService)
  }

  return comparableAppointmentServices.every(compareAppointmentService)
}
