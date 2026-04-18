import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import { FileValidationError, MAX_SPREADSHEET_FILE_SIZE_BYTES } from './middleware/upload.middleware'
import { logError, logInfo, logWarn, sanitizeForLog } from './utils/logger'

// Routes
import authRoutes from './routes/auth.routes'
import userRoutes from './routes/user.routes'
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
import quoteRoutes from './routes/quote.routes'

export const app = express()

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use((req, res, next) => {
  const startedAt = Date.now()

  res.on('finish', () => {
    if (req.path === '/health') {
      return
    }

    const shouldLogSuccess = req.method !== 'GET' && req.method !== 'HEAD'
    const shouldLogRequest = shouldLogSuccess || res.statusCode >= 400

    if (!shouldLogRequest) {
      return
    }

    const context = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      params: sanitizeForLog(req.params),
      query: sanitizeForLog(req.query),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : sanitizeForLog(req.body)
    }

    if (res.statusCode >= 500) {
      logError('API request completed with server error', undefined, context)
      return
    }

    if (res.statusCode >= 400) {
      logWarn('API request completed with client error', context)
      return
    }

    logInfo('API request completed', context)
  })

  next()
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
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
app.use('/api/quotes', quoteRoutes)

// Static frontend build (Vite)
const clientDir = path.resolve(__dirname, '..')
app.use(express.static(clientDir))

// SPA fallback: send index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next()
  res.sendFile(path.join(clientDir, 'index.html'))
})

// Error handling
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: `Uploaded file exceeds the ${Math.round(MAX_SPREADSHEET_FILE_SIZE_BYTES / (1024 * 1024))}MB limit`
    })
  }

  if (err instanceof FileValidationError) {
    return res.status(err.statusCode).json({ error: err.message })
  }

  logError('Unhandled API error', err, {
    method: req.method,
    path: req.originalUrl,
    params: req.params,
    query: req.query,
    body: req.body
  })

  const errorMessage = err instanceof Error ? err.message : 'Unexpected error'
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? errorMessage : undefined
  })
})

