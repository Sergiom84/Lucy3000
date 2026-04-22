import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { getAppointmentDisplayName, getAppointmentDisplayPhone } from '../utils/customer-display'
import { getAppointmentServiceLabel } from '../utils/appointment-services'
import { whatsappService } from './whatsapp.service'

const WHATSAPP_SENT_NOTIFICATION_TYPE = 'WHATSAPP_REMINDER_SENT'
const APPOINTMENT_REMINDER_STATUSES: string[] = ['SCHEDULED', 'CONFIRMED']
const DEFAULT_INTERVAL_MINUTES = 30
const DEFAULT_REMINDER_DAYS_BEFORE = 4

const appointmentReminderInclude = {
  client: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      mobilePhone: true,
      landlinePhone: true
    }
  },
  service: {
    select: {
      id: true,
      name: true
    }
  },
  appointmentServices: {
    include: {
      service: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      sortOrder: 'asc' as const
    }
  }
} satisfies Prisma.AppointmentInclude

const reminderTitle = (appointmentId: string) => `WHATSAPP_APPOINTMENT_${appointmentId}`

const parseIntervalMinutes = (): number => {
  const raw = Number.parseInt(String(process.env.WHATSAPP_REMINDER_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES), 10)
  if (!Number.isFinite(raw) || raw < 5) return DEFAULT_INTERVAL_MINUTES
  return Math.min(360, raw)
}

const parseReminderDaysBefore = (): number => {
  const raw = Number.parseInt(
    String(process.env.WHATSAPP_REMINDER_DAYS_BEFORE ?? DEFAULT_REMINDER_DAYS_BEFORE),
    10
  )

  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_REMINDER_DAYS_BEFORE
  }

  return Math.min(30, raw)
}

export const getReminderUtcRange = (now: Date = new Date(), daysBefore = DEFAULT_REMINDER_DAYS_BEFORE) => {
  const safeDaysBefore = Math.max(1, Math.floor(daysBefore))
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + safeDaysBefore, 0, 0, 0, 0)
  )
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + safeDaysBefore + 1, 0, 0, 0, 0)
  )
  return { start, end }
}

export const getTomorrowUtcRange = (now: Date = new Date()) => {
  return getReminderUtcRange(now, 1)
}

class AppointmentReminderService {
  private timer: NodeJS.Timeout | null = null
  private isRunning = false
  private hasWarnedMissingConfiguration = false

  start() {
    if (!whatsappService.isEnabled()) {
      console.log('[WhatsApp reminders] Disabled (WHATSAPP_REMINDERS_ENABLED=false)')
      return
    }

    if (this.timer) return

    const intervalMinutes = parseIntervalMinutes()
    const reminderDaysBefore = parseReminderDaysBefore()
    console.log(
      `[WhatsApp reminders] Started. Interval: ${intervalMinutes} minutes. Lead time: ${reminderDaysBefore} day(s)`
    )

    void this.runCycle()

    this.timer = setInterval(() => {
      void this.runCycle()
    }, intervalMinutes * 60 * 1000)
  }

  stop() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private async runCycle() {
    if (this.isRunning) return
    this.isRunning = true

    try {
      await this.sendScheduledReminders()
    } catch (error) {
      console.error('[WhatsApp reminders] Cycle failed:', error)
    } finally {
      this.isRunning = false
    }
  }

  private async sendScheduledReminders() {
    if (!whatsappService.isConfigured()) {
      if (!this.hasWarnedMissingConfiguration) {
        console.warn(
          '[WhatsApp reminders] Missing configuration. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TEMPLATE_NAME.'
        )
        this.hasWarnedMissingConfiguration = true
      }
      return
    }

    this.hasWarnedMissingConfiguration = false

    const reminderDaysBefore = parseReminderDaysBefore()
    const { start, end } = getReminderUtcRange(new Date(), reminderDaysBefore)
    const appointments = await prisma.appointment.findMany({
      where: {
        reminder: true,
        status: { in: APPOINTMENT_REMINDER_STATUSES },
        date: {
          gte: start,
          lt: end
        }
      },
      include: appointmentReminderInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    })

    if (!appointments.length) return

    const existing = await prisma.notification.findMany({
      where: {
        type: WHATSAPP_SENT_NOTIFICATION_TYPE,
        title: {
          in: appointments.map((appointment) => reminderTitle(appointment.id))
        }
      },
      select: { title: true }
    })

    const sentTitles = new Set(existing.map((item) => item.title))

    for (const appointment of appointments) {
      const title = reminderTitle(appointment.id)
      if (sentTitles.has(title)) continue

      const phoneCandidate = getAppointmentDisplayPhone(appointment)
      const clientName = getAppointmentDisplayName(appointment)
      const serviceLabel = getAppointmentServiceLabel(appointment) || appointment.service.name
      const result = await whatsappService.sendAppointmentReminder({
        appointmentId: appointment.id,
        clientName,
        serviceName: serviceLabel,
        appointmentDate: appointment.date,
        appointmentStartTime: appointment.startTime,
        phone: phoneCandidate
      })

      if (!result.success) {
        console.warn(
          `[WhatsApp reminders] Could not send reminder for appointment ${appointment.id}: ${result.error || 'Unknown error'}`
        )
        continue
      }

      await prisma.notification.create({
        data: {
          type: WHATSAPP_SENT_NOTIFICATION_TYPE,
          title,
          message: `Recordatorio WhatsApp enviado a ${clientName} para ${serviceLabel} (${appointment.startTime}).`,
          priority: 'LOW',
          isRead: true
        }
      })
    }
  }
}

export const appointmentReminderService = new AppointmentReminderService()
