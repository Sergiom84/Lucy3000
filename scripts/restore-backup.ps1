param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [ValidateSet("full", "schema", "data")]
  [string]$Mode = "full",
  [switch]$PublicOnly,
  [switch]$NoClean,
  [string]$PgBinDir = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup file not found: $BackupPath"
}

function Resolve-PgTool([string]$toolName, [string]$pgBinDirArg) {
  if (-not [string]::IsNullOrWhiteSpace($pgBinDirArg)) {
    $candidate = Join-Path $pgBinDirArg "$toolName.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $cmd = Get-Command $toolName -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  throw "$toolName is required but not available. Add it to PATH or pass -PgBinDir."
}

function Get-DumpKind([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  try {
    $buffer = New-Object byte[] 5
    $read = $stream.Read($buffer, 0, 5)
    if ($read -eq 5) {
      $sig = [System.Text.Encoding]::ASCII.GetString($buffer)
      if ($sig -eq "PGDMP") { return "custom" }
    }
  } finally {
    $stream.Dispose()
  }
  return "plain"
}

function Parse-DatabaseUrl([string]$databaseUrlArg) {
  if ([string]::IsNullOrWhiteSpace($databaseUrlArg)) {
    return $null
  }

  if (-not $databaseUrlArg.StartsWith("postgresql://")) {
    return $null
  }

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

function Build-FilteredPlainSql([string]$sourcePath, [string]$targetPath, [string]$modeArg, [bool]$publicOnlyArg) {
  $lines = Get-Content -LiteralPath $sourcePath
  $out = New-Object System.Collections.Generic.List[string]

  $inCopy = $false
  $includeCopy = $false
  $includeBlock = $false

  foreach ($line in $lines) {
    if ($inCopy) {
      if ($includeCopy) {
        $out.Add($line)
      }
      if ($line -eq '\.') {
        $inCopy = $false
        $includeCopy = $false
      }
      continue
    }

    if ($line -match '^COPY\s+([^ ]+)\s+\(') {
      $target = $matches[1]
      $isPublic = $target.StartsWith('public.')
      $wantData = ($modeArg -eq "full" -or $modeArg -eq "data")
      $includeCopy = $wantData -and ((-not $publicOnlyArg) -or $isPublic)
      $inCopy = $true
      if ($includeCopy) { $out.Add($line) }
      continue
    }

    if ($includeBlock) {
      $out.Add($line)
      if ($line.TrimEnd().EndsWith(';')) {
        $includeBlock = $false
      }
      continue
    }

    $wantSchema = ($modeArg -eq "full" -or $modeArg -eq "schema")
    if (-not $wantSchema) { continue }

    # Keep minimal session settings that are safe on hosted Postgres.
    if ($line -match '^SET\s+(client_encoding|standard_conforming_strings)\s*=') {
      $out.Add($line)
      continue
    }

    # Skip global/role statements that usually fail on managed Supabase.
    if ($line -match '^(CREATE ROLE|ALTER ROLE|GRANT .* TO (anon|authenticated|service_role|postgres|supabase_.*)|REVOKE )') {
      continue
    }

    if ($line -match '^CREATE TYPE\s+public\.' -or
        $line -match '^ALTER TYPE\s+public\.' -or
        $line -match '^CREATE INDEX .* ON public\.' -or
        $line -match '^ALTER TABLE ONLY public\.' -or
        $line -match '^ALTER TABLE public\.' -or
        $line -match '^COMMENT ON (TABLE|COLUMN)\s+public\.' -or
        $line -match '^CREATE EXTENSION ') {
      if (-not $publicOnlyArg -or $line -match 'public\.') {
        $out.Add($line)
      }
      continue
    }

    if ($line -match '^CREATE TABLE\s+([^ ]+)\s*\(') {
      $target = $matches[1]
      $isPublic = $target.StartsWith('public.')
      if ((-not $publicOnlyArg) -or $isPublic) {
        $includeBlock = $true
        $out.Add($line)
      }
      continue
    }
  }

  $out | Set-Content -LiteralPath $targetPath -Encoding UTF8
}

$dumpKind = Get-DumpKind -path $BackupPath
Write-Host "Detected dump kind: $dumpKind"
$parsedDb = Parse-DatabaseUrl -databaseUrlArg $DatabaseUrl
if ($parsedDb) {
  $env:PGPASSWORD = $parsedDb.pass
}

if ($dumpKind -eq "custom") {
  $pgRestoreExe = Resolve-PgTool -toolName "pg_restore" -pgBinDirArg $PgBinDir
  $args = @()

  if ($Mode -eq "schema") { $args += "--schema-only" }
  if ($Mode -eq "data") { $args += "--data-only" }

  if (-not $NoClean -and $Mode -ne "data") {
    $args += "--clean"
    $args += "--if-exists"
  }

  if ($PublicOnly) {
    $args += "-n"
    $args += "public"
  }

  $args += "--no-owner"
  $args += "--no-privileges"
  $args += "--single-transaction"
  if ($parsedDb) {
    $args += "--host=$($parsedDb.host)"
    $args += "--port=$($parsedDb.port)"
    $args += "--username=$($parsedDb.user)"
    $args += "--dbname=$($parsedDb.db)"
  } else {
    $args += "--dbname=$DatabaseUrl"
  }
  $args += $BackupPath

  Write-Host "Running pg_restore..."
  & $pgRestoreExe @args
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed with exit code $LASTEXITCODE"
  }
  if ($parsedDb) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  Write-Host "Restore completed successfully (custom dump)."
  exit 0
}

# Plain SQL dump path
$psqlExe = Resolve-PgTool -toolName "psql" -pgBinDirArg $PgBinDir
$workDir = Split-Path -Path $BackupPath -Parent
$filteredSql = Join-Path $workDir ("filtered_" + [IO.Path]::GetFileNameWithoutExtension($BackupPath) + ".sql")

Build-FilteredPlainSql -sourcePath $BackupPath -targetPath $filteredSql -modeArg $Mode -publicOnlyArg $PublicOnly.IsPresent
Write-Host "Generated filtered SQL: $filteredSql"

$psqlArgs = @(
  "--set", "ON_ERROR_STOP=1"
)

if ($parsedDb) {
  $psqlArgs += @(
    "--host", $parsedDb.host,
    "--port", $parsedDb.port,
    "--username", $parsedDb.user,
    "--dbname", $parsedDb.db
  )
} else {
  $psqlArgs += "--dbname=$DatabaseUrl"
}

$psqlArgs += "--file=$filteredSql"

Write-Host "Running psql..."
& $psqlExe @psqlArgs
if ($LASTEXITCODE -ne 0) {
  throw "psql restore failed with exit code $LASTEXITCODE"
}

if ($parsedDb) {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
Write-Host "Restore completed successfully (plain SQL dump)."
