param()

$ErrorActionPreference = "Stop"

function Load-EnvFile {
  param(
    [string]$Path,
    [bool]$Override = $false
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()

    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
      return
    }

    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) {
      return
    }

    $key = $parts[0].Trim()
    if ([string]::IsNullOrWhiteSpace($key)) {
      return
    }

    if (-not $Override -and -not [string]::IsNullOrWhiteSpace((Get-Item "Env:$key" -ErrorAction SilentlyContinue).Value)) {
      return
    }

    $value = $parts[1].Trim()
    if ($value.Length -ge 2) {
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    Set-Item -Path "Env:$key" -Value $value
  }
}

Load-EnvFile -Path ".env"
Load-EnvFile -Path ".env.development" -Override $true

function Get-DatabaseHostPort {
  param(
    [string]$DatabaseUrl
  )

  try {
    $uri = [System.Uri]$DatabaseUrl
  } catch {
    return $null
  }

  if ([string]::IsNullOrWhiteSpace($uri.Host)) {
    return $null
  }

  $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  return @{
    Host = $uri.Host
    Port = $port
  }
}

function Normalize-DatabaseUrl {
  param(
    [string]$DatabaseUrl
  )

  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    return $DatabaseUrl
  }

  try {
    [void][System.Uri]$DatabaseUrl
    return $DatabaseUrl
  } catch {
    # Continue with manual normalization.
  }

  $pattern = '^postgresql:\/\/([^:\/?#]+):(.+)@([^\/?#:]+)(?::(\d+))?\/([^\/?#]+)(\?.*)?$'
  $m = [regex]::Match($DatabaseUrl, $pattern)
  if (-not $m.Success) {
    return $DatabaseUrl
  }

  $rawUser = $m.Groups[1].Value
  $rawPass = $m.Groups[2].Value
  $dbHost = $m.Groups[3].Value
  $port = $m.Groups[4].Value
  $db = $m.Groups[5].Value
  $query = $m.Groups[6].Value

  $encUser = [System.Uri]::EscapeDataString($rawUser)
  $encPass = [System.Uri]::EscapeDataString($rawPass)
  $portPart = if ([string]::IsNullOrWhiteSpace($port)) { "" } else { ":$port" }

  return "postgresql://${encUser}:${encPass}@${dbHost}${portPart}/${db}${query}"
}

function Test-TcpPort {
  param(
    [string]$ComputerName,
    [int]$Port,
    [int]$TimeoutMs = 3000
  )

  $client = New-Object System.Net.Sockets.TcpClient

  try {
    $connect = $client.BeginConnect($ComputerName, $Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }

    $client.EndConnect($connect) | Out-Null
    return $true
  } catch {
    return $false
  } finally {
    if ($connect -and $connect.AsyncWaitHandle) {
      $connect.AsyncWaitHandle.Close()
    }
    $client.Close()
  }
}

function Set-DatabaseUrlFromSupabaseLink {
  Write-Host "DATABASE_URL not found. Resolving temporary DB credentials from linked Supabase project..."

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
    throw "Could not extract DB credentials from Supabase CLI. Run 'npx supabase login' and 'npx supabase link --project-ref <ref>'."
  }

  $encUser = [System.Uri]::EscapeDataString($pgUser)
  $encPass = [System.Uri]::EscapeDataString($pgPass)
  $encDb = [System.Uri]::EscapeDataString($pgDb)
  $encOptions = [System.Uri]::EscapeDataString("-c role=postgres")
  $env:DATABASE_URL = "postgresql://${encUser}:${encPass}@$($pgHost):$($pgPort)/${encDb}?sslmode=require&options=$encOptions"

  Write-Host "DATABASE_URL loaded from Supabase link."
}

function Get-SupabasePoolerEndpoint {
  try {
    $dumpOut = cmd /c "npx supabase db dump --dry-run --linked 2>&1" | Out-String
  } catch {
    return $null
  }

  $poolHost = [regex]::Match($dumpOut, 'PGHOST=\"([^\"]+)\"').Groups[1].Value
  $poolPort = [regex]::Match($dumpOut, 'PGPORT=\"([^\"]+)\"').Groups[1].Value

  if ([string]::IsNullOrWhiteSpace($poolHost) -or [string]::IsNullOrWhiteSpace($poolPort)) {
    return $null
  }

  return @{
    Host = $poolHost
    Port = $poolPort
  }
}

