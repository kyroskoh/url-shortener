import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { importLinksCsv } from "./import-csv.js";

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
});
