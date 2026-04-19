import { Request, Response } from 'express'
import { prisma } from '../db'
import { logError } from '../utils/logger'

const dashboardReminderSelect = {
  id: true,
  text: true,
  isCompleted: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true
}

export const getDashboardReminders = async (_req: Request, res: Response) => {
  try {
    const reminders = await prisma.dashboardReminder.findMany({
      where: { isCompleted: false },
      select: dashboardReminderSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })

    res.json(reminders)
  } catch (error) {
    logError('Get dashboard reminders error', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createDashboardReminder = async (req: Request, res: Response) => {
  try {
    const reminder = await prisma.dashboardReminder.create({
      data: {
        text: String(req.body.text).trim()
      },
      select: dashboardReminderSelect
    })

    res.status(201).json(reminder)
  } catch (error) {
    logError('Create dashboard reminder error', error, { body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const toggleDashboardReminder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const existingReminder = await prisma.dashboardReminder.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!existingReminder) {
      return res.status(404).json({ error: 'Dashboard reminder not found' })
    }

    const isCompleted = Boolean(req.body.isCompleted)
    const reminder = await prisma.dashboardReminder.update({
      where: { id },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null
      },
      select: dashboardReminderSelect
    })

    res.json(reminder)
  } catch (error) {
    logError('Toggle dashboard reminder error', error, { params: req.params, body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}
