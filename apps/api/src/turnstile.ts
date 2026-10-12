import { config } from "./config.js";

export function turnstileKeysPresent(): boolean {
  return Boolean(config.turnstileSiteKey && config.turnstileSecretKey);
}

/** Required for public create when keys are set, or when FORCE is on. */
export function turnstileRequiredForPublic(): boolean {
  if (config.turnstileForce) return true;
  return turnstileKeysPresent();
}

export function turnstileEnabled(): boolean {
  return turnstileKeysPresent();
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!turnstileRequiredForPublic()) return true;

  if (config.turnstileForce && !turnstileKeysPresent()) {
    // Force without keys: reject public creates (misconfiguration)
    return false;
  }

  if (!token) return false;

  const body = new URLSearchParams();
  body.set("secret", config.turnstileSecretKey);
  body.set("response", token);
  body.set("remoteip", ip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}
