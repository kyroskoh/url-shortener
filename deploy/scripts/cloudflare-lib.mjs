/**
 * Pure helpers for Cloudflare provisioner (testable without API calls).
 */

export const CACHE_BYPASS_DESCRIPTION =
  "Blink — bypass cache for short-link redirects";

export const CACHE_BYPASS_EXPRESSION =
  '(http.request.uri.path matches "^/[A-Za-z0-9_-]+$" and not starts_with(http.request.uri.path, "/api"))';

/**
 * @param {{ zoneName: string, ipv4?: string, ipv6?: string, manageWww?: boolean }} opts
 * @returns {{ type: string, name: string, content: string }[]}
 */
export function plannedDnsRecords({
  zoneName,
  ipv4,
  ipv6,
  manageWww = true,
}) {
  /** @type {{ type: string, name: string, content: string }[]} */
  const out = [];
  if (ipv4) {
    out.push({ type: "A", name: zoneName, content: ipv4 });
    if (manageWww) {
      out.push({ type: "A", name: `www.${zoneName}`, content: ipv4 });
    }
  }
  if (ipv6) {
    out.push({ type: "AAAA", name: zoneName, content: ipv6 });
    if (manageWww) {
      out.push({ type: "AAAA", name: `www.${zoneName}`, content: ipv6 });
    }
  }
  return out;
}

export function plannedZoneSettings() {
  return [
    ["ssl", "strict"],
    ["always_use_https", "on"],
    ["min_tls_version", "1.2"],
  ];
}

/**
 * Records that block creating `desiredType` at the same name (Cloudflare exclusivity).
 * A/AAAA cannot coexist with CNAME; same-type rows are updates, not conflicts.
 * @param {string} desiredType
 * @param {{ type: string, id?: string, name?: string, content?: string }[]} existing
 */
export function dnsConflictsForUpsert(desiredType, existing) {
  const want = String(desiredType || "").toUpperCase();
  return (existing || []).filter((r) => {
    const t = String(r.type || "").toUpperCase();
    if (!t || t === want) return false;
    if (want === "A" || want === "AAAA") return t === "CNAME";
    if (want === "CNAME") return t === "A" || t === "AAAA" || t === "CNAME";
    return false;
  });
}

/**
 * @param {{ token?: string, zoneId?: string, ipv4?: string, ipv6?: string }} opts
 */
export function missingCredentials({ token, zoneId, ipv4, ipv6 }) {
  /** @type {string[]} */
  const missing = [];
  if (!token) missing.push("CLOUDFLARE_API_TOKEN");
  if (!zoneId) missing.push("CLOUDFLARE_ZONE_ID");
  if (!ipv4 && !ipv6) missing.push("CLOUDFLARE_ORIGIN_IPV4 or CLOUDFLARE_ORIGIN_IPV6");
  return missing;
}
