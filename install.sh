#!/bin/bash

echo ""
echo "========================================"
echo "  LUCY3000 - INSTALACION DESDE FUENTE"
echo "========================================"
echo ""

echo "[1/4] Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no está instalado"
    echo "Por favor instala Node.js desde https://nodejs.org"
    exit 1
fi
echo "OK - Node.js instalado"
echo ""

echo "[2/4] Instalando dependencias..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Falló la instalación de dependencias"
    exit 1
fi
echo "OK - Dependencias instaladas"
echo ""

echo "[3/4] Generando Prisma Client..."
npm run prisma:generate
if [ $? -ne 0 ]; then
    echo "ERROR: Falló la generación de Prisma Client"
    exit 1
fi
echo "OK - Prisma Client generado"
echo ""

echo "[4/4] Ejecutando migraciones..."
npm run prisma:migrate
if [ $? -ne 0 ]; then
    echo "ERROR: Falló la ejecución de migraciones"
    exit 1
fi
echo "OK - Migraciones ejecutadas"
echo ""

echo "========================================"
echo "  INSTALACION BASE COMPLETADA"
echo "========================================"
echo ""
echo "Siguiente paso:"
echo "  npm run dev"
echo ""
echo "Si la base está vacía, el primer administrador se crea"
echo "desde la pantalla de login mediante el flujo bootstrap."
echo ""
