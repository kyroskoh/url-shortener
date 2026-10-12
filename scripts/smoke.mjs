#!/usr/bin/env node
/**
 * Smoke checks against a running stack (default http://localhost)
 */
const base = (process.env.BLINK_SMOKE_BASE ?? "http://localhost").replace(/\/$/, "");
const apiKey = process.env.BLINK_API_KEY ?? "changeme-api-key";

async function req(path, init = {}) {
  const headers = {
    "x-api-key": apiKey,
    ...(init.headers ?? {}),
  };
  if (init.body != null && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
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

  const home = await req("/");
  assert(
    home.res.status === 302 || home.res.status === 301,
    `site-home expected redirect got ${home.res.status}`,
  );
  assert(
    (home.res.headers.get("location") ?? "").includes("/admin"),
    "site-home should redirect to /admin/",
  );

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

  const utmSlug = `utm${Date.now().toString(36)}`;
  const utmCreate = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({
      destination: "https://example.com/path?ref=1",
      slug: utmSlug,
      utmSource: "smoke",
      utmMedium: "test",
    }),
  });
  assert(utmCreate.res.status === 201, `utm create failed: ${utmCreate.text}`);
  assert(
    utmCreate.json?.link?.destination?.includes("utm_source=smoke"),
    "utm_source not applied to destination",
  );
  const utmRedir = await req(`/${utmSlug}`);
  const utmLoc = utmRedir.res.headers.get("location") ?? "";
  assert(utmLoc.includes("utm_source=smoke"), "utm redirect missing utm_source");
  assert(utmLoc.includes("ref=1"), "utm redirect dropped existing query");

  const onceSlug = `once${Date.now().toString(36)}`;
  const onceCreate = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({
      destination: "https://example.com/once",
      slug: onceSlug,
      oneTime: true,
    }),
  });
  assert(onceCreate.res.status === 201, "one-time create failed");
  const once1 = await req(`/${onceSlug}`);
  assert(once1.res.status === 302 || once1.res.status === 301, "one-time first redirect failed");
  const once2 = await req(`/${onceSlug}`);
  assert(once2.res.status === 404, `one-time second hit expected 404 got ${once2.res.status}`);

  const pwSlug = `pw${Date.now().toString(36)}`;
  const pwCreate = await req("/api/links", {
    method: "POST",
    body: JSON.stringify({
      destination: "https://example.com/secret",
      slug: pwSlug,
      password: "s3cret",
    }),
  });
  assert(pwCreate.res.status === 201, "password create failed");
  assert(pwCreate.json?.link?.hasPassword === true, "hasPassword should be true");
  const pwGate = await req(`/${pwSlug}`);
  assert(pwGate.res.status === 401, `password gate expected 401 got ${pwGate.res.status}`);
  assert(pwGate.text.includes("Password"), "password gate HTML missing");
  const pwWrong = await req(`/api/r/${pwSlug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=wrong",
  });
  assert(pwWrong.res.status === 401, "wrong password should fail");
  const pwOk = await req(`/api/r/${pwSlug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=s3cret",
  });
  assert(
    pwOk.res.status === 302 || pwOk.res.status === 301,
    `unlock redirect expected 302 got ${pwOk.res.status}`,
  );
  assert(
    pwOk.res.headers.get("location")?.includes("example.com/secret"),
    "unlock location wrong",
  );

  const importDry = await req("/api/links/import?dryRun=true", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: [
      "slug,destination,notes,expires_at",
      "impok,https://example.com/import,,",
      "impbad,javascript:alert(1),,",
    ].join("\n"),
  });
  assert(importDry.res.status === 200, `import dry-run failed: ${importDry.text}`);
  assert(importDry.json?.succeeded === 1, "import dry-run succeeded count");
  assert(importDry.json?.failed === 1, "import dry-run failed count");

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
  await req(`/api/links/${utmSlug}`, { method: "DELETE" });
  await req(`/api/links/${pwSlug}`, { method: "DELETE" });
  await req(`/api/links/${expiredSlug}`, { method: "DELETE" });
  await req(`/api/links/${qSlug}`, { method: "DELETE" });

  console.log("Smoke OK");
}

main().catch((err) => {
  console.error("Smoke FAILED", err);
  process.exit(1);
});
