import { Request, Response } from 'express'
import { prisma } from '../db'
import { logError } from '../utils/logger'

const agendaDayNoteSelect = {
  id: true,
  dayKey: true,
  text: true,
  isCompleted: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true
}

export const getAgendaDayNotes = async (req: Request, res: Response) => {
  try {
    const dayKey = String(req.query.dayKey || '').trim()

    const notes = await prisma.agendaDayNote.findMany({
      where: { dayKey },
      select: agendaDayNoteSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })

    res.json(notes)
  } catch (error) {
    logError('Get agenda day notes error', error, { query: req.query })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAgendaDayNote = async (req: Request, res: Response) => {
  try {
    const note = await prisma.agendaDayNote.create({
      data: {
        dayKey: String(req.body.dayKey).trim(),
        text: String(req.body.text).trim()
      },
      select: agendaDayNoteSelect
    })

    res.status(201).json(note)
  } catch (error) {
    logError('Create agenda day note error', error, { body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAgendaDayNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const existingNote = await prisma.agendaDayNote.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!existingNote) {
      return res.status(404).json({ error: 'Agenda day note not found' })
    }

    const note = await prisma.agendaDayNote.update({
      where: { id },
      data: {
        text: String(req.body.text).trim()
      },
      select: agendaDayNoteSelect
    })

    res.json(note)
  } catch (error) {
    logError('Update agenda day note error', error, { params: req.params, body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const toggleAgendaDayNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const existingNote = await prisma.agendaDayNote.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!existingNote) {
      return res.status(404).json({ error: 'Agenda day note not found' })
    }

    const isCompleted = Boolean(req.body.isCompleted)
    const note = await prisma.agendaDayNote.update({
      where: { id },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null
      },
      select: agendaDayNoteSelect
    })

    res.json(note)
  } catch (error) {
    logError('Toggle agenda day note error', error, { params: req.params, body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteAgendaDayNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const existingNote = await prisma.agendaDayNote.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!existingNote) {
      return res.status(404).json({ error: 'Agenda day note not found' })
    }

    await prisma.agendaDayNote.delete({
      where: { id }
    })

    res.json({ message: 'Agenda day note deleted successfully' })
  } catch (error) {
    logError('Delete agenda day note error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}
