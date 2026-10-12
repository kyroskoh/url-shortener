import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyUtmParams, isReservedSlug, parseDestination } from "@blink/shared";

describe("shared validation", () => {
  it("rejects reserved slugs", () => {
    assert.equal(isReservedSlug("api"), true);
    assert.equal(isReservedSlug("admin"), true);
    assert.equal(isReservedSlug("hello"), false);
  });

  it("rejects dangerous schemes", () => {
    const r = parseDestination("javascript:alert(1)");
    assert.equal(r.ok, false);
  });

  it("accepts https", () => {
    const r = parseDestination("https://example.com/path");
    assert.equal(r.ok, true);
    if (r.ok) assert.match(r.url, /^https:\/\/example\.com/);
  });
});

describe("applyUtmParams", () => {
  it("appends UTM without dropping existing query", () => {
    const out = applyUtmParams("https://example.com/path?ref=1", {
      utmSource: "newsletter",
      utmMedium: "email",
    });
    const u = new URL(out);
    assert.equal(u.searchParams.get("ref"), "1");
    assert.equal(u.searchParams.get("utm_source"), "newsletter");
    assert.equal(u.searchParams.get("utm_medium"), "email");
  });

  it("overwrites existing utm_source when provided", () => {
    const out = applyUtmParams("https://example.com/?utm_source=old", {
      utmSource: "new",
    });
    assert.equal(new URL(out).searchParams.get("utm_source"), "new");
  });

  it("leaves non-http destinations unchanged", () => {
    const magnet = "magnet:?xt=urn:btih:abc";
    assert.equal(applyUtmParams(magnet, { utmSource: "x" }), magnet);
  });

  it("no-ops when all UTM empty", () => {
    const dest = "https://example.com/";
    assert.equal(applyUtmParams(dest, {}), dest);
  });
});
