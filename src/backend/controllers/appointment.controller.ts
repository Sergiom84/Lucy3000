import { Request, Response } from 'express'
import { prisma } from '../server'

export const getAppointments = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status, clientId } = req.query

    const where: any = {}

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      }
    }

    if (status) {
      where.status = status
    }

    if (clientId) {
      where.clientId = clientId
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        client: true,
        user: {
          select: { name: true, email: true }
        },
        service: true
      },
      orderBy: { date: 'asc' }
    })

    res.json(appointments)
  } catch (error) {
    console.error('Get appointments error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentsByDate = async (req: Request, res: Response) => {
  try {
    const { date } = req.params
    const targetDate = new Date(date)
    
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0))
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999))

    const appointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        client: true,
        user: {
          select: { name: true }
        },
        service: true
      },
      orderBy: { startTime: 'asc' }
    })

    res.json(appointments)
  } catch (error) {
    console.error('Get appointments by date error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        client: true,
        user: true,
        service: true
      }
    })

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    res.json(appointment)
  } catch (error) {
    console.error('Get appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAppointment = async (req: Request, res: Response) => {
  try {
    const data = req.body

    const appointment = await prisma.appointment.create({
      data,
      include: {
        client: true,
        user: true,
        service: true
      }
    })

    // Crear notificación si reminder está activado
    if (data.reminder) {
      await prisma.notification.create({
        data: {
          type: 'APPOINTMENT',
          title: 'Nueva cita programada',
          message: `Cita con ${appointment.client.firstName} ${appointment.client.lastName} el ${new Date(appointment.date).toLocaleDateString()}`,
          priority: 'NORMAL'
        }
      })
    }

    res.status(201).json(appointment)
  } catch (error) {
    console.error('Create appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = req.body

    const appointment = await prisma.appointment.update({
      where: { id },
      data,
      include: {
        client: true,
        user: true,
        service: true
      }
    })

    res.json(appointment)
  } catch (error) {
    console.error('Update appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.appointment.delete({
      where: { id }
    })

    res.json({ message: 'Appointment deleted successfully' })
  } catch (error) {
    console.error('Delete appointment error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

