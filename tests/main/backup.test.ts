import os from 'os'
import path from 'path'
import { promises as fsPromises } from 'fs'
import { describe, expect, it } from 'vitest'
import {
  MANUAL_BACKUP_PREFIX,
  createBackupSnapshot,
  listBackupEntries,
  pruneBackupEntries,
  resolveBackupSource,
  restoreDirectorySnapshot,
  restoreSqliteSnapshot
} from '../../src/main/backup'

const writeFile = async (filePath: string, content: string) => {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
  await fsPromises.writeFile(filePath, content, 'utf8')
}

describe('backup helpers', () => {
  it('creates a full snapshot with sqlite data and client assets', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'lucy-backup-'))
    const dbPath = path.join(tempRoot, 'runtime', 'lucy3000.db')
    const documentsClientsRootDir = path.join(tempRoot, 'documents', 'Lucy3000', 'Documentos', 'Clientes')
    const legacyClientsRootDir = path.join(tempRoot, 'runtime', 'clients')
    const backupsDir = path.join(tempRoot, 'backups')

    await writeFile(dbPath, 'db-content')
    await writeFile(`${dbPath}-wal`, 'wal-content')
    await writeFile(`${dbPath}-shm`, 'shm-content')
    await writeFile(path.join(documentsClientsRootDir, 'clara-1', 'manifest.json'), '{"assets":[]}')
    await writeFile(path.join(legacyClientsRootDir, 'legacy-1', 'notes.txt'), 'legacy-asset')

    const snapshot = await createBackupSnapshot({
      targetDir: backupsDir,
      dbPath,
      documentsClientsRootDir,
      legacyClientsRootDir,
      prefix: MANUAL_BACKUP_PREFIX,
      createdAt: new Date('2026-04-21T10:00:00.000Z')
    })

    expect(snapshot.backupName).toBe('lucy3000-backup-2026-04-21T10-00-00')
    expect(snapshot.includesClientAssets).toBe(true)

    const resolvedBackup = await resolveBackupSource(snapshot.backupPath)
    expect(resolvedBackup.format).toBe('full-directory')
    expect(resolvedBackup.includesClientAssets).toBe(true)

    const restoredDb = await fsPromises.readFile(resolvedBackup.dbSourcePath, 'utf8')
    const restoredDocumentManifest = await fsPromises.readFile(
      path.join(resolvedBackup.documentsClientsSourcePath!, 'clara-1', 'manifest.json'),
      'utf8'
    )
    const restoredLegacyNote = await fsPromises.readFile(
      path.join(resolvedBackup.legacyClientsSourcePath!, 'legacy-1', 'notes.txt'),
      'utf8'
    )

    expect(restoredDb).toBe('db-content')
    expect(restoredDocumentManifest).toBe('{"assets":[]}')
    expect(restoredLegacyNote).toBe('legacy-asset')

    const listedBackups = await listBackupEntries(backupsDir)
    expect(listedBackups).toEqual([
      expect.objectContaining({
        name: snapshot.backupName
      })
    ])
    expect(listedBackups[0].size).toBeGreaterThan(0)
  })

  it('restores sqlite snapshots, replaces directory snapshots and prunes old backups', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'lucy-restore-'))
    const targetDbPath = path.join(tempRoot, 'runtime', 'lucy3000.db')
    const sourceDbPath = path.join(tempRoot, 'legacy-backup.db')
    const sourceDir = path.join(tempRoot, 'snapshot-assets')
    const targetDir = path.join(tempRoot, 'runtime', 'clients')
    const backupsDir = path.join(tempRoot, 'backups')

    await writeFile(sourceDbPath, 'legacy-backup-db')
    await writeFile(targetDbPath, 'current-db')
    await writeFile(`${targetDbPath}-wal`, 'stale-wal')
    await writeFile(`${targetDbPath}-shm`, 'stale-shm')
    await writeFile(path.join(sourceDir, 'client-1', 'photo.jpg'), 'new-photo')
    await writeFile(path.join(targetDir, 'client-1', 'old.txt'), 'old-data')
    await writeFile(path.join(backupsDir, 'lucy3000-backup-2026-04-21T09-00-00.db'), 'oldest')
    await writeFile(path.join(backupsDir, 'lucy3000-backup-2026-04-21T10-00-00.db'), 'middle')
    await fsPromises.mkdir(path.join(backupsDir, 'lucy3000-backup-2026-04-21T11-00-00'), { recursive: true })

    const legacyBackup = await resolveBackupSource(sourceDbPath)
    expect(legacyBackup.format).toBe('legacy-db')

    await restoreSqliteSnapshot(legacyBackup, targetDbPath)
    await restoreDirectorySnapshot(sourceDir, targetDir)
    await pruneBackupEntries(backupsDir, MANUAL_BACKUP_PREFIX, 2)

    expect(await fsPromises.readFile(targetDbPath, 'utf8')).toBe('legacy-backup-db')
    await expect(fsPromises.access(`${targetDbPath}-wal`)).rejects.toThrow()
    await expect(fsPromises.access(`${targetDbPath}-shm`)).rejects.toThrow()
    await expect(fsPromises.access(path.join(targetDir, 'client-1', 'old.txt'))).rejects.toThrow()
    expect(await fsPromises.readFile(path.join(targetDir, 'client-1', 'photo.jpg'), 'utf8')).toBe('new-photo')
    await expect(fsPromises.access(path.join(backupsDir, 'lucy3000-backup-2026-04-21T09-00-00.db'))).rejects.toThrow()
    expect(await fsPromises.readFile(path.join(backupsDir, 'lucy3000-backup-2026-04-21T10-00-00.db'), 'utf8')).toBe('middle')
  })
})
