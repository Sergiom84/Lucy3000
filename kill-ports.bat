@echo off
echo Limpiando puertos ocupados...

REM Matar proceso en puerto 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    echo Matando proceso en puerto 3001 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

REM Matar proceso en puerto 5173
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    echo Matando proceso en puerto 5173 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

REM Matar proceso en puerto 5174
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do (
    echo Matando proceso en puerto 5174 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

echo.
echo Puertos limpiados. Puedes ejecutar: npm run dev
echo.
pause

