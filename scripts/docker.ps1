# Blink Docker helpers (Windows PowerShell).
# Usage: .\scripts\docker.ps1 start|stop|rebuild|restart|logs|status|down
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "rebuild", "restart", "logs", "status", "ps", "down", "help")]
  [string]$Command = "help",

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

function Test-ComposeAvailable {
  try {
    docker compose version 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

if (-not (Test-ComposeAvailable)) {
  Write-Error "Docker Compose v2 (docker compose) is required. Install Docker Desktop and retry."
}

function Invoke-Compose {
  param([Parameter(Mandatory = $true)][string[]]$ComposeArgs)
  & docker @ComposeArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Ensure-EnvFile {
  if (-not (Test-Path -Path ".env")) {
    if (Test-Path -Path ".env.example") {
      Write-Host "No .env found - copying from .env.example"
      Copy-Item -Path ".env.example" -Destination ".env"
      Write-Host "Edit .env secrets (BLINK_PASSWORD / BLINK_API_KEY / BLINK_SESSION_SECRET) before production use."
    } else {
      Write-Error "Missing .env (and no .env.example to copy)"
    }
  }
}

function Show-Help {
  Write-Host @"
Blink Docker helpers

Usage: .\scripts\docker.ps1 <command> [args...]

Commands:
  start      Start stack in background (build if needed)
  stop       Stop containers (keep volumes)
  rebuild    Rebuild images and recreate containers
  restart    Restart running containers
  logs       Follow service logs (optional service name)
  status     Show compose ps
  down       Stop and remove containers (keep volumes)
  help       Show this help

Examples:
  .\scripts\docker.ps1 start
  .\scripts\docker.ps1 logs api
  .\scripts\docker.ps1 rebuild
"@
}

$extra = @()
if ($Rest) { $extra = @($Rest) }

switch ($Command) {
  "start" {
    Ensure-EnvFile
    Invoke-Compose (@("compose", "up", "-d", "--build") + $extra)
    Write-Host ""
    Write-Host "Admin UI:  http://localhost/admin/"
    Write-Host "API docs:  http://localhost/api/docs"
    Write-Host "Health:    http://localhost/api/health"
  }
  "stop" {
    Invoke-Compose (@("compose", "stop") + $extra)
  }
  "down" {
    Invoke-Compose (@("compose", "down") + $extra)
  }
  "rebuild" {
    Ensure-EnvFile
    Invoke-Compose (@("compose", "up", "-d", "--build", "--force-recreate") + $extra)
    Write-Host ""
    Write-Host "Rebuilt. Admin UI: http://localhost/admin/"
  }
  "restart" {
    Invoke-Compose (@("compose", "restart") + $extra)
  }
  "logs" {
    Invoke-Compose (@("compose", "logs", "-f", "--tail=200") + $extra)
  }
  { $_ -in @("status", "ps") } {
    Invoke-Compose (@("compose", "ps") + $extra)
  }
  "help" {
    Show-Help
  }
}
