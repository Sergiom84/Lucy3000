import { z } from 'zod'
import {
  booleanQuerySchema,
  optionalNullableTextSchema,
  uuidParamSchema
} from './common.schemas'

const stockMovementTypeSchema = z.enum(['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'DAMAGED'])

const nonNegativeIntSchema = z.coerce
  .number()
  .int('Value must be an integer')
  .min(0, 'Value cannot be negative')

const positiveMoneySchema = z.coerce.number().finite().positive('Value must be greater than 0')
const nonNegativeMoneySchema = z.coerce.number().finite().min(0, 'Value cannot be negative')

const productNameSchema = z.string().trim().min(1, 'Name is required').max(150, 'Name is too long')
const skuSchema = z.string().trim().min(1, 'SKU is required').max(80, 'SKU is too long')
const categorySchema = z.string().trim().min(1, 'Category is required').max(80, 'Category is too long')
const unitSchema = z.string().trim().min(1, 'Unit is required').max(20, 'Unit is too long')

export const productIdParamSchema = uuidParamSchema

export const productsQuerySchema = z.object({
  search: z.string().trim().min(1, 'Search cannot be empty').optional(),
  isActive: booleanQuerySchema.optional(),
  category: z.string().trim().min(1, 'Category cannot be empty').optional()
})

export const createProductBodySchema = z
  .object({
    name: productNameSchema,
    description: optionalNullableTextSchema(2000),
    sku: skuSchema,
    barcode: optionalNullableTextSchema(80),
    category: categorySchema,
    brand: optionalNullableTextSchema(80),
    price: positiveMoneySchema,
    cost: nonNegativeMoneySchema,
    stock: nonNegativeIntSchema,
    minStock: nonNegativeIntSchema,
    maxStock: nonNegativeIntSchema.nullable().optional(),
    unit: unitSchema,
    isActive: z.boolean().optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.maxStock !== null && data.maxStock !== undefined && data.maxStock < data.minStock) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxStock'],
        message: 'maxStock cannot be lower than minStock'
      })
    }
  })

export const updateProductBodySchema = z
  .object({
    name: productNameSchema.optional(),
    description: optionalNullableTextSchema(2000),
    sku: skuSchema.optional(),
    barcode: optionalNullableTextSchema(80),
    category: categorySchema.optional(),
    brand: optionalNullableTextSchema(80),
    price: positiveMoneySchema.optional(),
    cost: nonNegativeMoneySchema.optional(),
    stock: nonNegativeIntSchema.optional(),
    minStock: nonNegativeIntSchema.optional(),
    maxStock: nonNegativeIntSchema.nullable().optional(),
    unit: unitSchema.optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })
  .superRefine((data, ctx) => {
    if (data.maxStock !== null && data.maxStock !== undefined && data.minStock !== undefined && data.maxStock < data.minStock) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxStock'],
        message: 'maxStock cannot be lower than minStock'
      })
    }
  })

export const addStockMovementBodySchema = z
  .object({
    type: stockMovementTypeSchema,
    quantity: z
      .coerce
      .number()
      .int('Quantity must be an integer')
      .refine((value) => value !== 0, 'Quantity must be non-zero'),
    reason: optionalNullableTextSchema(500),
    reference: optionalNullableTextSchema(120)
  })
  .strict()
  .refine((payload) => payload.type === 'ADJUSTMENT' || payload.quantity > 0, {
    path: ['quantity'],
    message: 'Quantity must be positive for this movement type'
  })

