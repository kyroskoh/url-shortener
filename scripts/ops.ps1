# Ops wrappers for Blink production (invokes bash scripts).
# Usage: .\scripts\ops.ps1 bootstrap|ship|cf-dry-run
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("bootstrap", "ship", "cf-dry-run")]
  [string]$Command
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Invoke-Bash([string]$Script, [string[]]$ScriptArgs = @()) {
  $bash = Get-Command bash -ErrorAction SilentlyContinue
  if (-not $bash) {
    $gitBash = "C:\Program Files\Git\bin\bash.exe"
    if (Test-Path $gitBash) { $bashPath = $gitBash }
    else { throw "bash not found. Install Git for Windows or WSL." }
  } else {
    $bashPath = $bash.Source
  }
  & $bashPath $Script @ScriptArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

switch ($Command) {
  "bootstrap" {
    Invoke-Bash "$Root/deploy/scripts/bootstrap-github-env.sh"
  }
  "ship" {
    Invoke-Bash "$Root/deploy/scripts/ship-prod.sh"
  }
  "cf-dry-run" {
    Invoke-Bash "$Root/deploy/scripts/ship-prod.sh" @("--dry-run")
  }
}
