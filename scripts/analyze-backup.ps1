param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup file not found: $BackupPath"
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Split-Path -Path $BackupPath -Parent
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$backupName = [IO.Path]::GetFileNameWithoutExtension($BackupPath)
$stringsPath = Join-Path $OutputDir "$backupName.strings.txt"
$jsonPath = Join-Path $OutputDir "$backupName.audit.json"
$mdPath = Join-Path $OutputDir "$backupName.audit.md"

Write-Host "Extracting printable strings from backup..."
$bytes = [System.IO.File]::ReadAllBytes($BackupPath)
$builder = New-Object System.Text.StringBuilder
$strings = New-Object System.Collections.Generic.List[string]

foreach ($b in $bytes) {
  if (($b -ge 32 -and $b -le 126) -or $b -eq 9) {
    [void]$builder.Append([char]$b)
  } else {
    if ($builder.Length -ge 4) {
      $strings.Add($builder.ToString())
    }
    $builder.Clear() | Out-Null
  }
}

if ($builder.Length -ge 4) {
  $strings.Add($builder.ToString())
}

$strings | Set-Content -Path $stringsPath -Encoding UTF8

$publicTables = New-Object System.Collections.Generic.HashSet[string]
$enumTypes = New-Object System.Collections.Generic.HashSet[string]
$inCopy = $false
$currentCopyTable = $null
$tableRowCounts = @{}

foreach ($line in $strings) {
  if ($line -match '^CREATE TYPE public\."([^"]+)" AS ENUM') {
    [void]$enumTypes.Add($matches[1])
    continue
  }

  if ($line -match '^CREATE TABLE public\.([a-zA-Z0-9_]+)\s*\(') {
    [void]$publicTables.Add($matches[1])
    continue
  }

  if ($line -match '^COPY ([^ ]+) \(') {
    $inCopy = $true
    $currentCopyTable = $matches[1]
    if (-not $tableRowCounts.ContainsKey($currentCopyTable)) {
      $tableRowCounts[$currentCopyTable] = 0
    }
    continue
  }

  if ($inCopy -and $line -match '^-- Data for Name:') {
    $inCopy = $false
    $currentCopyTable = $null
    continue
  }

  if ($inCopy -and $currentCopyTable) {
    if ($line -match '^(ALTER|CREATE|COMMENT|GRANT|REVOKE|SET|SELECT pg_catalog|$)') {
      continue
    }
    $tableRowCounts[$currentCopyTable]++
  }
}

$publicDataCounts = @{}
foreach ($kv in $tableRowCounts.GetEnumerator()) {
  if ($kv.Key.StartsWith("public.")) {
    $publicDataCounts[$kv.Key] = $kv.Value
  }
}

$report = [ordered]@{
  backup_path = $BackupPath
  backup_size_bytes = (Get-Item -LiteralPath $BackupPath).Length
  generated_at_utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  public_tables = ($publicTables | Sort-Object)
  public_table_count = $publicTables.Count
  public_enums = ($enumTypes | Sort-Object)
  public_data_estimated_rows = $publicDataCounts
  notes = @(
    "Row counts are estimated from extracted printable strings.",
    "Use pg_restore -l for exact object inventory when pg_restore is installed."
  )
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8

$lines = @()
$lines += "# Backup Audit"
$lines += ""
$lines += ('- Backup: `' + $BackupPath + '`')
$lines += "- Size (bytes): $($report.backup_size_bytes)"
$lines += "- Generated (UTC): $($report.generated_at_utc)"
$lines += "- Public tables detected: $($report.public_table_count)"
$lines += ""
$lines += "## Public Tables"
foreach ($t in $report.public_tables) {
  $lines += "- $t"
}
$lines += ""
$lines += "## Public Enums"
foreach ($e in $report.public_enums) {
  $lines += "- $e"
}
$lines += ""
$lines += "## Estimated Public Row Counts"
foreach ($item in ($report.public_data_estimated_rows.GetEnumerator() | Sort-Object Name)) {
  $lines += "- $($item.Name): $($item.Value)"
}
$lines += ""
$lines += "## Notes"
foreach ($n in $report.notes) {
  $lines += "- $n"
}

$lines | Set-Content -Path $mdPath -Encoding UTF8

Write-Host "Audit generated:"
Write-Host " - $jsonPath"
Write-Host " - $mdPath"
Write-Host " - $stringsPath"
