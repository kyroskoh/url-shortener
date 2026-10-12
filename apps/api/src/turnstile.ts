import { config } from "./config.js";

export function turnstileEnabled(): boolean {
  return Boolean(config.turnstileSiteKey && config.turnstileSecretKey);
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!turnstileEnabled()) return true;
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
