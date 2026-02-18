import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const rootDir = process.cwd()
const baseEnvPath = path.join(rootDir, '.env')
const devEnvPath = path.join(rootDir, '.env.development')

if (fs.existsSync(baseEnvPath)) {
  dotenv.config({ path: baseEnvPath })
}

if (process.env.NODE_ENV !== 'production' && fs.existsSync(devEnvPath)) {
  dotenv.config({ path: devEnvPath, override: true })
}
