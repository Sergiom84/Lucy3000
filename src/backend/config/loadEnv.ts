import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const isPackaged = !process.execPath.includes('node_modules') && !process.execPath.includes('node')

const getEnvSearchDirs = (): string[] => {
  const dirs: string[] = []

  if (isPackaged) {
    // In packaged Electron, look next to the .exe first
    dirs.push(path.dirname(process.execPath))
    // Then in the app's resources directory
    dirs.push(path.join(path.dirname(process.execPath), 'resources'))
  }

  // Always check cwd and project root as fallback
  dirs.push(process.cwd())

  return dirs
}

const findEnvFile = (filename: string): string | null => {
  for (const dir of getEnvSearchDirs()) {
    const filePath = path.join(dir, filename)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

const baseEnvPath = findEnvFile('.env')
if (baseEnvPath) {
  dotenv.config({ path: baseEnvPath })
}

if (process.env.NODE_ENV !== 'production') {
  const devEnvPath = findEnvFile('.env.development')
  if (devEnvPath) {
    dotenv.config({ path: devEnvPath, override: true })
  }
}
