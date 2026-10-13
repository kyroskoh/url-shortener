import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { initAuth } from "./auth.js";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { flushHitCounters } from "./links.js";
import { drainHits, redis } from "./redis.js";
import { handleRedirect, registerRoutes } from "./routes.js";

async function main() {
  await redis.connect();
  await migrate();
  await initAuth();

  const app = Fastify({
    logger: {
      level: "info",
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(cookie);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Blink API",
        description: "URL shortener API for layurl.com",
        version: "0.5.0",
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  app.addContentTypeParser(
    "text/plain",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );
  app.addContentTypeParser(
    "text/csv",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  await registerRoutes(app);

  // Direct slug redirects when not using /r/ prefix (local/dev convenience)
  app.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const { slug } = request.params;
    if (
      slug === "docs" ||
      slug === "health" ||
      slug === "ready" ||
      slug === "config" ||
      slug === "links" ||
      slug === "auth" ||
      slug === "r" ||
      slug === "tags" ||
      slug === "folders" ||
      slug === "site-home" ||
      slug === "admin" ||
      slug === "metrics" ||
      slug === "stats"
    ) {
      return reply.callNotFound();
    }
    return handleRedirect(slug, request, reply);
  });

  const flushTimer = setInterval(async () => {
    try {
      const counts = await drainHits();
      if (counts.size) await flushHitCounters(counts);
    } catch (err) {
      app.log.error({ err }, "hit flush failed");
    }
  }, 5000);
  flushTimer.unref();

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`Blink API listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
