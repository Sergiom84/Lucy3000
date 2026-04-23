import fs from 'fs'
import path from 'path'
import { promises as fsPromises } from 'fs'

export const ensureDir = async (targetPath: string) => {
  await fsPromises.mkdir(targetPath, { recursive: true })
}

export const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

export const writeJsonFile = async (filePath: string, data: unknown) => {
  await ensureDir(path.dirname(filePath))
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export const findExistingPath = (candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export const resolveFileDatabasePath = (databaseUrl: string | undefined, schemaDir: string) => {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) {
    return null
  }

  const filePath = databaseUrl.slice('file:'.length)
  if (!filePath) {
    return null
  }

  if (path.isAbsolute(filePath)) {
    return filePath
  }

  return path.resolve(schemaDir, filePath)
}
