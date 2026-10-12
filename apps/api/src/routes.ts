import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import QRCode from "qrcode";
import {
  clientIp,
  createLinkGateToken,
  createSessionToken,
  linkGateCookieName,
  requireAdmin,
  verifyLinkGateToken,
  verifyLinkPassword,
  verifyPassword,
} from "./auth.js";
import {
  gonePage,
  notFoundPage,
  passwordGatePage,
  quarantinedPage,
} from "./branded-pages.js";
import { config, shortUrl } from "./config.js";
import { queryClient } from "./db/client.js";
import { importLinksCsv } from "./import-csv.js";
import { hasLandingPageConfigured, readLandingPage } from "./landing.js";
import {
  burnOneTimeLink,
  createLink,
  deleteLink,
  exportCsv,
  getLink,
  getLinkRow,
  listLinks,
  resolveRedirect,
  setLinkStatus,
  updateLink,
} from "./links.js";
import { getLinkPreview } from "./preview.js";
import { rateLimit, redis } from "./redis.js";
import {
  createFolder,
  createTag,
  deleteFolder,
  deleteTag,
  listFolders,
  listTags,
} from "./tags-folders.js";
import {
  turnstileKeysPresent,
  turnstileRequiredForPublic,
  verifyTurnstile,
} from "./turnstile.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(formbody);

  app.addHook("onRequest", async (request, reply) => {
    if (
      request.url.startsWith("/healthz") ||
      request.url.startsWith("/readyz") ||
      request.url.startsWith("/site-home")
    ) {
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
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.get("/site-home", async (_req, reply) => {
    if (hasLandingPageConfigured()) {
      const html = await readLandingPage();
      if (html) {
        return reply.type("text/html").send(html);
      }
    }
    return reply.redirect("/admin/", 302);
  });

  app.get("/config", async () => ({
    siteTitle: config.siteTitle,
    baseUrl: config.baseUrl,
    publicMode: config.publicMode,
    disableFrontend: config.disableFrontend,
    turnstileSiteKey: config.turnstileSiteKey || null,
    turnstileForce: config.turnstileForce,
    turnstileRequired: config.publicMode && turnstileRequiredForPublic(),
    turnstileConfigured: turnstileKeysPresent(),
    urlCheckProvider: config.urlCheckProvider,
    customLanding: hasLandingPageConfigured(),
    adminPath: "/admin/",
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

  app.get("/tags", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    return { tags: await listTags() };
  });

  app.post<{ Body: { name?: string } }>("/tags", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const result = await createTag(String(request.body?.name ?? ""));
    if ("error" in result) {
      return reply.code(400).send({ error: "validation_error", message: result.error });
    }
    return reply.code(201).send({ tag: result });
  });

  app.delete<{ Params: { id: string } }>("/tags/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const ok = await deleteTag(request.params.id);
    if (!ok) {
      return reply.code(404).send({ error: "not_found", message: "Tag not found" });
    }
    return { ok: true };
  });

  app.get("/folders", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    return { folders: await listFolders() };
  });

  app.post<{ Body: { name?: string; parentId?: string | null } }>(
    "/folders",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const result = await createFolder(
        String(request.body?.name ?? ""),
        request.body?.parentId,
      );
      if ("error" in result) {
        return reply.code(400).send({ error: "validation_error", message: result.error });
      }
      return reply.code(201).send({ folder: result });
    },
  );

  app.delete<{ Params: { id: string } }>("/folders/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const ok = await deleteFolder(request.params.id);
    if (!ok) {
      return reply.code(404).send({ error: "not_found", message: "Folder not found" });
    }
    return { ok: true };
  });

  app.get("/links", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const q = request.query as { q?: string; tag?: string; folder?: string };
    return { links: await listLinks({ q: q.q, tag: q.tag, folder: q.folder }) };
  });

  app.get("/links/export.csv", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const csv = await exportCsv();
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="blink-links.csv"');
    return csv;
  });

  app.post("/links/import", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const dryRun =
      (request.query as { dryRun?: string }).dryRun === "true" ||
      (request.query as { dryRun?: string }).dryRun === "1";
    let csvText = "";
    if (typeof request.body === "string") {
      csvText = request.body;
    } else if (
      request.body &&
      typeof request.body === "object" &&
      "csv" in (request.body as object)
    ) {
      csvText = String((request.body as { csv: unknown }).csv ?? "");
    } else {
      return reply.code(400).send({
        error: "validation_error",
        message: "Send CSV as text/plain body or JSON { csv }",
      });
    }
    const result = await importLinksCsv(csvText, dryRun);
    return result;
  });

  app.post("/links", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const isAdmin = (await requireAdminQuiet(request)) === true;

    if (!isAdmin) {
      if (!config.publicMode) {
        return reply
          .code(401)
          .send({ error: "unauthorized", message: "Authentication required" });
      }
      const token =
        typeof body.turnstileToken === "string" ? body.turnstileToken : undefined;
      if (!(await verifyTurnstile(token, clientIp(request)))) {
        const msg =
          config.turnstileForce && !turnstileKeysPresent()
            ? "Turnstile is forced but keys are not configured"
            : "Turnstile verification failed";
        return reply.code(400).send({
          error: "turnstile_failed",
          message: msg,
        });
      }
    }

    const result = await createLink({
      destination: String(body.destination ?? ""),
      slug: body.slug ? String(body.slug) : undefined,
      notes: body.notes != null ? String(body.notes) : null,
      expiresAt: body.expiresAt != null ? String(body.expiresAt) : null,
      utmSource: body.utmSource != null ? String(body.utmSource) : undefined,
      utmMedium: body.utmMedium != null ? String(body.utmMedium) : undefined,
      utmCampaign: body.utmCampaign != null ? String(body.utmCampaign) : undefined,
      utmTerm: body.utmTerm != null ? String(body.utmTerm) : undefined,
      utmContent: body.utmContent != null ? String(body.utmContent) : undefined,
      password: body.password != null ? String(body.password) : undefined,
      oneTime: body.oneTime === true || body.oneTime === "true",
      tagNames: Array.isArray(body.tagNames)
        ? body.tagNames.map(String)
        : undefined,
      tagIds: Array.isArray(body.tagIds) ? body.tagIds.map(String) : undefined,
      folderId:
        body.folderId === null
          ? null
          : body.folderId != null
            ? String(body.folderId)
            : undefined,
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

  app.get<{ Params: { slug: string } }>(
    "/links/:slug/preview",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const result = await getLinkPreview(request.params.slug);
      if (!result.ok) {
        return reply
          .code(result.status)
          .send({ error: result.error, message: result.message });
      }
      return {
        title: result.title,
        favicon: result.favicon,
        cached: result.cached,
      };
    },
  );

  app.patch<{ Params: { slug: string } }>("/links/:slug", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const body = request.body as Record<string, unknown>;
    const result = await updateLink(request.params.slug, {
      destination: body.destination != null ? String(body.destination) : undefined,
      notes: body.notes === undefined ? undefined : (body.notes as string | null),
      expiresAt:
        body.expiresAt === undefined ? undefined : (body.expiresAt as string | null),
      status:
        body.status === "active" || body.status === "quarantined"
          ? body.status
          : undefined,
      password: body.password != null ? String(body.password) : undefined,
      clearPassword: body.clearPassword === true,
      oneTime:
        body.oneTime === undefined
          ? undefined
          : body.oneTime === true || body.oneTime === "true",
      tagNames: Array.isArray(body.tagNames)
        ? body.tagNames.map(String)
        : undefined,
      tagIds: Array.isArray(body.tagIds) ? body.tagIds.map(String) : undefined,
      folderId:
        body.folderId === undefined
          ? undefined
          : body.folderId === null
            ? null
            : String(body.folderId),
    });
    if (!result.ok) {
      return reply
        .code(result.status)
        .send({ error: result.error, message: result.message });
    }
    return { link: result.link };
  });

  app.post<{ Params: { slug: string }; Body: { status?: string } }>(
    "/links/:slug/status",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const status = request.body?.status;
      if (status !== "active" && status !== "quarantined") {
        return reply.code(400).send({
          error: "validation_error",
          message: "Status must be active or quarantined",
        });
      }
      const result = await setLinkStatus(request.params.slug, status);
      if (!result.ok) {
        return reply
          .code(result.status)
          .send({ error: result.error, message: result.message });
      }
      return { link: result.link };
    },
  );

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
    return handleRedirect(request.params.slug, request, reply);
  });

  app.post<{ Params: { slug: string }; Body: { password?: string } }>(
    "/r/:slug/unlock",
    async (request, reply) => {
      const slug = request.params.slug;
      const row = await getLinkRow(slug);
      if (!row || row.status === "quarantined") {
        return reply.code(404).type("text/html").send(notFoundPage());
      }
      if (!row.passwordHash) {
        return reply.redirect(`/${encodeURIComponent(slug)}`, 302);
      }
      const password = String(request.body?.password ?? "");
      if (!(await verifyLinkPassword(row.passwordHash, password))) {
        return reply
          .code(401)
          .type("text/html")
          .send(passwordGatePage(slug, "Incorrect password"));
      }
      const token = createLinkGateToken(slug);
      reply.setCookie(linkGateCookieName(slug), token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.baseUrl.startsWith("https"),
        maxAge: 60 * 60,
      });
      return handleRedirect(slug, request, reply, true);
    },
  );
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
  request: FastifyRequest,
  reply: FastifyReply,
  forceUnlocked = false,
): Promise<void> {
  const gateCookie = request.cookies?.[linkGateCookieName(slug)];
  const gateUnlocked =
    forceUnlocked || verifyLinkGateToken(gateCookie, slug);

  const result = await resolveRedirect(slug, { gateUnlocked });
  if (result.status === "missing") {
    reply.code(404).type("text/html").send(notFoundPage());
    return;
  }
  if (result.status === "expired") {
    reply.code(410).type("text/html").send(gonePage());
    return;
  }
  if (result.status === "quarantined") {
    reply.code(410).type("text/html").send(quarantinedPage());
    return;
  }
  if (result.status === "password_required") {
    reply.code(401).type("text/html").send(passwordGatePage(slug));
    return;
  }

  if (result.oneTime) {
    await burnOneTimeLink(result.slug);
  }
  reply.redirect(result.destination, 302);
}
