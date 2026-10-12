import type {
  CreateLinkInput,
  CreateLinkResponse,
  HitSeries,
  LinkList,
} from "./types.js";

export type * from "./types.js";

export type BlinkClientOptions = {
  /** API origin including /api prefix, e.g. http://localhost/api */
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export class BlinkClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: BlinkClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetch ?? fetch;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("x-api-key", this.apiKey);
    if (init?.body != null && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = json as { message?: string; error?: string } | null;
      throw new Error(
        err?.message ?? err?.error ?? `HTTP ${res.status} ${res.statusText}`,
      );
    }
    return json as T;
  }

  health(): Promise<{ ok: boolean }> {
    return this.request("/health");
  }

  list(params?: {
    q?: string;
    tag?: string;
    folder?: string;
    cursor?: string;
    limit?: number;
  }): Promise<LinkList> {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.tag) sp.set("tag", params.tag);
    if (params?.folder) sp.set("folder", params.folder);
    if (params?.cursor) sp.set("cursor", params.cursor);
    if (params?.limit != null) sp.set("limit", String(params.limit));
    const q = sp.toString();
    return this.request(`/links${q ? `?${q}` : ""}`);
  }

  create(
    input: CreateLinkInput,
    opts?: { idempotencyKey?: string },
  ): Promise<CreateLinkResponse> {
    const headers: Record<string, string> = {};
    if (opts?.idempotencyKey) {
      headers["idempotency-key"] = opts.idempotencyKey;
    }
    return this.request("/links", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  }

  delete(slug: string): Promise<{ ok: boolean }> {
    return this.request(`/links/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
  }

  hits(slug: string, from?: string, to?: string): Promise<HitSeries> {
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    const q = sp.toString();
    return this.request(
      `/links/${encodeURIComponent(slug)}/hits${q ? `?${q}` : ""}`,
    );
  }
}