function Replace-DatabaseEndpoint {
  param(
    [string]$DatabaseUrl,
    [string]$NewHost,
    [string]$NewPort
  )

  if ([string]::IsNullOrWhiteSpace($DatabaseUrl) -or
      [string]::IsNullOrWhiteSpace($NewHost) -or
      [string]::IsNullOrWhiteSpace($NewPort)) {
    return $DatabaseUrl
  }

  $pattern = '^postgresql:\/\/(.+?)@([^\/?#:]+)(?::(\d+))?\/(.+)$'
  $m = [regex]::Match($DatabaseUrl, $pattern)
  if (-not $m.Success) {
    return $DatabaseUrl
  }

  $userInfo = $m.Groups[1].Value
  $suffix = $m.Groups[4].Value
  return "postgresql://${userInfo}@${NewHost}:${NewPort}/${suffix}"
}

function Ensure-PoolerUsername {
  param(
    [string]$DatabaseUrl,
    [string]$ProjectRef
  )

  if ([string]::IsNullOrWhiteSpace($DatabaseUrl) -or [string]::IsNullOrWhiteSpace($ProjectRef)) {
    return $DatabaseUrl
  }

  $pattern = '^postgresql:\/\/([^:\/?#]+):(.+)@([^\/?#:]+)(?::(\d+))?\/(.+)$'
  $m = [regex]::Match($DatabaseUrl, $pattern)
  if (-not $m.Success) {
    return $DatabaseUrl
  }

  $user = [System.Uri]::UnescapeDataString($m.Groups[1].Value)
  $password = $m.Groups[2].Value
  $dbHost = $m.Groups[3].Value
  $port = $m.Groups[4].Value
  $suffix = $m.Groups[5].Value

  if ($user -eq "postgres") {
    $user = "postgres.$ProjectRef"
  } elseif (-not $user.EndsWith(".$ProjectRef")) {
    return $DatabaseUrl
  }

  $encUser = [System.Uri]::EscapeDataString($user)
  $portPart = if ([string]::IsNullOrWhiteSpace($port)) { "" } else { ":$port" }
  return "postgresql://${encUser}:${password}@${dbHost}${portPart}/${suffix}"
}

if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  $normalized = Normalize-DatabaseUrl -DatabaseUrl $env:DATABASE_URL
  if ($normalized -ne $env:DATABASE_URL) {
    $env:DATABASE_URL = $normalized
    Write-Host "DATABASE_URL credentials were normalized for special characters."
  }

  $target = Get-DatabaseHostPort -DatabaseUrl $env:DATABASE_URL
  $hostMatch = if ($null -ne $target) { [regex]::Match($target.Host, '^db\.([a-z0-9]+)\.supabase\.co$') } else { $null }
  if ($null -ne $target -and $null -ne $hostMatch -and $hostMatch.Success) {
    $projectRef = $hostMatch.Groups[1].Value
    $env:DATABASE_URL = Ensure-PoolerUsername -DatabaseUrl $env:DATABASE_URL -ProjectRef $projectRef
    $pooler = Get-SupabasePoolerEndpoint
    if ($null -ne $pooler -and $pooler.Host -ne $target.Host) {
      $env:DATABASE_URL = Replace-DatabaseEndpoint -DatabaseUrl $env:DATABASE_URL -NewHost $pooler.Host -NewPort $pooler.Port
      Write-Host "DATABASE_URL endpoint switched to Supabase pooler host '$($pooler.Host):$($pooler.Port)'."
    }
  }
}

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  Set-DatabaseUrlFromSupabaseLink
}

$effectiveDbTarget = Get-DatabaseHostPort -DatabaseUrl $env:DATABASE_URL
if ($null -ne $effectiveDbTarget) {
  Write-Host "Using DATABASE_URL host '$($effectiveDbTarget.Host):$($effectiveDbTarget.Port)'."
} else {
  throw "DATABASE_URL has invalid format. Check .env/.env.development."
}

if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
  $env:JWT_SECRET = "lucy3000-dev-jwt-secret"
  Write-Host "JWT_SECRET not found. Using development fallback secret."
}

& npx nodemon --watch src/backend --ext ts,json --exec ts-node --project tsconfig.backend.dev.json src/backend/server.ts
