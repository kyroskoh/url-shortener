export type Link = {
  slug: string;
  destination: string;
  notes: string | null;
  status: "active" | "quarantined";
  hits: number;
  lastHitAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  shortUrl: string;
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
};

async function req<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: string; status: number }> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
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

export const api = {
  config: () => req<Config>("/config"),
  login: (password: string) =>
    req<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => req<{ authenticated: boolean }>("/auth/me"),
  list: (q?: string) =>
    req<{ links: Link[] }>(`/links${q ? `?q=${encodeURIComponent(q)}` : ""}`),
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
  setStatus: (slug: string, status: "active" | "quarantined") =>
    req<{ link: Link }>(`/links/${encodeURIComponent(slug)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  exportUrl: "/api/links/export.csv",
  qrUrl: (slug: string) => `/api/links/${encodeURIComponent(slug)}/qr`,
};
