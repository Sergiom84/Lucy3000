import { describe, expect, it, vi } from 'vitest'
import { isPostgresDatabaseUrl, withPostgresSequenceLock } from '../../../src/backend/utils/sequence-lock'

describe('sequence-lock', () => {
  it('detects postgres URLs only for postgres connections', () => {
    expect(isPostgresDatabaseUrl('postgresql://user:pass@localhost:5432/lucy')).toBe(true)
    expect(isPostgresDatabaseUrl('postgres://user:pass@localhost:5432/lucy')).toBe(true)
    expect(isPostgresDatabaseUrl('file:./prisma/lucy3000.db')).toBe(false)
    expect(isPostgresDatabaseUrl(undefined)).toBe(false)
  })

  it('skips pg_advisory_xact_lock when the database is sqlite', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined)
    }
    const task = vi.fn().mockResolvedValue('ok')

    const result = await withPostgresSequenceLock(tx, 3001001, task, 'file:./prisma/lucy3000.db')

    expect(result).toBe('ok')
    expect(task).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it('uses pg_advisory_xact_lock when the database is postgres', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined)
    }
    const task = vi.fn().mockResolvedValue('ok')

    const result = await withPostgresSequenceLock(tx, 3001001, task, 'postgresql://user:pass@localhost:5432/lucy')

    expect(result).toBe('ok')
    expect(task).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
  })
})
