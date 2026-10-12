#!/usr/bin/env node
import { BlinkClient } from "@blink/client";

function usage(): never {
  console.error(`Usage:
  blink create <destination> [--slug SLUG] [--notes TEXT] [--max-hits N]
  blink list [--limit N] [--cursor CURSOR]
  blink delete <slug>

Env:
  BLINK_BASE_URL   Public origin (default http://localhost) — API at {origin}/api
  BLINK_API_KEY    Admin API key
`);
  process.exit(1);
}

function clientFromEnv(): BlinkClient {
  const origin = (process.env.BLINK_BASE_URL ?? "http://localhost").replace(
    /\/$/,
    "",
  );
  const apiKey = process.env.BLINK_API_KEY ?? "";
  if (!apiKey) {
    console.error("BLINK_API_KEY is required");
    process.exit(1);
  }
  return new BlinkClient({ baseUrl: `${origin}/api`, apiKey });
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd) usage();

  const client = clientFromEnv();

  if (cmd === "create") {
    const destination = rest[0];
    if (!destination) usage();
    const slug = flag(rest, "--slug");
    const notes = flag(rest, "--notes");
    const maxHitsRaw = flag(rest, "--max-hits");
    const maxHits =
      maxHitsRaw != null && maxHitsRaw !== ""
        ? Number(maxHitsRaw)
        : undefined;
    const res = await client.create({
      destination,
      slug,
      notes: notes ?? null,
      maxHits: Number.isFinite(maxHits) ? maxHits : undefined,
    });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (cmd === "list") {
    const limitRaw = flag(rest, "--limit");
    const cursor = flag(rest, "--cursor");
    const limit =
      limitRaw != null && limitRaw !== "" ? Number(limitRaw) : undefined;
    const res = await client.list({
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor,
    });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (cmd === "delete") {
    const slug = rest[0];
    if (!slug) usage();
    const res = await client.delete(slug);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
