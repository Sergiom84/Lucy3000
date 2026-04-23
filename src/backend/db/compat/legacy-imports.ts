import type { SqliteCompatibilityRuntime } from './helpers'

type StoredBonoTemplateRow = {
  id: string
  serviceId: string
  description: string
  serviceName: string
  totalSessions: number
}

const normalizeBonoTemplateSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const stripBonoPackSessionSuffix = (value: string) =>
  value
    .replace(/\b\d+\s*sesiones?\b/g, ' ')
    .replace(/[·|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const scoreStoredBonoTemplateNameMatch = (
  packName: string,
  template: StoredBonoTemplateRow
) => {
  const normalizedPackName = normalizeBonoTemplateSearchText(packName)
  if (!normalizedPackName) return 0

  const compactPackName = stripBonoPackSessionSuffix(normalizedPackName)
  const normalizedDescription = normalizeBonoTemplateSearchText(template.description)
  const normalizedServiceName = normalizeBonoTemplateSearchText(template.serviceName)
  const exactCandidates = new Set(
    [
      normalizedDescription,
      normalizedServiceName,
      normalizeBonoTemplateSearchText(`${template.description} ${template.serviceName}`),
      normalizeBonoTemplateSearchText(`${template.description} - ${template.serviceName}`),
      normalizeBonoTemplateSearchText(`${template.serviceName} ${template.description}`)
    ].filter(Boolean)
  )

  if (exactCandidates.has(normalizedPackName)) return 4
  if (compactPackName && exactCandidates.has(compactPackName)) return 3

  const includesDescription = Boolean(
    normalizedDescription && normalizedPackName.includes(normalizedDescription)
  )
  const includesServiceName = Boolean(
    normalizedServiceName && normalizedPackName.includes(normalizedServiceName)
  )

  if (includesDescription && includesServiceName) return 3
  if (includesDescription || includesServiceName) return 2

  if (compactPackName) {
    const compactIncludesDescription = Boolean(
      normalizedDescription && compactPackName.includes(normalizedDescription)
    )
    const compactIncludesServiceName = Boolean(
      normalizedServiceName && compactPackName.includes(normalizedServiceName)
    )

    if (compactIncludesDescription && compactIncludesServiceName) return 2
    if (compactIncludesDescription || compactIncludesServiceName) return 1
  }

  return 0
}

const readStoredBonoTemplatesForBackfill = async ({
  prisma
}: SqliteCompatibilityRuntime): Promise<StoredBonoTemplateRow[]> => {
  const setting = await prisma.setting.findUnique({
    where: { key: 'bono_templates_catalog' }
  })

  if (!setting) {
    return []
  }

  try {
    const parsed = JSON.parse(setting.value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => {
        const row = entry as Partial<StoredBonoTemplateRow>

        return {
          id: String(row.id || '').trim(),
          serviceId: String(row.serviceId || '').trim(),
          description: String(row.description || '').trim(),
          serviceName: String((entry as { serviceName?: string })?.serviceName || '').trim(),
          totalSessions: Number((entry as { totalSessions?: number })?.totalSessions || 0)
        }
      })
      .filter(
        (template) =>
          Boolean(template.id) &&
          Boolean(template.serviceId) &&
          Boolean(template.description) &&
          template.totalSessions > 0
      )
  } catch {
    return []
  }
}

const resolveStoredBonoTemplateIdForPack = (
  pack: {
    serviceId: string | null
    name: string
    totalSessions: number
  },
  templates: StoredBonoTemplateRow[]
) => {
  const normalizedServiceId = String(pack.serviceId || '').trim()
  if (!normalizedServiceId) {
    return null
  }

  let candidates = templates.filter((template) => template.serviceId === normalizedServiceId)
  if (candidates.length === 0) {
    return null
  }

  const sameSessions = candidates.filter(
    (template) => Number(template.totalSessions || 0) === Number(pack.totalSessions || 0)
  )
  if (sameSessions.length === 1) {
    return sameSessions[0].id
  }
  if (sameSessions.length > 1) {
    candidates = sameSessions
  }

  if (candidates.length === 1) {
    return candidates[0].id
  }

  const scoredCandidates = candidates
    .map((template) => ({
      id: template.id,
      score: scoreStoredBonoTemplateNameMatch(pack.name, template)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  if (scoredCandidates.length === 0) {
    return null
  }

  if (
    scoredCandidates.length === 1 ||
    scoredCandidates[0].score > (scoredCandidates[1]?.score ?? 0)
  ) {
    return scoredCandidates[0].id
  }

  return null
}

export const ensureLegacyAccountBalanceImportColumns = async ({
  prisma,
  tableExists,
  getTableColumns,
  indexExists
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('account_balance_movements'))) {
    return
  }

  const accountBalanceColumns = await getTableColumns('account_balance_movements')
  const hasLegacyRef = accountBalanceColumns.some((column) => column.name === 'legacyRef')
  const hasImportSource = accountBalanceColumns.some((column) => column.name === 'importSource')

  if (!hasLegacyRef) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "account_balance_movements" ADD COLUMN "legacyRef" TEXT'
    )
  }

  if (!hasImportSource) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "account_balance_movements" ADD COLUMN "importSource" TEXT'
    )
  }

  if (!(await indexExists('account_balance_movements_clientId_legacyRef_importSource_key'))) {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "account_balance_movements_clientId_legacyRef_importSource_key" ON "account_balance_movements"("clientId", "legacyRef", "importSource")'
    )
  }
}

