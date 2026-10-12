import client from "prom-client";

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const redirectsTotal = new client.Counter({
  name: "blink_redirects_total",
  help: "Successful short-link redirects",
  registers: [register],
});

export const cacheHitsTotal = new client.Counter({
  name: "blink_cache_hits_total",
  help: "Redirect destination served from Redis cache",
  registers: [register],
});

export const cacheMissesTotal = new client.Counter({
  name: "blink_cache_misses_total",
  help: "Redirect destination loaded without Redis cache hit",
  registers: [register],
});

export async function metricsText(): Promise<string> {
  return register.metrics();
}
