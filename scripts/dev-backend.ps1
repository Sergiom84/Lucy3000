param()

$ErrorActionPreference = "Stop"

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

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  Set-DatabaseUrlFromSupabaseLink
}

if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
  $env:JWT_SECRET = "lucy3000-dev-jwt-secret"
  Write-Host "JWT_SECRET not found. Using development fallback secret."
}

& npx nodemon --watch src/backend --ext ts,json --exec ts-node --project tsconfig.backend.dev.json src/backend/server.ts
