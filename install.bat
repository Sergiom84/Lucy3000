@echo off
echo.
echo ========================================
echo   LUCY3000 - INSTALACION DESDE FUENTE
echo ========================================
echo.

echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado
    echo Por favor instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)
echo OK - Node.js instalado
echo.

echo [2/4] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de dependencias
    pause
    exit /b 1
)
echo OK - Dependencias instaladas
echo.

echo [3/4] Generando Prisma Client...
call npm run prisma:generate
if errorlevel 1 (
    echo ERROR: Fallo la generacion de Prisma Client
    pause
    exit /b 1
)
echo OK - Prisma Client generado
echo.

echo [4/4] Ejecutando migraciones...
call npm run prisma:migrate
if errorlevel 1 (
    echo ERROR: Fallo la ejecucion de migraciones
    pause
    exit /b 1
)
echo OK - Migraciones ejecutadas
echo.

echo ========================================
echo   INSTALACION BASE COMPLETADA
echo ========================================
echo.
echo Siguiente paso:
echo   npm run dev
echo.
echo Si la base esta vacia, el primer administrador se crea
echo desde la pantalla de login mediante el flujo bootstrap.
echo.
pause
