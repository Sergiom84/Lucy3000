param()

$ErrorActionPreference = "Stop"

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

$shouldResolveDbFromSupabase = [string]::IsNullOrWhiteSpace($env:DATABASE_URL)

if (-not $shouldResolveDbFromSupabase) {
  $dbTarget = Get-DatabaseHostPort -DatabaseUrl $env:DATABASE_URL

  if ($null -eq $dbTarget) {
    Write-Host "DATABASE_URL has invalid format. Refreshing credentials from Supabase link..."
    $shouldResolveDbFromSupabase = $true
  } else {
    $isReachable = Test-TcpPort -ComputerName $dbTarget.Host -Port $dbTarget.Port
    if (-not $isReachable) {
      Write-Host "DATABASE_URL host '$($dbTarget.Host):$($dbTarget.Port)' is unreachable. Refreshing credentials from Supabase link..."
      $shouldResolveDbFromSupabase = $true
    }
  }
}

if ($shouldResolveDbFromSupabase) {
  Set-DatabaseUrlFromSupabaseLink
}

$effectiveDbTarget = Get-DatabaseHostPort -DatabaseUrl $env:DATABASE_URL
if ($null -ne $effectiveDbTarget) {
  Write-Host "Using DATABASE_URL host '$($effectiveDbTarget.Host):$($effectiveDbTarget.Port)'."
}

if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
  $env:JWT_SECRET = "lucy3000-dev-jwt-secret"
  Write-Host "JWT_SECRET not found. Using development fallback secret."
}

& npx nodemon --watch src/backend --ext ts,json --exec ts-node --project tsconfig.backend.dev.json src/backend/server.ts
