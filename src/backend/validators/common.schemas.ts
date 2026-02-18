import { z } from 'zod'

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid id format')
})

export const dateQuerySchema = z
  .string()
  .trim()
  .min(1, 'Date is required')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date format')

export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))

const normalizeNullableText = (value: string | null) => {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export const nullableTextSchema = (maxLength: number) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => normalizeNullableText(value))
    .refine((value) => value === null || value.length <= maxLength, {
      message: `Must be at most ${maxLength} characters`
    })

export const optionalNullableTextSchema = (maxLength: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === undefined) return undefined
      return normalizeNullableText(value)
    })
    .refine((value) => value === undefined || value === null || value.length <= maxLength, {
      message: `Must be at most ${maxLength} characters`
    })

