import assert from "node:assert/strict";
import { test } from "node:test";
import { signWebhookBody, verifyWebhookSignature } from "./webhooks.js";

test("HMAC signature verifies with correct secret", () => {
  const body = JSON.stringify({ event: "hit", slug: "abc" });
  const sig = signWebhookBody("test-secret", body);
  assert.equal(verifyWebhookSignature("test-secret", body, sig), true);
});

test("HMAC signature rejects wrong secret", () => {
  const body = JSON.stringify({ event: "hit", slug: "abc" });
  const sig = signWebhookBody("test-secret", body);
  assert.equal(verifyWebhookSignature("other-secret", body, sig), false);
});

test("HMAC signature rejects missing header", () => {
  const body = "{}";
  assert.equal(verifyWebhookSignature("test-secret", body, undefined), false);
});
