export type Tag = { id: string; name: string };
export type Folder = { id: string; name: string; parentId: string | null };

export type Link = {
  slug: string;
  destination: string;
  notes: string | null;
  status: "active" | "paused" | "quarantined";
  hits: number;
  lastHitAt: string | null;
  expiresAt: string | null;
  activeAt: string | null;
  createdAt: string;
  updatedAt: string;
  shortUrl: string;
  hasPassword: boolean;
  oneTime: boolean;
  maxHits: number | null;
  folderId: string | null;
  tags: Tag[];
};

export type Config = {
  siteTitle: string;
  baseUrl: string;
  publicMode: boolean;
  disableFrontend: boolean;
  turnstileSiteKey: string | null;
  turnstileForce?: boolean;
  turnstileRequired: boolean;
  turnstileConfigured?: boolean;
  urlCheckProvider?: string;
  duplicateDestination?: "warn" | "block";
  customLanding?: boolean;
  adminPath?: string;
};

export type Preview = {
  title: string | null;
  favicon: string | null;
  cached: boolean;
};

export type HitSeries = {
  points: { t: string; hits: number }[];
};

export type InstanceStats = {
  totalLinks: number;
  activeLinks: number;
  pausedLinks: number;
  quarantinedLinks: number;
  hitsToday: number;
  hits7d: number;
  topSlugs: { slug: string; hits: number }[];
};

export type ImportResult = {
  dryRun: boolean;
  total: number;
  succeeded: number;
  failed: number;
  rows: { row: number; ok: boolean; slug?: string; error?: string }[];
};

async function req<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: string; status: number }> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && init?.body != null) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await res.json();
    if (!res.ok) {
      return {
        status: res.status,
        error: body.message ?? body.error ?? res.statusText,
      };
    }
    return { status: res.status, data: body as T };
  }
  if (!res.ok) {
    return { status: res.status, error: res.statusText };
  }
  return { status: res.status, data: undefined as T };
}

export type ListParams = {
  q?: string;
  tag?: string;
  folder?: string;
  cursor?: string;
  limit?: number;
};

function listQuery(params?: ListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.tag) sp.set("tag", params.tag);
  if (params.folder) sp.set("folder", params.folder);
  if (params.cursor) sp.set("cursor", params.cursor);
  if (params.limit != null) sp.set("limit", String(params.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  config: () => req<Config>("/config"),
  login: (password: string) =>
    req<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => req<{ authenticated: boolean }>("/auth/me"),
  stats: () => req<InstanceStats>("/stats"),
  list: (params?: ListParams) =>
    req<{ links: Link[]; nextCursor: string | null }>(
      `/links${listQuery(params)}`,
    ),
  create: (body: Record<string, unknown>) =>
    req<{ link: Link; warnings: string[] }>("/links", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (slug: string, body: Record<string, unknown>) =>
    req<{ link: Link }>(`/links/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (slug: string) =>
    req<{ ok: boolean }>(`/links/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    }),
  setStatus: (slug: string, status: "active" | "paused" | "quarantined") =>
    req<{ link: Link }>(`/links/${encodeURIComponent(slug)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  preview: (slug: string) =>
    req<Preview>(`/links/${encodeURIComponent(slug)}/preview`),
  hits: (slug: string, from?: string, to?: string) => {
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    const q = sp.toString();
    return req<HitSeries>(
      `/links/${encodeURIComponent(slug)}/hits${q ? `?${q}` : ""}`,
    );
  },
  importCsv: (csv: string, dryRun: boolean) =>
    req<ImportResult>(`/links/import?dryRun=${dryRun ? "true" : "false"}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: csv,
    }),
  tags: () => req<{ tags: Tag[] }>("/tags"),
  createTag: (name: string) =>
    req<{ tag: Tag }>("/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  folders: () => req<{ folders: Folder[] }>("/folders"),
  createFolder: (name: string, parentId?: string | null) =>
    req<{ folder: Folder }>("/folders", {
      method: "POST",
      body: JSON.stringify({ name, parentId: parentId ?? null }),
    }),
  exportUrl: "/api/links/export.csv",
  qrUrl: (slug: string) => `/api/links/${encodeURIComponent(slug)}/qr`,
};
