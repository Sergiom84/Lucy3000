@echo off
echo.
echo ========================================
echo   LUCY3000 - INSTALACION AUTOMATICA
echo ========================================
echo.

REM Verificar Node.js
echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado
    echo Por favor instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)
echo OK - Node.js instalado
echo.

REM Instalar dependencias
echo [2/5] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de dependencias
    pause
    exit /b 1
)
echo OK - Dependencias instaladas
echo.

REM Generar Prisma Client
echo [3/5] Generando Prisma Client...
call npm run prisma:generate
if errorlevel 1 (
    echo ERROR: Fallo la generacion de Prisma Client
    pause
    exit /b 1
)
echo OK - Prisma Client generado
echo.

REM Ejecutar migraciones
echo [4/5] Ejecutando migraciones de base de datos...
call npm run prisma:migrate
if errorlevel 1 (
    echo ERROR: Fallo la ejecucion de migraciones
    echo Verifica tu conexion a Supabase
    pause
    exit /b 1
)
echo OK - Migraciones ejecutadas
echo.

REM Abrir Prisma Studio
echo [5/5] Abriendo Prisma Studio para crear usuario admin...
echo.
echo IMPORTANTE: 
echo 1. Se abrira Prisma Studio en tu navegador
echo 2. Ve a la tabla 'users'
echo 3. Click en 'Add record'
echo 4. Completa los campos:
echo    - email: admin@lucy3000.com
echo    - password: $2a$10$YQiQVkMsSppeYkUlCuvIseZkNyGfqsgAOBSxiitW4gluuK2zp.W6e
echo    - name: Administrador
echo    - role: ADMIN
echo    - isActive: true
echo 5. Guarda y cierra Prisma Studio
echo.
echo Presiona cualquier tecla para abrir Prisma Studio...
pause >nul
start npm run prisma:studio
echo.

echo ========================================
echo   INSTALACION COMPLETADA
echo ========================================
echo.
echo Para iniciar la aplicacion, ejecuta:
echo   npm run dev
echo.
echo Credenciales de login:
echo   Email: admin@lucy3000.com
echo   Password: admin123
echo.
pause

