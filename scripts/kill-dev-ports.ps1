param(
  [int[]]$Ports = @(3001, 5173, 5174)
)

$ErrorActionPreference = "Stop"

foreach ($port in $Ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    continue
  }

  foreach ($connection in $connections) {
    $procId = $connection.OwningProcess
    if ($procId -le 0) {
      continue
    }

    try {
      $process = Get-Process -Id $procId -ErrorAction Stop
      Write-Host "Killing PID $procId ($($process.ProcessName)) on port $port..."
      Stop-Process -Id $procId -Force -ErrorAction Stop
    } catch {
      Write-Warning "Could not kill PID $procId on port ${port}: $($_.Exception.Message)"
    }
  }
}

Write-Host "Dev ports cleaned."
