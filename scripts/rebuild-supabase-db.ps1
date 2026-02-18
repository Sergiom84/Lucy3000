param(
  [string]$BackupPath = "C:\Users\sergi\Desktop\backup Lucy3000\db_cluster-08-11-2025@00-27-55.backup",
  [switch]$SkipDataImport,
  [string]$DatabaseUrl = "",
  [string]$PgBinDir = ".\tools\postgresql-17\pgsql\bin"
)

$ErrorActionPreference = "Stop"

function Resolve-PgTool([string]$toolName, [string]$pgBinDirArg) {
  if (-not [string]::IsNullOrWhiteSpace($pgBinDirArg)) {
    $candidate = Join-Path $pgBinDirArg "$toolName.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $cmd = Get-Command $toolName -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  throw "$toolName is required but not available. Add it to PATH or pass -PgBinDir."
}

function Get-LinkedDatabaseCredentials() {
  Write-Host "Obtaining temporary DB credentials from Supabase CLI..."
  $dumpOut = cmd /c "npx supabase db dump --dry-run --linked 2>&1" | Out-String

  $pgHost = [regex]::Match($dumpOut, 'PGHOST=\"([^\"]+)\"').Groups[1].Value
  $pgPort = [regex]::Match($dumpOut, 'PGPORT=\"([^\"]+)\"').Groups[1].Value
  $pgUser = [regex]::Match($dumpOut, 'PGUSER=\"([^\"]+)\"').Groups[1].Value
  $pgPass = [regex]::Match($dumpOut, 'PGPASSWORD=\"([^\"]+)\"').Groups[1].Value
  $pgDb = [regex]::Match($dumpOut, 'PGDATABASE=\"([^\"]+)\"').Groups[1].Value

  if ([string]::IsNullOrWhiteSpace($pgHost) -or
      [string]::IsNullOrWhiteSpace($pgPort) -or
      [string]::IsNullOrWhiteSpace($pgUser) -or
      [string]::IsNullOrWhiteSpace($pgPass) -or
      [string]::IsNullOrWhiteSpace($pgDb)) {
    throw "Could not extract DB credentials from Supabase CLI. Make sure 'supabase link' and 'supabase login' are done."
  }

  return @{
    host = $pgHost
    port = $pgPort
    user = $pgUser
    pass = $pgPass
    db = $pgDb
  }
}

function Parse-DatabaseUrl([string]$databaseUrlArg) {
  $uri = [System.Uri]$databaseUrlArg
  $rawUserInfo = $uri.UserInfo
  if ([string]::IsNullOrWhiteSpace($rawUserInfo) -or -not $rawUserInfo.Contains(':')) {
    throw "Invalid DATABASE_URL. Expected postgresql://user:password@host:port/db"
  }

  $segments = $rawUserInfo.Split(':', 2)
  $user = [System.Uri]::UnescapeDataString($segments[0])
  $pass = [System.Uri]::UnescapeDataString($segments[1])

  $db = $uri.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($db)) {
    throw "Invalid DATABASE_URL. Missing database name."
  }

  return @{
    host = $uri.Host
    port = if ($uri.Port -gt 0) { $uri.Port.ToString() } else { "5432" }
    user = $user
    pass = $pass
    db = $db
  }
}

function Build-DatabaseUrl([hashtable]$creds) {
  $encUser = [System.Uri]::EscapeDataString($creds.user)
  $encPass = [System.Uri]::EscapeDataString($creds.pass)
  $encDb = [System.Uri]::EscapeDataString($creds.db)
  return "postgresql://${encUser}:${encPass}@$($creds.host):$($creds.port)/${encDb}?sslmode=require"
}

$psqlExe = Resolve-PgTool -toolName "psql" -pgBinDirArg $PgBinDir

$creds = if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Get-LinkedDatabaseCredentials
} else {
  Parse-DatabaseUrl -databaseUrlArg $DatabaseUrl
}

$baseDatabaseUrl = if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Build-DatabaseUrl -creds $creds
} else {
  $DatabaseUrl
}

$resetSqlPath = Join-Path $env:TEMP "lucy3000_reset_public.sql"
@'
SET ROLE postgres;
DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT format('%I.%I', schemaname, tablename) AS fqname
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || obj.fqname || ' CASCADE';
  END LOOP;

  FOR obj IN
    SELECT format('%I.%I', n.nspname, t.typname) AS fqname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
  LOOP
    EXECUTE 'DROP TYPE IF EXISTS ' || obj.fqname || ' CASCADE';
  END LOOP;
END $$;
'@ | Set-Content -LiteralPath $resetSqlPath -Encoding UTF8

