import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

// Routes
import authRoutes from './routes/auth.routes'
import clientRoutes from './routes/client.routes'
import appointmentRoutes from './routes/appointment.routes'
import serviceRoutes from './routes/service.routes'
import productRoutes from './routes/product.routes'
import saleRoutes from './routes/sale.routes'
import cashRoutes from './routes/cash.routes'
import notificationRoutes from './routes/notification.routes'
import reportRoutes from './routes/report.routes'
import dashboardRoutes from './routes/dashboard.routes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Prisma Client
export const prisma = new PrismaClient()

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Welcome page
app.get('/', (_req, res) => {
  res.json({
    name: 'Lucy3000 API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      clients: '/api/clients',
      appointments: '/api/appointments',
      services: '/api/services',
      products: '/api/products',
      sales: '/api/sales',
      cash: '/api/cash',
      notifications: '/api/notifications',
      reports: '/api/reports',
      dashboard: '/api/dashboard'
    }
  })
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/clients', clientRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/api/services', serviceRoutes)
app.use('/api/products', productRoutes)
app.use('/api/sales', saleRoutes)
app.use('/api/cash', cashRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/dashboard', dashboardRoutes)

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

