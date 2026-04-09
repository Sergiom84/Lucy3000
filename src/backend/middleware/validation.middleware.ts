import { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodIssue, ZodTypeAny } from 'zod'
import { logWarn, sanitizeForLog } from '../utils/logger'

type ValidationSchemas = {
  body?: ZodTypeAny
  query?: ZodTypeAny
  params?: ZodTypeAny
}

const formatIssuePath = (path: (string | number)[]) => {
  if (path.length === 0) return 'root'
  return path.join('.')
}

const formatValidationIssues = (issues: ZodIssue[]) => {
  return issues.map((issue) => ({
    field: formatIssuePath(issue.path),
    message: issue.message
  }))
}

export const validateRequest = (schemas: ValidationSchemas): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const target of ['params', 'query', 'body'] as const) {
      const schema = schemas[target]
      if (!schema) continue

      const result = schema.safeParse((req as any)[target])
      if (!result.success) {
        const details = formatValidationIssues(result.error.issues)
        logWarn('Request validation failed', {
          method: req.method,
          path: req.originalUrl,
          target,
          details,
          params: sanitizeForLog(req.params),
          query: sanitizeForLog(req.query),
          body: sanitizeForLog(req.body)
        })

        return res.status(400).json({
          error: 'Validation error',
          details
        })
      }

      ;(req as any)[target] = result.data
    }

    next()
  }
}
