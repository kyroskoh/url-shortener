import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CACHE_BYPASS_EXPRESSION,
  missingCredentials,
  plannedDnsRecords,
  plannedZoneSettings,
} from "./cloudflare-lib.mjs";

describe("cloudflare-lib", () => {
  it("plans apex and www A/AAAA when manageWww", () => {
    const recs = plannedDnsRecords({
      zoneName: "layurl.com",
      ipv4: "1.2.3.4",
      ipv6: "2001:db8::1",
      manageWww: true,
    });
    assert.deepEqual(
      recs.map((r) => `${r.type} ${r.name}`),
      [
        "A layurl.com",
        "A www.layurl.com",
        "AAAA layurl.com",
        "AAAA www.layurl.com",
      ],
    );
  });

  it("skips www when manageWww false", () => {
    const recs = plannedDnsRecords({
      zoneName: "layurl.com",
      ipv4: "1.2.3.4",
      manageWww: false,
    });
    assert.equal(recs.length, 1);
    assert.equal(recs[0].name, "layurl.com");
  });

  it("requires token zone and origin IP", () => {
    assert.deepEqual(missingCredentials({}), [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ZONE_ID",
      "CLOUDFLARE_ORIGIN_IPV4 or CLOUDFLARE_ORIGIN_IPV6",
    ]);
    assert.deepEqual(
      missingCredentials({
        token: "t",
        zoneId: "z",
        ipv4: "1.1.1.1",
      }),
      [],
    );
  });

  it("plans Full strict TLS settings", () => {
    const settings = Object.fromEntries(plannedZoneSettings());
    assert.equal(settings.ssl, "strict");
    assert.equal(settings.always_use_https, "on");
    assert.equal(settings.min_tls_version, "1.2");
  });

  it("exports cache bypass expression for slugs", () => {
    assert.match(CACHE_BYPASS_EXPRESSION, /A-Za-z0-9_/);
    assert.match(CACHE_BYPASS_EXPRESSION, /\/api/);
  });
});
