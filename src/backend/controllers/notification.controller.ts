import { Response } from 'express'
import { prisma } from '../db'
import type { AuthRequest } from '../middleware/auth.middleware'
import { getNotificationVisibilityWhere } from '../utils/notifications'

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const { isRead, type } = req.query

    const where: any = {
      ...getNotificationVisibilityWhere(req.user?.role)
    }

    if (isRead !== undefined) {
      where.isRead = typeof isRead === 'boolean' ? isRead : isRead === 'true'
    }

    if (type) {
      where.type = String(type)
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: [
        { isRead: 'asc' },
        { createdAt: 'desc' }
      ]
    })

    res.json(notifications)
  } catch (error) {
    console.error('Get notifications error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const existingNotification = await prisma.notification.findFirst({
      where: {
        id,
        ...getNotificationVisibilityWhere(req.user?.role)
      }
    })

    if (!existingNotification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    })

    res.json(notification)
  } catch (error) {
    console.error('Mark as read error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: {
        isRead: false,
        ...getNotificationVisibilityWhere(req.user?.role)
      },
      data: { isRead: true }
    })

    res.json({ message: 'All notifications marked as read' })
  } catch (error) {
    console.error('Mark all as read error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const existingNotification = await prisma.notification.findFirst({
      where: {
        id,
        ...getNotificationVisibilityWhere(req.user?.role)
      }
    })

    if (!existingNotification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    await prisma.notification.delete({
      where: { id }
    })

    res.json({ message: 'Notification deleted successfully' })
  } catch (error) {
    console.error('Delete notification error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

