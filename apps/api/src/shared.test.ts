import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isReservedSlug, parseDestination } from "@blink/shared";

describe("shared validation", () => {
  it("rejects reserved slugs", () => {
    assert.equal(isReservedSlug("api"), true);
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
