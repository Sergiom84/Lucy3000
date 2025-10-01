#!/bin/bash
set -e

echo "🚀 Starting deployment process..."

# Verificar que DATABASE_URL existe
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "✅ DATABASE_URL is configured"

# Ejecutar migraciones de Prisma
echo "📦 Running Prisma migrations..."
npx prisma migrate deploy

# Iniciar el servidor
echo "🎯 Starting server..."
node dist/backend/server.js

