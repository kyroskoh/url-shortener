import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkDestinationUrl, clearBlocklistCache } from "./url-check.js";

describe("url-check blocklist", () => {
  let path: string;
  const prevProvider = process.env.BLINK_URL_CHECK_PROVIDER;
  const prevPath = process.env.BLINK_URL_CHECK_BLOCKLIST_PATH;

  before(() => {
    const dir = mkdtempSync(join(tmpdir(), "blink-bl-"));
    path = join(dir, "blocklist.txt");
    writeFileSync(path, ["# comment", "evil.example", "phish.test", ""].join("\n"));
    process.env.BLINK_URL_CHECK_PROVIDER = "blocklist";
    process.env.BLINK_URL_CHECK_BLOCKLIST_PATH = path;
    clearBlocklistCache();
  });

  after(() => {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
    if (prevProvider === undefined) delete process.env.BLINK_URL_CHECK_PROVIDER;
    else process.env.BLINK_URL_CHECK_PROVIDER = prevProvider;
    if (prevPath === undefined) delete process.env.BLINK_URL_CHECK_BLOCKLIST_PATH;
    else process.env.BLINK_URL_CHECK_BLOCKLIST_PATH = prevPath;
    clearBlocklistCache();
  });

  it("rejects blocklisted hosts", async () => {
    const r = await checkDestinationUrl("https://evil.example/path");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /blocklisted/i);
  });

  it("allows clean hosts", async () => {
    const r = await checkDestinationUrl("https://example.com/ok");
    assert.equal(r.ok, true);
  });
});

describe("url-check none", () => {
  it("allows when provider is none", async () => {
    const prev = process.env.BLINK_URL_CHECK_PROVIDER;
    process.env.BLINK_URL_CHECK_PROVIDER = "none";
    try {
      const r = await checkDestinationUrl("https://evil.example");
      assert.equal(r.ok, true);
    } finally {
      if (prev === undefined) delete process.env.BLINK_URL_CHECK_PROVIDER;
      else process.env.BLINK_URL_CHECK_PROVIDER = prev;
    }
  });
});