export const ensureLegacyBonoImportColumns = async ({
  prisma,
  tableExists,
  getTableColumns,
  indexExists
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('bono_packs'))) {
    return
  }

  const bonoPackColumns = await getTableColumns('bono_packs')
  const hasBonoTemplateId = bonoPackColumns.some((column) => column.name === 'bonoTemplateId')
  const hasLegacyRef = bonoPackColumns.some((column) => column.name === 'legacyRef')
  const hasImportSource = bonoPackColumns.some((column) => column.name === 'importSource')

  if (!hasBonoTemplateId) {
    await prisma.$executeRawUnsafe('ALTER TABLE "bono_packs" ADD COLUMN "bonoTemplateId" TEXT')
  }

  if (!hasLegacyRef) {
    await prisma.$executeRawUnsafe('ALTER TABLE "bono_packs" ADD COLUMN "legacyRef" TEXT')
  }

  if (!hasImportSource) {
    await prisma.$executeRawUnsafe('ALTER TABLE "bono_packs" ADD COLUMN "importSource" TEXT')
  }

  if (!(await indexExists('bono_packs_clientId_legacyRef_importSource_key'))) {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "bono_packs_clientId_legacyRef_importSource_key" ON "bono_packs"("clientId", "legacyRef", "importSource")'
    )
  }
}

export const backfillBonoPackTemplateIds = async (runtime: SqliteCompatibilityRuntime) => {
  const { prisma, tableExists } = runtime

  if (!(await tableExists('bono_packs'))) {
    return
  }

  const templates = await readStoredBonoTemplatesForBackfill(runtime)
  if (templates.length === 0) {
    return
  }

  const packsWithoutTemplateId = await prisma.bonoPack.findMany({
    where: { bonoTemplateId: null },
    select: {
      id: true,
      serviceId: true,
      name: true,
      totalSessions: true
    }
  })

  for (const pack of packsWithoutTemplateId) {
    const resolvedTemplateId = resolveStoredBonoTemplateIdForPack(pack, templates)
    if (!resolvedTemplateId) {
      continue
    }

    await prisma.bonoPack.update({
      where: { id: pack.id },
      data: { bonoTemplateId: resolvedTemplateId }
    })
  }
}

type ImportedBonoPackConsumptionDateRow = {
  bonoPackId: string
  purchaseDate: string | null
  consumedCount: number
  minConsumedAt: string | null
  maxConsumedAt: string | null
}

export const clearSyntheticImportedBonoConsumptionDates = async ({
  prisma,
  tableExists
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('bono_packs')) || !(await tableExists('bono_sessions'))) {
    return
  }

  const importedConsumedPacks = await prisma.$queryRawUnsafe<Array<ImportedBonoPackConsumptionDateRow>>(
    `
      SELECT
        bp.id AS bonoPackId,
        bp.purchaseDate AS purchaseDate,
        COUNT(bs.id) AS consumedCount,
        MIN(bs.consumedAt) AS minConsumedAt,
        MAX(bs.consumedAt) AS maxConsumedAt
      FROM "bono_packs" bp
      JOIN "bono_sessions" bs ON bs."bonoPackId" = bp.id
      WHERE bp."importSource" = 'LEGACY_CLIENT_BONO'
        AND bs.status = 'CONSUMED'
        AND bs."appointmentId" IS NULL
        AND bs."consumedAt" IS NOT NULL
      GROUP BY bp.id, bp."purchaseDate"
    `
  )

  for (const pack of importedConsumedPacks) {
    const consumedCount = Number(pack.consumedCount || 0)
    const minConsumedAt = String(pack.minConsumedAt || '')
    const maxConsumedAt = String(pack.maxConsumedAt || '')
    const purchaseDate = String(pack.purchaseDate || '')

    const hasSingleDuplicatedTimestamp = Boolean(minConsumedAt) && minConsumedAt === maxConsumedAt
    const looksLikePurchaseDateFallback = Boolean(purchaseDate) && minConsumedAt === purchaseDate

    if (!hasSingleDuplicatedTimestamp) {
      continue
    }

    if (consumedCount <= 1 && !looksLikePurchaseDateFallback) {
      continue
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "bono_sessions" SET "consumedAt" = NULL
       WHERE "bonoPackId" = '${String(pack.bonoPackId).replace(/'/g, "''")}'
         AND status = 'CONSUMED'
         AND "appointmentId" IS NULL
         AND "consumedAt" = '${minConsumedAt.replace(/'/g, "''")}'`
    )
  }
}
