import dotenv from 'dotenv'
import http from 'http'
import { app } from './app'
import { prisma } from './db'

dotenv.config()

const PORT = process.env.PORT || 3001

const server = http.createServer(app)

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run scripts/kill-dev-ports.ps1 and try again.`)
    process.exit(1)
  }

  throw error
})

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

