#!/usr/bin/env node
/**
 * Ensure a Cloudflare Turnstile widget for layurl.com and write keys into .env.production.
 * Never prints secret values.
 *
 * Usage:
 *   node deploy/scripts/ensure-turnstile.mjs
 *   ENV_FILE=.env.production node deploy/scripts/ensure-turnstile.mjs
 *
 * Requires CLOUDFLARE_API_TOKEN (Turnstile Sites Write) and CLOUDFLARE_ZONE_ID.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ENV_FILE = path.resolve(process.env.ENV_FILE || path.join(ROOT, ".env.production"));
const WIDGET_NAME = "blink-layurl";
const DOMAINS = ["layurl.com", "www.layurl.com"];

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cleaned = line.startsWith("export ") ? line.slice(7) : line;
    const eq = cleaned.indexOf("=");
    if (eq < 1) continue;
    const key = cleaned.slice(0, eq).trim();
    let val = cleaned.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function upsertEnvKeys(filePath, updates) {
  let text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const next = lines.map((line) => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!m) return line;
    const key = m[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, val] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${val}`);
  }
  fs.writeFileSync(filePath, `${next.join("\n").replace(/\n*$/, "\n")}`, "utf8");
}

async function cf(token, apiPath, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { ok: res.ok && json.success !== false, status: res.status, json };
}

function domainsMatch(widgetDomains) {
  const set = new Set((widgetDomains ?? []).map((d) => String(d).toLowerCase()));
  return DOMAINS.every((d) => set.has(d));
}

async function listWidgets(token, accountId) {
  const widgets = [];
  let page = 1;
  for (;;) {
    const r = await cf(
      token,
      `/accounts/${accountId}/challenges/widgets?page=${page}&per_page=50`,
    );
    if (!r.ok) {
      return { ok: false, status: r.status, error: r.json, widgets };
    }
    const batch = r.json.result ?? [];
    widgets.push(...batch);
    const info = r.json.result_info;
    if (!info || page * (info.per_page ?? 50) >= (info.total_count ?? batch.length)) {
      break;
    }
    page += 1;
  }
  return { ok: true, widgets };
}

async function main() {
  const env = loadEnvFile(ENV_FILE);
  const token = env.CLOUDFLARE_API_TOKEN;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID required in", ENV_FILE);
    process.exit(1);
  }

  const zone = await cf(token, `/zones/${zoneId}`);
  if (!zone.ok) {
    console.error("Cannot read zone — check CLOUDFLARE_ZONE_ID / token scopes");
    process.exit(1);
  }
  const accountId = zone.json.result?.account?.id;
  if (!accountId) {
    console.error("Zone response missing account.id");
    process.exit(1);
  }

  console.log(`Ensuring Turnstile widget "${WIDGET_NAME}" for ${DOMAINS.join(", ")} …`);

  const listed = await listWidgets(token, accountId);
  if (!listed.ok) {
    if (listed.status === 403 || listed.status === 401) {
      console.error(
        "Turnstile API unauthorized. Add Account → Turnstile → Edit (Turnstile Sites Write) to the API token, then re-run.",
      );
    } else {
      console.error("Failed to list Turnstile widgets:", JSON.stringify(listed.error?.errors ?? listed.error));
    }
    process.exit(1);
  }

  let widget =
    listed.widgets.find((w) => w.name === WIDGET_NAME) ||
    listed.widgets.find((w) => domainsMatch(w.domains));

  if (widget?.sitekey && !widget.secret) {
    const detail = await cf(
      token,
      `/accounts/${accountId}/challenges/widgets/${encodeURIComponent(widget.sitekey)}`,
    );
    if (detail.ok && detail.json.result) {
      widget = detail.json.result;
    }
  }

  if (!widget) {
    const created = await cf(token, `/accounts/${accountId}/challenges/widgets`, {
      method: "POST",
      body: {
        name: WIDGET_NAME,
        mode: "managed",
        domains: DOMAINS,
      },
    });
    if (!created.ok) {
      if (created.status === 403 || created.status === 401) {
        console.error(
          "Turnstile create unauthorized. Add Account → Turnstile → Edit (Turnstile Sites Write) to the API token, then re-run.",
        );
      } else {
        console.error(
          "Failed to create Turnstile widget:",
          JSON.stringify(created.json?.errors ?? created.json),
        );
      }
      process.exit(1);
    }
    widget = created.json.result;
    console.log("Created Turnstile widget (sitekey redacted).");
  } else {
    console.log(`Reusing Turnstile widget "${widget.name ?? WIDGET_NAME}" (sitekey redacted).`);
    if (!domainsMatch(widget.domains) && widget.sitekey) {
      const updated = await cf(
        token,
        `/accounts/${accountId}/challenges/widgets/${encodeURIComponent(widget.sitekey)}`,
        {
          method: "PUT",
          body: {
            name: widget.name || WIDGET_NAME,
            mode: widget.mode || "managed",
            domains: DOMAINS,
          },
        },
      );
      if (updated.ok && updated.json.result) {
        widget = updated.json.result;
        console.log("Updated widget domains to layurl.com + www.layurl.com.");
      } else {
        console.warn(
          "Could not update widget domains (continuing with existing):",
          JSON.stringify(updated.json?.errors ?? updated.json),
        );
      }
    }
  }

  const sitekey = widget.sitekey;
  const secret = widget.secret;
  if (!sitekey || !secret) {
    console.error(
      "Widget response missing sitekey/secret. Open Cloudflare → Turnstile, copy keys into .env.production, or rotate secret via API.",
    );
    process.exit(1);
  }

  upsertEnvKeys(ENV_FILE, {
    BLINK_TURNSTILE_SITE_KEY: sitekey,
    BLINK_TURNSTILE_SECRET_KEY: secret,
  });
  console.log(`Wrote BLINK_TURNSTILE_SITE_KEY / BLINK_TURNSTILE_SECRET_KEY to ${ENV_FILE}`);
  console.log(`Sitekey prefix: ${sitekey.slice(0, 8)}… (secret not printed)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
