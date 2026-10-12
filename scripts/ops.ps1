# Ops wrappers for Blink production (Git Bash + Windows gh.exe — not WSL).
# Usage: .\scripts\ops.ps1 bootstrap|ship|cf-dry-run
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("bootstrap", "ship", "cf-dry-run")]
  [string]$Command
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# Prefer Windows GitHub CLI on PATH for MSYS bash
$ghDir = "C:\Program Files\GitHub CLI"
if (Test-Path "$ghDir\gh.exe") {
  $env:PATH = "$ghDir;$env:PATH"
}

function Get-GitBash {
  $candidates = @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  # Do NOT use bare "bash" — on many machines that is WSL and segfaults with gh.exe
  throw "Git Bash not found. Install Git for Windows (https://git-scm.com/download/win)."
}

function Invoke-GitBash([string]$Script, [string[]]$ScriptArgs = @()) {
  $bashPath = Get-GitBash
  $unixScript = ($Script -replace '\\', '/')
  Write-Host "Using $bashPath (avoiding WSL for gh.exe stability)"
  & $bashPath $unixScript @ScriptArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

switch ($Command) {
  "bootstrap" {
    Invoke-GitBash "$Root\deploy\scripts\bootstrap-github-env.sh"
  }
  "ship" {
    Invoke-GitBash "$Root\deploy\scripts\ship-prod.sh"
  }
  "cf-dry-run" {
    Invoke-GitBash "$Root\deploy\scripts\ship-prod.sh" @("--dry-run")
  }
}
