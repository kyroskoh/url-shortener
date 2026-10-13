#!/usr/bin/env node
/**
 * Cross-platform ops launcher.
 * On Windows: prefer PowerShell → Git Bash + Windows gh.exe (avoids WSL↔gh.exe segfaults).
 * Elsewhere: invoke bash scripts directly.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cmd = process.argv[2];
const allowed = new Set(["bootstrap", "bootstrap:cf", "ship", "cf-dry-run", "turnstile"]);

if (!allowed.has(cmd)) {
  console.error(
    "Usage: node scripts/ops-run.mjs bootstrap|bootstrap:cf|ship|cf-dry-run|turnstile",
  );
  process.exit(1);
}

if (cmd === "turnstile") {
  run(process.execPath, [path.join(root, "deploy/scripts/ensure-turnstile.mjs")]);
}

function run(command, args, opts = {}) {
  const r = spawnSync(command, args, { stdio: "inherit", cwd: root, shell: false, ...opts });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}

if (process.platform === "win32") {
  const ps1 = path.join(root, "scripts", "ops.ps1");
  const map = {
    bootstrap: "bootstrap",
    "bootstrap:cf": "bootstrap",
    ship: "ship",
    "cf-dry-run": "cf-dry-run",
  };
  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, map[cmd]];
  if (cmd === "bootstrap:cf") {
    // ops.ps1 bootstrap has no --cf-only; call Git Bash directly
    const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
    if (!fs.existsSync(gitBash)) {
      console.error("Git Bash not found at C:\\Program Files\\Git\\bin\\bash.exe");
      process.exit(1);
    }
    run(gitBash, [
      path.join(root, "deploy/scripts/bootstrap-github-env.sh").replace(/\\/g, "/"),
      "--cf-only",
    ]);
  }
  run("powershell.exe", psArgs);
}

const script =
  cmd === "ship" || cmd === "cf-dry-run"
    ? "deploy/scripts/ship-prod.sh"
    : "deploy/scripts/bootstrap-github-env.sh";
const args = [path.join(root, script)];
if (cmd === "cf-dry-run") args.push("--dry-run");
if (cmd === "bootstrap:cf") args.push("--cf-only");
run("bash", args);
