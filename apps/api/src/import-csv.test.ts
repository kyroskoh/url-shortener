import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  importLinksCsv,
  parseImportDateTime,
  parseImportTimezone,
} from "./import-csv.js";

describe("parseImportTimezone", () => {
  it("defaults empty to utc", () => {
    const r = parseImportTimezone("");
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, { kind: "utc" });
  });
  it("accepts UTC and Local", () => {
    const u = parseImportTimezone("UTC");
    const l = parseImportTimezone("Local");
    assert.equal(u.ok && u.value.kind, "utc");
    assert.equal(l.ok && l.value.kind, "local");
  });
  it("accepts SGT and IANA Asia/Singapore", () => {
    const sgt = parseImportTimezone("SGT");
    const iana = parseImportTimezone("Asia/Singapore");
    assert.equal(sgt.ok && sgt.value.kind === "iana" && sgt.value.iana, "Asia/Singapore");
    assert.equal(
      iana.ok && iana.value.kind === "iana" && iana.value.iana,
      "Asia/Singapore",
    );
  });
  it("rejects unknown abbreviations", () => {
    assert.equal(parseImportTimezone("NOTZONE").ok, false);
  });
});

describe("parseImportDateTime", () => {
  it("accepts ISO-8601", () => {
    const d = parseImportDateTime("2026-12-31T23:59:59.000Z");
    assert.ok(d);
    assert.equal(d.toISOString(), "2026-12-31T23:59:59.000Z");
  });

  it("accepts YYYY-MM-DD as UTC midnight", () => {
    const d = parseImportDateTime("2026-12-31", { kind: "utc" });
    assert.ok(d);
    assert.equal(d.toISOString(), "2026-12-31T00:00:00.000Z");
  });

  it("accepts space-separated datetime without timezone as UTC", () => {
    const d = parseImportDateTime("2026-06-01 09:30:00", { kind: "utc" });
    assert.ok(d);
    assert.equal(d.toISOString(), "2026-06-01T09:30:00.000Z");
  });

  it("interprets naive datetime as local when timezone=local", () => {
    const d = parseImportDateTime("2026-06-01 09:30:00", { kind: "local" });
    assert.ok(d);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 5);
    assert.equal(d.getDate(), 1);
    assert.equal(d.getHours(), 9);
    assert.equal(d.getMinutes(), 30);
  });

  it("interprets SGT wall time as UTC+8", () => {
    const d = parseImportDateTime("2026-06-01 09:30:00", {
      kind: "iana",
      iana: "Asia/Singapore",
    });
    assert.ok(d);
    assert.equal(d.toISOString(), "2026-06-01T01:30:00.000Z");
  });

  it("accepts unix epoch seconds", () => {
    const d = parseImportDateTime("1767225599");
    assert.ok(d);
    assert.equal(d.getTime(), 1767225599 * 1000);
  });

  it("rejects ambiguous slash dates", () => {
    assert.equal(parseImportDateTime("12/31/2026"), null);
    assert.equal(parseImportDateTime("31/12/2026"), null);
  });
});

describe("importLinksCsv dry-run", () => {
  it("reports invalid destination without writing", async () => {
    const csv = [
      "slug,destination,notes,expires_at",
      "ok,https://example.com/ok,,",
      "bad,javascript:alert(1),,",
    ].join("\n");
    const result = await importLinksCsv(csv, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.total, 2);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.rows[1]?.ok, false);
  });

  it("requires destination column in header", async () => {
    const result = await importLinksCsv("slug,notes\na,b\n", true);
    assert.equal(result.failed, 1);
    assert.match(result.rows[0]?.error ?? "", /destination/i);
  });

  it("accepts non-ISO expires_at and active_at", async () => {
    const csv = [
      "slug,destination,notes,expires_at,active_at,timezone,max_hits",
      "a,https://example.com/a,,2026-12-31,2026-06-01 00:00:00,UTC,",
    ].join("\n");
    const result = await importLinksCsv(csv, true);
    assert.equal(result.failed, 0);
    assert.equal(result.succeeded, 1);
  });

  it("accepts Local and SGT timezone columns", async () => {
    const csv = [
      "slug,destination,notes,expires_at,active_at,timezone,max_hits",
      "b,https://example.com/b,,2026-12-31 23:59:59,,Local,",
      "c,https://example.com/c,,2026-12-31 23:59:59,,SGT,",
    ].join("\n");
    const result = await importLinksCsv(csv, true);
    assert.equal(result.failed, 0);
    assert.equal(result.succeeded, 2);
  });
});
