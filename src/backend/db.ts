import './config/loadEnv'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not configured. Set it in .env or .env.development, or start with npm run dev to auto-fetch credentials from Supabase link.'
  )
}

export const prisma = new PrismaClient()
