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
  gen_random_uuid(),
  'admin@lucy3000.com',
  '$2a$10$YQiQVkMsSppeYkUlCuvIseZkNyGfqsgAOBSxiitW4gluuK2zp.W6e', -- admin123
  'Administrador',
  'ADMIN',
  true,
  NOW(),
  NOW()
);

-- Verificar que se creó correctamente
SELECT id, email, name, role, "isActive" FROM users WHERE email = 'admin@lucy3000.com';

