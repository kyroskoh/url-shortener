import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp } from "./preview.js";

describe("preview SSRF guards", () => {
  it("flags loopback and RFC1918", () => {
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("10.0.0.1"), true);
    assert.equal(isPrivateIp("192.168.1.1"), true);
    assert.equal(isPrivateIp("172.16.0.1"), true);
    assert.equal(isPrivateIp("169.254.1.1"), true);
  });

  it("allows public IPv4", () => {
    assert.equal(isPrivateIp("8.8.8.8"), false);
    assert.equal(isPrivateIp("1.1.1.1"), false);
  });
});
