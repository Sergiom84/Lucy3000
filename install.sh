#!/bin/bash

echo ""
echo "========================================"
echo "  LUCY3000 - INSTALACION AUTOMATICA"
echo "========================================"
echo ""

# Verificar Node.js
echo "[1/5] Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no está instalado"
    echo "Por favor instala Node.js desde https://nodejs.org"
    exit 1
fi
echo "OK - Node.js instalado"
echo ""

# Instalar dependencias
echo "[2/5] Instalando dependencias..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Falló la instalación de dependencias"
    exit 1
fi
echo "OK - Dependencias instaladas"
echo ""

# Generar Prisma Client
echo "[3/5] Generando Prisma Client..."
npm run prisma:generate
if [ $? -ne 0 ]; then
    echo "ERROR: Falló la generación de Prisma Client"
    exit 1
fi
echo "OK - Prisma Client generado"
echo ""

# Ejecutar migraciones
echo "[4/5] Ejecutando migraciones de base de datos..."
npm run prisma:migrate
if [ $? -ne 0 ]; then
    echo "ERROR: Falló la ejecución de migraciones"
    echo "Verifica tu conexión a Supabase"
    exit 1
fi
echo "OK - Migraciones ejecutadas"
echo ""

# Abrir Prisma Studio
echo "[5/5] Abriendo Prisma Studio para crear usuario admin..."
echo ""
echo "IMPORTANTE:"
echo "1. Se abrirá Prisma Studio en tu navegador"
echo "2. Ve a la tabla 'users'"
echo "3. Click en 'Add record'"
echo "4. Completa los campos:"
echo "   - email: admin@lucy3000.com"
echo "   - password: \$2a\$10\$YQiQVkMsSppeYkUlCuvIseZkNyGfqsgAOBSxiitW4gluuK2zp.W6e"
echo "   - name: Administrador"
echo "   - role: ADMIN"
echo "   - isActive: true"
echo "5. Guarda y cierra Prisma Studio"
echo ""
echo "Presiona Enter para abrir Prisma Studio..."
read
npm run prisma:studio &
echo ""

echo "========================================"
echo "  INSTALACION COMPLETADA"
echo "========================================"
echo ""
echo "Para iniciar la aplicación, ejecuta:"
echo "  npm run dev"
echo ""
echo "Credenciales de login:"
echo "  Email: admin@lucy3000.com"
echo "  Password: admin123"
echo ""

