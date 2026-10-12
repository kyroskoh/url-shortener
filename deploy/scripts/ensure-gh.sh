#!/usr/bin/env bash
# Ensure `gh` works from Git Bash / WSL (Windows installs ship gh.exe).
# Source:  source "$ROOT/deploy/scripts/ensure-gh.sh"
set -euo pipefail

_gh_resolve() {
  if command -v gh >/dev/null 2>&1; then
    command -v gh
    return
  fi
  if command -v gh.exe >/dev/null 2>&1; then
    command -v gh.exe
    return
  fi
  local c
  for c in \
    "/mnt/c/Program Files/GitHub CLI/gh.exe" \
    "/c/Program Files/GitHub CLI/gh.exe" \
    "C:/Program Files/GitHub CLI/gh.exe"
  do
    if [[ -f "$c" ]]; then
      printf '%s\n' "$c"
      return
    fi
  done
  return 1
}

GH_BIN="$(_gh_resolve)" || {
  echo "gh CLI required (https://cli.github.com/)." >&2
  echo "Install GitHub CLI, then: gh auth login" >&2
  return 1 2>/dev/null || exit 1
}

# Windows/WSL: provide a `gh` callable even when only gh.exe exists
gh() { "$GH_BIN" "$@"; }
export -f gh
export GH_BIN
unset -f _gh_resolve
