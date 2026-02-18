import { Request, Response } from 'express'
import { vi } from 'vitest'

export const createMockResponse = () => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

export const createMockRequest = <T extends Request>(partial: Partial<T> = {}) => {
  return partial as T
}