$prismaMigrationsRoot = Join-Path $PSScriptRoot "..\prisma\migrations"
$latestMigrationDir = Get-ChildItem -Path $prismaMigrationsRoot -Directory | Sort-Object Name | Select-Object -Last 1
if (-not $latestMigrationDir) {
  throw "No Prisma migrations found in prisma/migrations."
}
$latestMigrationName = $latestMigrationDir.Name
$latestMigrationSql = Join-Path $latestMigrationDir.FullName "migration.sql"
if (-not (Test-Path -LiteralPath $latestMigrationSql)) {
  throw "Latest Prisma migration is missing migration.sql: $latestMigrationSql"
}

Write-Host "Resetting public schema..."
$env:PGPASSWORD = $creds.pass
$env:PGOPTIONS = "-c role=postgres"
& $psqlExe -h $creds.host -p $creds.port -U $creds.user -d $creds.db --set ON_ERROR_STOP=1 --file=$resetSqlPath
if ($LASTEXITCODE -ne 0) {
  throw "Failed resetting public schema."
}

Write-Host "Applying latest Prisma SQL migration with psql: $latestMigrationName"
& $psqlExe -h $creds.host -p $creds.port -U $creds.user -d $creds.db --set ON_ERROR_STOP=1 --file=$latestMigrationSql
if ($LASTEXITCODE -ne 0) {
  throw "Failed applying Prisma SQL migration."
}

Write-Host "Clearing stale Prisma advisory locks..."
& $psqlExe -h $creds.host -p $creds.port -U $creds.user -d $creds.db --set ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=72707369 AND pid <> pg_backend_pid();"

Write-Host "Writing Prisma migration metadata (_prisma_migrations)..."
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $migrationBytes = [System.IO.File]::ReadAllBytes($latestMigrationSql)
  $hashBytes = $sha256.ComputeHash($migrationBytes)
  $migrationChecksum = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
} finally {
  $sha256.Dispose()
}
$migrationId = [Guid]::NewGuid().ToString()
$migrationMetaSql = Join-Path $env:TEMP "lucy3000_prisma_migration_meta.sql"
@"
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64) NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '$latestMigrationName';

INSERT INTO "_prisma_migrations" (
  "id",
  "checksum",
  "migration_name",
  "started_at",
  "finished_at",
  "applied_steps_count"
)
VALUES (
  '$migrationId',
  '$migrationChecksum',
  '$latestMigrationName',
  now(),
  now(),
  1
);
"@ | Set-Content -LiteralPath $migrationMetaSql -Encoding UTF8

& $psqlExe -h $creds.host -p $creds.port -U $creds.user -d $creds.db --set ON_ERROR_STOP=1 --file=$migrationMetaSql
if ($LASTEXITCODE -ne 0) {
  throw "Failed writing Prisma migration metadata."
}

if (-not $SkipDataImport) {
  if (-not (Test-Path -LiteralPath $BackupPath)) {
    throw "Backup file not found: $BackupPath"
  }

  $backupDir = Split-Path -Path $BackupPath -Parent
  $backupName = [IO.Path]::GetFileNameWithoutExtension($BackupPath)
  $filteredBackupPath = Join-Path $backupDir ("filtered_" + $backupName + ".sql")

  if (Test-Path -LiteralPath $filteredBackupPath) {
    Write-Host "Importing historical data from existing filtered SQL: $filteredBackupPath"
    & $psqlExe -h $creds.host -p $creds.port -U $creds.user -d $creds.db --set ON_ERROR_STOP=1 --file=$filteredBackupPath
    if ($LASTEXITCODE -ne 0) {
      throw "Filtered SQL import failed."
    }
  } else {
    Write-Host "Importing historical data from backup (public/data only)..."
    & "$PSScriptRoot\restore-backup.ps1" `
      -BackupPath $BackupPath `
      -DatabaseUrl $baseDatabaseUrl `
      -Mode data `
      -PublicOnly `
      -NoClean `
      -PgBinDir $PgBinDir
    if ($LASTEXITCODE -ne 0) {
      throw "Backup data import failed."
    }
  }
} else {
  Write-Host "Skipping backup data import (--SkipDataImport)."
}

Write-Host "Ensuring admin user exists..."
& $psqlExe -h $creds.host -p $creds.port -U $creds.user -d $creds.db --set ON_ERROR_STOP=1 --file=scripts\create-admin.sql
if ($LASTEXITCODE -ne 0) {
  throw "Failed creating/updating admin user."
}

Write-Host "Validating public table counts..."
& $psqlExe -h $creds.host -p $creds.port -U $creds.user -d $creds.db --set ON_ERROR_STOP=1 --file=scripts\public-data-counts.sql
if ($LASTEXITCODE -ne 0) {
  throw "Failed validating counts."
}

Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Write-Host "Lucy3000 database rebuild completed successfully."
