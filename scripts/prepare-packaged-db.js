const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

if (process.env.LUCY3000_PREPARE_SQLITE === '0') {
  console.log('Skipping packaged SQLite database preparation by explicit request.')
  process.exit(0)
}

const projectRoot = path.resolve(__dirname, '..')
const sqliteSchemaPath = path.join(projectRoot, 'prisma', 'schema.sqlite.prisma')
const packagedDbPath = path.join(projectRoot, 'prisma', 'packaged', 'lucy3000.db')
const packagedDbUrl = `file:${packagedDbPath.replace(/\\/g, '/')}`
const prismaCliPath = path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js')

const runPrisma = (args, env = {}) => {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...env
    },
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    if (result.error) {
      throw result.error
    }

    throw new Error(`prisma ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

const main = async () => {
  await fsp.mkdir(path.dirname(packagedDbPath), { recursive: true })
  await fsp.rm(packagedDbPath, { force: true })

  runPrisma(['generate', '--schema', sqliteSchemaPath], {
    SQLITE_DATABASE_URL: packagedDbUrl
  })

  runPrisma(['db', 'push', '--schema', sqliteSchemaPath, '--skip-generate'], {
    SQLITE_DATABASE_URL: packagedDbUrl
  })

  console.log(`Created packaged SQLite database at ${packagedDbPath}`)
}

main().catch((error) => {
  console.error('Failed to prepare packaged SQLite database:', error)
  process.exitCode = 1
})
