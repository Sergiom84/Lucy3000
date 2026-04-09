# Lucy3000 - Build Windows Installer (.exe)
# Run from PowerShell in the project root directory

$ErrorActionPreference = "Stop"

Write-Host "`n=== Lucy3000 Build ===" -ForegroundColor Cyan

# Step 1: Clean previous build
Write-Host "`n[1/5] Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "release") { Remove-Item -Recurse -Force "release" }

# Step 2: Generate Prisma client
Write-Host "`n[2/5] Generating Prisma client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "Prisma generate failed" }

# Step 3: Compile backend TypeScript
Write-Host "`n[3/5] Compiling backend..." -ForegroundColor Yellow
npx tsc -p tsconfig.backend.json
if ($LASTEXITCODE -ne 0) { throw "Backend compilation failed" }

# Step 4: Build frontend + Electron main/preload with Vite
Write-Host "`n[4/5] Building frontend and Electron..." -ForegroundColor Yellow
npx vite build
if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }

# Step 5: Package with electron-builder
Write-Host "`n[5/5] Packaging .exe installer..." -ForegroundColor Yellow
npx electron-builder --win
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "`n=== Build complete! ===" -ForegroundColor Green
Write-Host "Installer: release\Lucy3000 Accounting Setup 1.0.0.exe" -ForegroundColor Green
Write-Host "`nIMPORTANT: Copy your .env file next to the installed .exe on the target machine." -ForegroundColor Yellow
Write-Host "Location: C:\Users\<user>\AppData\Local\Programs\Lucy3000 Accounting\.env" -ForegroundColor Yellow
