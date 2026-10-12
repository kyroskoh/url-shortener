import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

const CACHE_PREFIX = "blink:redir:";
const HITS_PREFIX = "blink:hits:";
const RATE_PREFIX = "blink:rate:";
const PREVIEW_PREFIX = "blink:preview:";

export async function cacheGet(slug: string): Promise<string | null> {
  return redis.get(CACHE_PREFIX + slug);
}

export async function cacheSet(slug: string, destination: string): Promise<void> {
  await redis.set(CACHE_PREFIX + slug, destination, "EX", config.cacheTtlSec);
}

export async function cacheDel(slug: string): Promise<void> {
  await redis.del(CACHE_PREFIX + slug);
}

export async function bumpHit(slug: string): Promise<void> {
  await redis.incr(HITS_PREFIX + slug);
}

export async function drainHits(): Promise<Map<string, number>> {
  const keys = await redis.keys(HITS_PREFIX + "*");
  const out = new Map<string, number>();
  for (const key of keys) {
    const n = await redis.getdel(key);
    if (n) out.set(key.slice(HITS_PREFIX.length), Number(n));
  }
  return out;
}

export async function rateLimit(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = RATE_PREFIX + ip;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, config.rateLimitWindowSec);
  }
  const allowed = count <= config.rateLimitMax;
  return { allowed, remaining: Math.max(0, config.rateLimitMax - count) };
}

export async function previewCacheGet(slug: string): Promise<string | null> {
  return redis.get(PREVIEW_PREFIX + slug);
}

export async function previewCacheSet(slug: string, json: string): Promise<void> {
  await redis.set(PREVIEW_PREFIX + slug, json, "EX", config.previewTtlSec);
}

export async function previewCacheDel(slug: string): Promise<void> {
  await redis.del(PREVIEW_PREFIX + slug);
}
