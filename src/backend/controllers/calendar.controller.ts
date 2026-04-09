import { Request, Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { googleCalendarService } from '../services/googleCalendar.service'
import { logError, logWarn } from '../utils/logger'

const CALLBACK_MESSAGE_SOURCE = 'lucy3000-google-calendar-oauth'

const renderCallbackPage = (success: boolean, message: string) => {
  const payload = JSON.stringify({
    source: CALLBACK_MESSAGE_SOURCE,
    success,
    message
  })

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Google Calendar</title>
        <style>
          body {
            font-family: "Segoe UI", sans-serif;
            background: #f8fafc;
            color: #0f172a;
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
          }
          .card {
            width: min(100%, 420px);
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
            text-align: center;
          }
          h1 {
            margin: 0 0 12px;
            font-size: 20px;
          }
          p {
            margin: 0;
            color: #475569;
            line-height: 1.5;
          }
          button {
            margin-top: 16px;
            border: 0;
            border-radius: 999px;
            background: #0f766e;
            color: white;
            padding: 10px 16px;
            font: inherit;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${success ? 'Google Calendar conectado' : 'No se pudo completar la conexión'}</h1>
          <p>${message}</p>
          <button type="button" onclick="window.close()">Cerrar</button>
        </div>
        <script>
          const payload = ${payload};
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, '*');
          }
          window.setTimeout(() => window.close(), 1200);
        </script>
      </body>
    </html>
  `
}

export const getAuthUrl = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest

    if (!authReq.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' })
    }

    const setupStatus = googleCalendarService.getOAuthSetupStatus()
    if (!setupStatus.configured) {
      logWarn('Google Calendar auth requested without required environment variables', {
        missingEnvVars: setupStatus.missingEnvVars,
        userId: authReq.user.id
      })

      return res.status(400).json({
        error: `Google Calendar no está configurado. Faltan variables: ${setupStatus.missingEnvVars.join(', ')}`,
        missingEnvVars: setupStatus.missingEnvVars
      })
    }

    const authUrl = googleCalendarService.buildAuthUrl({
      id: authReq.user.id,
      role: authReq.user.role
    })

    res.json({ authUrl })
  } catch (error: any) {
    logError('Get auth URL error', error)
    const statusCode = error?.message?.includes('no está configurado') ? 400 : 500
    res.status(statusCode).json({ error: error.message || 'Error generando URL de autorización' })
  }
}

export const handleCallback = async (req: Request, res: Response) => {
  try {
    const { code, error, state } = req.query

    if (error) {
      return res.status(400).type('html').send(renderCallbackPage(false, 'Google devolvió un error al autorizar la integración.'))
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).type('html').send(renderCallbackPage(false, 'No se recibió un código de autorización válido.'))
    }

    if (!state || typeof state !== 'string') {
      return res.status(400).type('html').send(renderCallbackPage(false, 'Falta el parámetro de seguridad del flujo OAuth.'))
    }

    const authUser = googleCalendarService.verifyAuthState(state)
    if (authUser.role !== 'ADMIN') {
      return res.status(403).type('html').send(renderCallbackPage(false, 'Solo un usuario administrador puede conectar Google Calendar.'))
    }

    await googleCalendarService.saveTokens(code)

    res.type('html').send(renderCallbackPage(true, 'La cuenta ha quedado conectada y ya puedes volver a Lucy3000.'))
  } catch (error: any) {
    logError('Handle calendar callback error', error)
    const statusCode = error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' ? 400 : 500
    res.status(statusCode).type('html').send(renderCallbackPage(false, error.message || 'Error procesando la autorización de Google.'))
  }
}

export const getConfig = async (_req: Request, res: Response) => {
  try {
    const config = await googleCalendarService.getConfig()
    const setupStatus = googleCalendarService.getOAuthSetupStatus()

    if (!config) {
      return res.json({
        connected: false,
        enabled: false,
        sendClientInvites: true,
        calendarId: 'primary',
        oauthConfigured: setupStatus.configured,
        missingEnvVars: setupStatus.missingEnvVars,
        redirectUri: setupStatus.redirectUri
      })
    }

    res.json({
      connected: true,
      enabled: config.enabled,
      sendClientInvites: config.sendClientInvites,
      calendarId: config.calendarId,
      oauthConfigured: setupStatus.configured,
      missingEnvVars: setupStatus.missingEnvVars,
      redirectUri: setupStatus.redirectUri
    })
  } catch (error: any) {
    logError('Get calendar config error', error)
    res.status(500).json({ error: 'Error obteniendo configuración' })
  }
}

export const updateConfig = async (req: Request, res: Response) => {
  try {
    const { enabled, sendClientInvites, calendarId } = req.body

    const config = await googleCalendarService.updateConfig({
      enabled,
      sendClientInvites,
      calendarId
    })

    res.json({
      message: 'Configuración actualizada',
      config: {
        enabled: config.enabled,
        sendClientInvites: config.sendClientInvites,
        calendarId: config.calendarId
      }
    })
  } catch (error: any) {
    logError('Update calendar config error', error)
    const statusCode = error?.message?.includes('Primero debes autorizar') ? 400 : 500
    res.status(statusCode).json({ error: error.message || 'Error actualizando configuración' })
  }
}

export const disconnect = async (_req: Request, res: Response) => {
  try {
    await googleCalendarService.disconnect()
    res.json({ message: 'Google Calendar desconectado exitosamente' })
  } catch (error: any) {
    logError('Disconnect calendar error', error)
    res.status(500).json({ error: 'Error desconectando Google Calendar' })
  }
}
