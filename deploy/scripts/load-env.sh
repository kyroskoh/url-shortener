#!/usr/bin/env bash
# Load KEY=VALUE lines from a dotenv file into the current shell (export).
# Does not expand $var inside values (unlike `source`), so passwords with $ are safe.
# Supports optional single or double quotes around values; strips matching quotes.
# Usage:  source "$ROOT/deploy/scripts/load-env.sh" path/to/.env
# Requires: bash; caller may use set -u.
set -euo pipefail

_load_env_file="${1:-}"
if [[ -z "$_load_env_file" || ! -f "$_load_env_file" ]]; then
  echo "load-env.sh: missing env file: ${_load_env_file:-<empty>}" >&2
  return 1 2>/dev/null || exit 1
fi

while IFS= read -r _load_env_line || [[ -n "${_load_env_line:-}" ]]; do
  # trim CR (Windows)
  _load_env_line="${_load_env_line%$'\r'}"
  # skip blank / comment
  [[ -z "$_load_env_line" || "$_load_env_line" =~ ^[[:space:]]*# ]] && continue
  # optional "export "
  _load_env_line="${_load_env_line#export }"
  [[ "$_load_env_line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
  _load_env_key="${BASH_REMATCH[1]}"
  _load_env_val="${BASH_REMATCH[2]}"
  if [[ "$_load_env_val" =~ ^\"(.*)\"$ ]]; then
    _load_env_val="${BASH_REMATCH[1]}"
  elif [[ "$_load_env_val" =~ ^\'(.*)\'$ ]]; then
    _load_env_val="${BASH_REMATCH[1]}"
  fi
  export "${_load_env_key}=${_load_env_val}"
done <"$_load_env_file"

unset _load_env_file _load_env_line _load_env_key _load_env_val
