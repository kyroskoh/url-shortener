# Blink Docker helpers (Windows PowerShell).
# Usage: .\scripts\docker.ps1 start|stop|rebuild|restart|logs|status|down|backup|restore
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "rebuild", "restart", "logs", "status", "ps", "down", "backup", "restore", "help")]
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
  backup     Postgres dump to ./backups/ (needs bash / Git Bash)
  restore    Restore dump (CONFIRM_RESTORE=1 + dump path; needs bash)
  help       Show this help

Examples:
  .\scripts\docker.ps1 start
  .\scripts\docker.ps1 logs api
  .\scripts\docker.ps1 rebuild
  .\scripts\docker.ps1 backup
  `$env:CONFIRM_RESTORE=1; .\scripts\docker.ps1 restore backups\blink-YYYYMMDD-HHMMSS.dump
"@
}

function Invoke-BashScript {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string[]]$ScriptArgs = @(),
    [hashtable]$EnvVars = @{}
  )
  $bash = Get-Command bash -ErrorAction SilentlyContinue
  if (-not $bash) {
    Write-Error "bash is required for backup/restore on Windows (Git Bash or WSL) or run deploy/scripts/*.sh directly."
  }
  # WSL bash does not inherit PowerShell env; prefix assignments in the bash command line.
  $exports = @()
  foreach ($key in $EnvVars.Keys) {
    $exports += "$key='$($EnvVars[$key])'"
  }
  $argList = ($ScriptArgs | ForEach-Object { "'$_'" }) -join " "
  $prefix = if ($exports.Count) { ($exports -join " ") + " " } else { "" }
  $cmd = "${prefix}'$ScriptPath' $argList".Trim()
  & bash -lc $cmd
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
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
  "backup" {
    # Relative paths work with WSL/Git Bash when cwd is repo root
    Invoke-BashScript -ScriptPath "./deploy/scripts/backup-postgres.sh" -ScriptArgs $extra
  }
  "restore" {
    if ($env:CONFIRM_RESTORE -ne "1") {
      Write-Error "Refuse to restore without CONFIRM_RESTORE=1 (e.g. `$env:CONFIRM_RESTORE='1'; .\scripts\docker.ps1 restore backups/blink-....dump)"
    }
    Invoke-BashScript -ScriptPath "./deploy/scripts/restore-postgres.sh" -ScriptArgs $extra -EnvVars @{ CONFIRM_RESTORE = "1" }
  }
  "help" {
    Show-Help
  }
}
