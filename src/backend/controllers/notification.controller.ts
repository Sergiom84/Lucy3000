import { Request, Response } from 'express'
import { prisma } from '../server'

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const { isRead, type } = req.query

    const where: any = {}

    if (isRead !== undefined) {
      where.isRead = isRead === 'true'
    }

    if (type) {
      where.type = type
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

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

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

export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true }
    })

    res.json({ message: 'All notifications marked as read' })
  } catch (error) {
    console.error('Mark all as read error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.notification.delete({
      where: { id }
    })

    res.json({ message: 'Notification deleted successfully' })
  } catch (error) {
    console.error('Delete notification error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

