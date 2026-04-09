type SequenceLockTx = {
  $executeRaw: (query: TemplateStringsArray, ...values: readonly unknown[]) => Promise<unknown>
}

const POSTGRES_URL_PATTERN = /^postgres(?:ql)?:\/\//i

export const isPostgresDatabaseUrl = (databaseUrl?: string | null) => {
  if (!databaseUrl) {
    return false
  }

  return POSTGRES_URL_PATTERN.test(databaseUrl.trim())
}

export const withPostgresSequenceLock = async <T>(
  tx: SequenceLockTx,
  lockId: number,
  task: () => Promise<T>,
  databaseUrl = process.env.DATABASE_URL
): Promise<T> => {
  if (isPostgresDatabaseUrl(databaseUrl)) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`
  }

  return task()
}
