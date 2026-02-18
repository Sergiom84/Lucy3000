param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string[]]$Schemas = @("public"),
  [string]$OutputFile = "",
  [string]$PgBinDir = ""
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

if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  $timestamp = Get-Date -Format "yyyyMMddHHmmss"
  $OutputFile = Join-Path "supabase\migrations" "${timestamp}_remote_schema.sql"
}

$outputDir = Split-Path -Parent $OutputFile
if (-not [string]::IsNullOrWhiteSpace($outputDir) -and -not (Test-Path -LiteralPath $outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$pgDumpExe = Resolve-PgTool -toolName "pg_dump" -pgBinDirArg $PgBinDir

$args = @(
  "--schema-only"
  "--no-owner"
  "--no-privileges"
  "--quote-all-identifiers"
  "--dbname=$DatabaseUrl"
  "--file=$OutputFile"
)

foreach ($schema in $Schemas) {
  if (-not [string]::IsNullOrWhiteSpace($schema)) {
    $args += "--schema=$schema"
  }
}

Write-Host "Running pg_dump without Docker..."
& $pgDumpExe @args
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

Write-Host "Schema dump created: $OutputFile"
