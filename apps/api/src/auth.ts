import argon2 from "argon2";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

let passwordHash: string | null = null;
let apiKeyHash: string | null = null;

async function ensureHash(value: string): Promise<string> {
  if (value.startsWith("$argon2")) return value;
  return argon2.hash(value);
}

export async function initAuth(): Promise<void> {
  passwordHash = await ensureHash(config.password);
  apiKeyHash = await ensureHash(config.apiKey);
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function verifyApiKey(key: string): Promise<boolean> {
  if (!apiKeyHash) return false;
  try {
    return await argon2.verify(apiKeyHash, key);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `admin:${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const parts = payload.split(":");
  const exp = Number(parts[1]);
  return parts[0] === "admin" && Number.isFinite(exp) && exp > Date.now();
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey === "string" && (await verifyApiKey(apiKey))) {
    return true;
  }
  const token = request.cookies?.blink_session;
  if (verifySessionToken(token)) {
    return true;
  }
  reply.code(401).send({ error: "unauthorized", message: "Authentication required" });
  return false;
}

export function clientIp(request: FastifyRequest): string {
  const cf = request.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) {
    return xff.split(",")[0].trim();
  }
  return request.ip;
}

export async function hashLinkPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyLinkPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Short-lived gate cookie after successful link password unlock (1 hour). */
export function createLinkGateToken(slug: string): string {
  const exp = Date.now() + 60 * 60 * 1000;
  const payload = `link:${slug}:${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyLinkGateToken(
  token: string | undefined,
  slug: string,
): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const parts = payload.split(":");
  if (parts[0] !== "link" || parts[1] !== slug) return false;
  const exp = Number(parts[2]);
  return Number.isFinite(exp) && exp > Date.now();
}

export function linkGateCookieName(slug: string): string {
  return `blink_gate_${slug}`;
}
