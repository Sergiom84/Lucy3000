import type { SqliteCompatibilityRuntime } from './helpers'

export const ensureUsersUsernameColumn = async ({
  prisma,
  tableExists,
  getTableColumns,
  indexExists
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('users'))) {
    return
  }

  const userColumns = await getTableColumns('users')
  const hasUsername = userColumns.some((column) => column.name === 'username')

  if (!hasUsername) {
    await prisma.$executeRawUnsafe('ALTER TABLE "users" ADD COLUMN "username" TEXT')
  }

  if (!(await indexExists('users_username_key'))) {
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "users_username_key" ON "users"("username")')
  }
}
