-- Script para crear usuario administrador inicial
-- Ejecutar en Supabase SQL Editor o Prisma Studio

-- Nota: La contraseña 'admin123' está hasheada con bcrypt
-- Para generar tu propia contraseña hasheada, usa: https://bcrypt-generator.com/

INSERT INTO users (
  id,
  email,
  password,
  name,
  role,
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES (
  COALESCE((SELECT id FROM users WHERE email = 'admin@lucy3000.com'), gen_random_uuid()::text),
  'admin@lucy3000.com',
  '$2a$10$GgyHgpemOouirZKs6I8qJOAwQTyDntonwZylGH/ZLqH1damirm9D6', -- admin123
  'Administrador',
  'ADMIN',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET
  password = EXCLUDED.password,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  "isActive" = true,
  "updatedAt" = NOW();

-- Verificar que se creó correctamente
SELECT id, email, name, role, "isActive" FROM users WHERE email = 'admin@lucy3000.com';

