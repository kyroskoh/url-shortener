/** Types aligned with packages/client/openapi.json (Blink API 0.4.0). */

export type Link = {
  slug: string;
  destination: string;
  notes: string | null;
  status: "active" | "quarantined";
  hits: number;
  lastHitAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  shortUrl: string;
  hasPassword: boolean;
  oneTime: boolean;
  maxHits: number | null;
  folderId?: string | null;
  tags?: { id: string; name: string }[];
};

export type LinkList = {
  links: Link[];
  nextCursor: string | null;
};

export type CreateLinkInput = {
  destination: string;
  slug?: string;
  notes?: string | null;
  expiresAt?: string | null;
  maxHits?: number | null;
  oneTime?: boolean;
  password?: string | null;
  tagNames?: string[];
  folderId?: string | null;
};

export type CreateLinkResponse = {
  link: Link;
  warnings: string[];
};

export type HitSeries = {
  points: { t: string; hits: number }[];
};
