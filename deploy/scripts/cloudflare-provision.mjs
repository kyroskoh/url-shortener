#!/usr/bin/env node
/**
 * Blink Cloudflare provisioner for layurl.com
 * Usage:
 *   node deploy/scripts/cloudflare-provision.mjs --dry-run
 *   node deploy/scripts/cloudflare-provision.mjs --apply
 */

import {
  CACHE_BYPASS_DESCRIPTION,
  CACHE_BYPASS_EXPRESSION,
  missingCredentials,
  plannedDnsRecords,
  plannedZoneSettings,
} from "./cloudflare-lib.mjs";

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY || process.argv.includes("--dry-run");

const token = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const ipv4 = process.env.CLOUDFLARE_ORIGIN_IPV4;
const ipv6 = process.env.CLOUDFLARE_ORIGIN_IPV6;
const manageWww = !["0", "false", "no"].includes(
  String(process.env.CLOUDFLARE_MANAGE_WWW ?? "true").toLowerCase(),
);

const MANUAL_GAPS = [
  {
    when: "Zone not yet added to Cloudflare / nameservers still at registrar",
    steps: [
      "Cloudflare dashboard → Add a site → enter layurl.com",
      "Registrar DNS settings → replace nameservers with Cloudflare NS (API cannot change registrar NS)",
    ],
  },
  {
    when: "Turnstile keys needed for public create",
    steps: [
      "Turnstile → Add site → domain layurl.com",
      "Copy site/secret keys into BLINK_TURNSTILE_SITE_KEY / BLINK_TURNSTILE_SECRET_KEY",
    ],
  },
  {
    when: "SSL mode Full (strict) but origin speaks HTTP only",
    steps: [
      "SSL/TLS → Origin Server → Create certificate",
      "Install cert on nginx HTTPS listener, or temporarily use Full (not strict) until origin TLS exists",
    ],
  },
  {
    when: "API token/plan cannot edit Cache Rules / Rulesets",
    steps: [
      "Caching → Cache Rules → Create rule",
      "Bypass cache for short-link redirects (dynamic /{slug} paths); do not edge-cache 302 bodies",
      "SSL/TLS → Overview → Full (strict)",
      "DNS → Records → ensure apex/www are Proxied (orange cloud)",
    ],
  },
  {
    when: "Stale edge cache after first deploy",
    steps: ["Caching → Configuration → Purge Everything (or purge by prefix)"],
  },
];

function printManual(reason) {
  console.log("\n=== Manual steps required (API not enough) ===");
  if (reason) console.log(`Reason: ${reason}`);
  for (const gap of MANUAL_GAPS) {
    console.log(`\n• ${gap.when}`);
    for (const s of gap.steps) console.log(`  - ${s}`);
  }
}

async function cf(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
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

async function upsertDns(type, name, content) {
  const list = await cf(
    `/zones/${zoneId}/dns_records?type=${type}&name=${encodeURIComponent(name)}`,
  );
  if (!list.ok) {
    return { ok: false, error: list.json };
  }
  const existing = list.json.result?.[0];
  const payload = {
    type,
    name,
    content,
    proxied: true,
    ttl: 1,
  };
  if (DRY) {
    console.log(
      `[dry-run] DNS ${existing ? "UPDATE" : "CREATE"} ${type} ${name} → ${content} (proxied)`,
    );
    return { ok: true, dry: true };
  }
  if (existing) {
    return cf(`/zones/${zoneId}/dns_records/${existing.id}`, {
      method: "PUT",
      body: payload,
    });
  }
  return cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: payload });
}

async function setZoneSetting(key, value) {
  if (DRY) {
    console.log(`[dry-run] Zone setting ${key} = ${JSON.stringify(value)}`);
    return { ok: true, dry: true };
  }
  return cf(`/zones/${zoneId}/settings/${key}`, {
    method: "PATCH",
    body: { value },
  });
}

async function ensureCacheBypassRule() {
  const description = CACHE_BYPASS_DESCRIPTION;
  const expression = CACHE_BYPASS_EXPRESSION;
  const action = "bypass";

  if (DRY) {
    console.log(`[dry-run] Cache Rule: ${description}`);
    console.log(`          expression: ${expression}`);
    console.log(`          action: ${action}`);
    return { ok: true, dry: true };
  }

  const entry = await cf(
    `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
  );

  if (!entry.ok) {
    printManual(
      `Rulesets API unavailable (${entry.status}). Configure Cache Rules in the dashboard.`,
    );
    return { ok: false, error: entry.json };
  }

  const ruleset = entry.json.result;
  const rules = Array.isArray(ruleset?.rules) ? [...ruleset.rules] : [];
  const idx = rules.findIndex((r) => r.description === description);
  const rule = {
    action: "set_cache_settings",
    description,
    expression,
    action_parameters: {
      cache: false,
    },
    enabled: true,
  };
  if (idx >= 0) rules[idx] = { ...rules[idx], ...rule };
  else rules.push(rule);

  const update = await cf(`/zones/${zoneId}/rulesets/${ruleset.id}`, {
    method: "PUT",
    body: { rules },
  });
  if (!update.ok) {
    printManual(
      `Failed to update cache ruleset: ${JSON.stringify(update.json?.errors ?? update.json)}`,
    );
  }
  return update;
}

async function main() {
  console.log(`Blink Cloudflare provisioner (${APPLY ? "APPLY" : "DRY-RUN"})`);
  console.log(
    "Cache expression target: single-segment paths like /{slug} (not /api/*)",
  );

  const missing = missingCredentials({ token, zoneId, ipv4, ipv6 });
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}`);
    printManual("Credentials missing — cannot call API");
    process.exit(1);
  }

  const zone = await cf(`/zones/${zoneId}`);
  if (!zone.ok) {
    console.error("Cannot read zone", zone.json);
    printManual("Invalid zone id or token scopes");
    process.exit(1);
  }
  const zoneName = zone.json.result?.name ?? "zone";
  console.log(`Zone: ${zoneName} (${zoneId})`);

  const failures = [];
  const dnsPlan = plannedDnsRecords({
    zoneName,
    ipv4,
    ipv6,
    manageWww,
  });
  for (const rec of dnsPlan) {
    const r = await upsertDns(rec.type, rec.name, rec.content);
    if (!r.ok) failures.push([`DNS ${rec.type} ${rec.name}`, r]);
  }

  for (const [key, value] of plannedZoneSettings()) {
    const r = await setZoneSetting(key, value);
    if (!r.ok) failures.push([`setting ${key}`, r]);
  }

  const cache = await ensureCacheBypassRule();
  if (!cache.ok) failures.push(["cache rule", cache]);

  if (failures.length) {
    console.error("\nSome API operations failed:");
    for (const [label, r] of failures) {
      console.error(`- ${label}:`, JSON.stringify(r.error ?? r.json ?? r));
    }
    printManual("One or more Cloudflare API calls failed");
    process.exit(1);
  }

  console.log(
    DRY ? "\nDry-run complete. Re-run with --apply to write." : "\nApply complete.",
  );
  console.log("Remaining operator-only gaps (always review):");
  printManual();
}

main().catch((err) => {
  console.error(err);
  printManual(String(err.message ?? err));
  process.exit(1);
});
