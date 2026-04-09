import dotenv from 'dotenv'
import http from 'http'
import { app } from './app'
import { ensureSqliteCompatibilityMigrations, prisma } from './db'
import { appointmentReminderService } from './services/appointmentReminder.service'
import { logError, logInfo } from './utils/logger'

dotenv.config()

const PORT = process.env.PORT || 3001

const server = http.createServer(app)

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logError('Backend port is already in use', error, { port: PORT })
    process.exit(1)
  }

  throw error
})

const startServer = async () => {
  await ensureSqliteCompatibilityMigrations()

  server.listen(PORT, () => {
    logInfo('Backend server running', {
      url: `http://localhost:${PORT}`,
      environment: process.env.NODE_ENV || 'development'
    })
    appointmentReminderService.start()
  })
}

void startServer().catch((error) => {
  logError('Failed to start backend server', error)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  logInfo('Received SIGINT, shutting down backend')
  appointmentReminderService.stop()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logInfo('Received SIGTERM, shutting down backend')
  appointmentReminderService.stop()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection in backend', reason)
})

process.on('uncaughtException', (error) => {
  logError('Uncaught exception in backend', error)
  process.exit(1)
})

