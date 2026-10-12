import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkDestinationUrl,
  clearBlocklistCache,
  hostMatchesBlocklist,
} from "./url-check.js";

describe("hostMatchesBlocklist", () => {
  it("matches exact and parent domains", () => {
    const set = new Set(["bad.com", "evil.example"]);
    assert.equal(hostMatchesBlocklist("bad.com", set), true);
    assert.equal(hostMatchesBlocklist("sub.bad.com", set), true);
    assert.equal(hostMatchesBlocklist("deep.sub.bad.com", set), true);
    assert.equal(hostMatchesBlocklist("notbad.com", set), false);
    assert.equal(hostMatchesBlocklist("example.com", set), false);
  });

  it("does not treat IP literals as parent domains", () => {
    const set = new Set(["10.0.0.1"]);
    assert.equal(hostMatchesBlocklist("10.0.0.1", set), true);
    assert.equal(hostMatchesBlocklist("10.0.0.2", set), false);
  });
});

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

  it("rejects subdomains of blocklisted hosts", async () => {
    const r = await checkDestinationUrl("https://a.b.evil.example/x");
    assert.equal(r.ok, false);
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

describe("url-check http", () => {
  const prevProvider = process.env.BLINK_URL_CHECK_PROVIDER;
  const prevUrl = process.env.BLINK_URL_CHECK_HTTP_URL;
  const prevTimeout = process.env.BLINK_URL_CHECK_HTTP_TIMEOUT_MS;

  before(() => {
    process.env.BLINK_URL_CHECK_PROVIDER = "http";
    process.env.BLINK_URL_CHECK_HTTP_URL = "https://checker.test/check";
    process.env.BLINK_URL_CHECK_HTTP_TIMEOUT_MS = "2000";
  });

  after(() => {
    mock.restoreAll();
    if (prevProvider === undefined) delete process.env.BLINK_URL_CHECK_PROVIDER;
    else process.env.BLINK_URL_CHECK_PROVIDER = prevProvider;
    if (prevUrl === undefined) delete process.env.BLINK_URL_CHECK_HTTP_URL;
    else process.env.BLINK_URL_CHECK_HTTP_URL = prevUrl;
    if (prevTimeout === undefined) delete process.env.BLINK_URL_CHECK_HTTP_TIMEOUT_MS;
    else process.env.BLINK_URL_CHECK_HTTP_TIMEOUT_MS = prevTimeout;
  });

  it("fails closed when HTTP URL empty", async () => {
    delete process.env.BLINK_URL_CHECK_HTTP_URL;
    const r = await checkDestinationUrl("https://example.com");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /BLINK_URL_CHECK_HTTP_URL/i);
    process.env.BLINK_URL_CHECK_HTTP_URL = "https://checker.test/check";
  });

  it("allows when provider returns ok", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json({ ok: true }),
    );
    const r = await checkDestinationUrl("https://example.com/a");
    assert.equal(r.ok, true);
    mock.restoreAll();
  });

  it("rejects when provider denies", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json({ allowed: false, reason: "malware" }),
    );
    const r = await checkDestinationUrl("https://bad.test");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /malware/i);
    mock.restoreAll();
  });

  it("fails closed on non-2xx", async () => {
    mock.method(globalThis, "fetch", async () => new Response("err", { status: 503 }));
    const r = await checkDestinationUrl("https://example.com");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /HTTP 503/);
    mock.restoreAll();
  });

  it("fails closed on timeout", async () => {
    mock.method(globalThis, "fetch", async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });
    const r = await checkDestinationUrl("https://example.com");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /timed out/i);
    mock.restoreAll();
  });
});
