import { createHmac, timingSafeEqual } from "node:crypto";
import { config, shortUrl } from "./config.js";

export type HitWebhookPayload = {
  event: "hit";
  slug: string;
  at: string;
  shortUrl: string;
};

export function signWebhookBody(secret: string, body: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expected = signWebhookBody(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function notifyHitWebhook(slug: string): void {
  const url = config.webhookUrl.trim();
  if (!url) return;

  const payload: HitWebhookPayload = {
    event: "hit",
    slug,
    at: new Date().toISOString(),
    shortUrl: shortUrl(slug),
  };
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "Blink-Webhook/1.0",
  };
  const secret = config.webhookSecret;
  if (secret) {
    headers["x-blink-signature"] = signWebhookBody(secret, body);
  }

  void fetch(url, { method: "POST", headers, body }).catch(() => {
    // fire-and-forget; failures are non-fatal on the redirect path
  });
}
