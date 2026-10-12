#!/usr/bin/env node
/**
 * Phase 0 smoke checks against a running stack (default http://localhost)
 */
const base = (process.env.BLINK_SMOKE_BASE ?? "http://localhost").replace(/\/$/, "");
const apiKey = process.env.BLINK_API_KEY ?? "changeme-api-key";

async function req(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...(init.headers ?? {}),
    },
    redirect: "manual",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, text, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`Smoke against ${base}`);

  const health = await req("/api/healthz");
  assert(health.res.status === 200, "healthz failed");

  const ready = await req("/api/readyz");
  assert(ready.res.status === 200, "readyz failed");

  const reserved = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({ destination: "https://example.com", slug: "api" }),
  });
  assert(reserved.res.status === 400, "reserved slug should fail");

  const badScheme = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({ destination: "javascript:alert(1)" }),
  });
  assert(badScheme.res.status === 400, "dangerous scheme should fail");

  const slug = `smoke${Date.now().toString(36)}`;
  const created = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({
      destination: "https://example.com/smoke",
      slug,
      notes: "smoke test",
    }),
  });
  assert(created.res.status === 201, `create failed: ${created.text}`);

  const redirect = await req(`/${slug}`);
  assert(
    redirect.res.status === 302 || redirect.res.status === 301,
    `redirect status ${redirect.res.status}`,
  );
  assert(
    redirect.res.headers.get("location")?.includes("example.com"),
    "redirect location missing",
  );

  // second hit (cache path)
  const redirect2 = await req(`/${slug}`);
  assert(redirect2.res.status === 302 || redirect2.res.status === 301, "second redirect failed");

  const expiredSlug = `exp${Date.now().toString(36)}`;
  const past = new Date(Date.now() - 60_000).toISOString();
  const expired = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({
      destination: "https://example.com/expired",
      slug: expiredSlug,
      expiresAt: past,
    }),
  });
  assert(expired.res.status === 201, "expired create failed");
  const gone = await req(`/${expiredSlug}`);
  assert(gone.res.status === 410, `expected 410 got ${gone.res.status}`);
  assert(gone.text.includes("expired") || gone.text.includes("Expired"), "branded 410 missing");

  const unauth = await fetch(`${base}/api/links`, { method: "GET" });
  assert(unauth.status === 401, "list without auth should 401");

  const qSlug = `q${Date.now().toString(36)}`;
  const qCreate = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({
      destination: "https://example.com/quarantine-me",
      slug: qSlug,
    }),
  });
  assert(qCreate.res.status === 201, "quarantine create failed");
  const qSet = await req(`/api/links/${qSlug}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "quarantined" }),
  });
  assert(qSet.res.status === 200, "quarantine status failed");
  const qRedir = await req(`/${qSlug}`);
  assert(qRedir.res.status === 410, `quarantine redirect expected 410 got ${qRedir.res.status}`);
  assert(
    qRedir.text.includes("unavailable") || qRedir.text.includes("Unavailable"),
    "quarantine branded page missing",
  );
  const qOn = await req(`/api/links/${qSlug}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "active" }),
  });
  assert(qOn.res.status === 200, "re-enable failed");
  const qRedir2 = await req(`/${qSlug}`);
  assert(
    qRedir2.res.status === 302 || qRedir2.res.status === 301,
    "re-enabled redirect failed",
  );

  await req(`/api/links/${slug}`, { method: "DELETE" });
  await req(`/api/links/${expiredSlug}`, { method: "DELETE" });
  await req(`/api/links/${qSlug}`, { method: "DELETE" });

  console.log("Smoke OK");
}

main().catch((err) => {
  console.error("Smoke FAILED", err);
  process.exit(1);
});
