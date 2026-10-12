import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import {
  clientIp,
  createSessionToken,
  requireAdmin,
  verifyPassword,
} from "./auth.js";
import { gonePage, notFoundPage } from "./branded-pages.js";
import { config, shortUrl } from "./config.js";
import { queryClient } from "./db/client.js";
import {
  createLink,
  deleteLink,
  exportCsv,
  getLink,
  listLinks,
  resolveRedirect,
  updateLink,
} from "./links.js";
import { rateLimit, redis } from "./redis.js";
import { turnstileEnabled, verifyTurnstile } from "./turnstile.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/healthz") || request.url.startsWith("/readyz")) {
      return;
    }
    const { allowed } = await rateLimit(clientIp(request));
    if (!allowed) {
      return reply.code(429).send({
        error: "rate_limited",
        message: "Too many requests",
      });
    }
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/readyz", async (_req, reply) => {
    try {
      await queryClient`SELECT 1`;
      const pong = await redis.ping();
      if (pong !== "PONG") throw new Error("redis");
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.get("/config", async () => ({
    siteTitle: config.siteTitle,
    baseUrl: config.baseUrl,
    publicMode: config.publicMode,
    disableFrontend: config.disableFrontend,
    turnstileSiteKey: config.turnstileSiteKey || null,
    turnstileRequired: turnstileEnabled() && config.publicMode,
  }));

  app.post<{ Body: { password?: string } }>("/auth/login", async (request, reply) => {
    const password = request.body?.password ?? "";
    if (!(await verifyPassword(password))) {
      return reply
        .code(401)
        .send({ error: "invalid_credentials", message: "Invalid password" });
    }
    const token = createSessionToken();
    reply.setCookie("blink_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.baseUrl.startsWith("https"),
      maxAge: 7 * 24 * 60 * 60,
    });
    return { ok: true };
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie("blink_session", { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    return { authenticated: true };
  });

  app.get("/links", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const q = (request.query as { q?: string }).q;
    return { links: await listLinks(q) };
  });

  app.get("/links/export.csv", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const csv = await exportCsv();
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="blink-links.csv"');
    return csv;
  });

  app.post("/links", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const isAdmin =
      (await requireAdminQuiet(request)) === true;

    if (!isAdmin) {
      if (!config.publicMode) {
        return reply
          .code(401)
          .send({ error: "unauthorized", message: "Authentication required" });
      }
      const token =
        typeof body.turnstileToken === "string" ? body.turnstileToken : undefined;
      if (!(await verifyTurnstile(token, clientIp(request)))) {
        return reply.code(400).send({
          error: "turnstile_failed",
          message: "Turnstile verification failed",
        });
      }
    }

    const result = await createLink({
      destination: String(body.destination ?? ""),
      slug: body.slug ? String(body.slug) : undefined,
      notes: body.notes != null ? String(body.notes) : null,
      expiresAt: body.expiresAt != null ? String(body.expiresAt) : null,
    });

    if (!result.ok) {
      return reply
        .code(result.status)
        .send({ error: result.error, message: result.message });
    }
    return reply.code(201).send({ link: result.link, warnings: result.warnings });
  });

  app.get<{ Params: { slug: string } }>("/links/:slug", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const link = await getLink(request.params.slug);
    if (!link) {
      return reply.code(404).send({ error: "not_found", message: "Link not found" });
    }
    return { link };
  });

  app.patch<{ Params: { slug: string } }>("/links/:slug", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const body = request.body as Record<string, unknown>;
    const result = await updateLink(request.params.slug, {
      destination: body.destination != null ? String(body.destination) : undefined,
      notes: body.notes === undefined ? undefined : (body.notes as string | null),
      expiresAt:
        body.expiresAt === undefined ? undefined : (body.expiresAt as string | null),
    });
    if (!result.ok) {
      return reply
        .code(result.status)
        .send({ error: result.error, message: result.message });
    }
    return { link: result.link };
  });

  app.delete<{ Params: { slug: string } }>("/links/:slug", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const ok = await deleteLink(request.params.slug);
    if (!ok) {
      return reply.code(404).send({ error: "not_found", message: "Link not found" });
    }
    return { ok: true };
  });

  app.get<{ Params: { slug: string } }>("/links/:slug/qr", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const link = await getLink(request.params.slug);
    if (!link) {
      return reply.code(404).send({ error: "not_found", message: "Link not found" });
    }
    const png = await QRCode.toBuffer(shortUrl(link.slug), { type: "png", width: 256 });
    reply.header("content-type", "image/png");
    return reply.send(png);
  });

  app.get<{ Params: { slug: string } }>("/r/:slug", async (request, reply) => {
    return handleRedirect(request.params.slug, reply);
  });
}

async function requireAdminQuiet(
  request: Parameters<typeof requireAdmin>[0],
): Promise<boolean> {
  const { verifyApiKey, verifySessionToken } = await import("./auth.js");
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey === "string" && (await verifyApiKey(apiKey))) return true;
  return verifySessionToken(request.cookies?.blink_session);
}

export async function handleRedirect(
  slug: string,
  reply: import("fastify").FastifyReply,
): Promise<void> {
  const result = await resolveRedirect(slug);
  if (result.status === "missing") {
    reply.code(404).type("text/html").send(notFoundPage());
    return;
  }
  if (result.status === "expired") {
    reply.code(410).type("text/html").send(gonePage());
    return;
  }
  reply.redirect(result.destination, 302);
}
