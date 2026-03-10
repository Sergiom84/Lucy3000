import express from 'express'
import cors from 'cors'
import path from 'path'

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
import rankingRoutes from './routes/ranking.routes'
import bonoRoutes from './routes/bono.routes'
import calendarRoutes from './routes/calendar.routes'

export const app = express()

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
app.use('/api/ranking', rankingRoutes)
app.use('/api/bonos', bonoRoutes)
app.use('/api/calendar', calendarRoutes)

// Static frontend build (Vite)
const clientDir = path.resolve(__dirname, '..')
app.use(express.static(clientDir))

// SPA fallback: send index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next()
  res.sendFile(path.join(clientDir, 'index.html'))
})

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

